import { and, asc, eq, isNull, lte, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { pendingObjectDeletions, tracks } from "@/lib/db/schema";
import { deleteObject } from "@/lib/r2";

/**
 * Deferred deletion of R2 objects.
 *
 * The rule this module exists to enforce: the database is the source of truth,
 * and the bucket is allowed to lag behind it. A mutation drops its reference in
 * Postgres and enqueues the orphaned key here in the same transaction; the
 * bucket is only touched later, by the sweeper.
 *
 * That ordering is deliberately asymmetric. If the sweeper never runs, the
 * result is an object nobody links to — it costs a few cents of storage and is
 * invisible to users. If deletion ran first and the database write then failed,
 * the result would be a live song row pointing at a 404, which choristers hit
 * as a player that silently refuses to load. Between those two failure modes,
 * only one is recoverable without anybody noticing.
 */

/**
 * How long an orphaned object survives after losing its last reference.
 *
 * Not a queue delay but a safety margin. Audio is served with a one-year
 * immutable cache, so at the moment a kit is replaced there may be a browser
 * mid-stream on the old object and CDN nodes still holding it. A week is far
 * longer than any listening session, and short enough that mistakes are still
 * cheap to reverse by hand.
 */
export const DELETION_GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

/** Stops one poisoned key from being retried by the sweeper forever. */
const MAX_PURGE_ATTEMPTS = 5;

/**
 * Builds the insert that enqueues a key, without running it.
 *
 * Returned unexecuted so callers can pass it to db.batch alongside the write
 * that drops the reference: the neon-http driver has no interactive
 * transactions, so a batch is the only way to make "forget the object" and
 * "remember to delete it" commit or fail together.
 */
export function enqueueObjectDeletion(objectKey: string, reason: string) {
  return db.insert(pendingObjectDeletions).values({
    objectKey,
    reason,
    purgeAfter: new Date(Date.now() + DELETION_GRACE_PERIOD_MS),
  });
}

export interface PurgeReport {
  purged: string[];
  failed: Array<{ objectKey: string; error: string }>;
  /** Rows left alone because their grace period has not elapsed. */
  pending: number;
}

/**
 * Deletes objects whose grace period has passed.
 *
 * Idempotent and safe to re-run: each row is marked purged only after R2
 * confirms the delete, and R2 (like S3) treats deleting an absent key as
 * success, so a crash between the two leaves at worst a row that gets retried
 * and immediately succeeds.
 *
 * Intended to run from scripts/purge-pending-objects.ts on a schedule, not
 * from a request.
 */
export async function purgeExpiredObjects(
  options: { limit?: number } = {},
): Promise<PurgeReport> {
  const limit = options.limit ?? 100;

  const due = await db
    .select()
    .from(pendingObjectDeletions)
    .where(
      and(
        isNull(pendingObjectDeletions.purgedAt),
        lte(pendingObjectDeletions.purgeAfter, new Date()),
        lte(pendingObjectDeletions.attempts, MAX_PURGE_ATTEMPTS),
      ),
    )
    .orderBy(asc(pendingObjectDeletions.purgeAfter))
    .limit(limit);

  const report: PurgeReport = { purged: [], failed: [], pending: 0 };

  for (const row of due) {
    // A key can be re-enqueued if it was replaced twice, and an admin could in
    // principle re-upload an identical key. Deleting an object some live row
    // now points at would be exactly the failure this module exists to avoid,
    // so the reference check happens immediately before the delete.
    if (await isStillReferenced(row.objectKey)) {
      await db
        .update(pendingObjectDeletions)
        .set({ purgedAt: new Date(), lastError: "still referenced; skipped" })
        .where(eq(pendingObjectDeletions.id, row.id));
      continue;
    }

    try {
      await deleteObject(row.objectKey);

      await db
        .update(pendingObjectDeletions)
        .set({ purgedAt: new Date(), lastError: null })
        .where(eq(pendingObjectDeletions.id, row.id));

      report.purged.push(row.objectKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      await db
        .update(pendingObjectDeletions)
        .set({
          attempts: sql`${pendingObjectDeletions.attempts} + 1`,
          lastError: message,
        })
        .where(eq(pendingObjectDeletions.id, row.id));

      report.failed.push({ objectKey: row.objectKey, error: message });
    }
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(pendingObjectDeletions)
    .where(isNull(pendingObjectDeletions.purgedAt));

  report.pending = count;

  return report;
}

async function isStillReferenced(objectKey: string): Promise<boolean> {
  const rows = await db
    .select({ id: tracks.id })
    .from(tracks)
    .where(eq(tracks.objectKey, objectKey))
    .limit(1);

  return rows.length > 0;
}
