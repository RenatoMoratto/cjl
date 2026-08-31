/**
 * Deletes R2 objects that no song or track references any more.
 *
 *   npx tsx scripts/purge-pending-objects.ts [--dry-run] [--limit=100]
 *
 * Mutations never delete from the bucket themselves. They drop the reference
 * in Neon and enqueue the orphaned key in pending_object_deletions, and this
 * script is what eventually empties that queue — only for entries whose grace
 * period has elapsed, and only after re-checking that nothing has come to
 * reference the key again. See src/services/storage-cleanup.ts.
 *
 * Safe to run on a schedule and safe to re-run after a partial failure: rows
 * are marked purged only once R2 confirms the delete, and deleting an object
 * that is already gone succeeds.
 *
 * Running it is never urgent. Skipping it costs storage; running it early
 * would cut off a chorister mid-stream, which is why the grace period exists.
 */

import { config } from "dotenv";
import { and, isNull, lte } from "drizzle-orm";

config({ path: ".env.local" });

const dryRun = process.argv.includes("--dry-run");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : 100;

async function main() {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error(`--limit must be a positive integer, got: ${limit}`);
  }

  const { db } = await import("../src/lib/db/client");
  const { pendingObjectDeletions } = await import("../src/lib/db/schema");
  const { purgeExpiredObjects } = await import(
    "../src/services/storage-cleanup"
  );

  if (dryRun) {
    const due = await db
      .select()
      .from(pendingObjectDeletions)
      .where(
        and(
          isNull(pendingObjectDeletions.purgedAt),
          lte(pendingObjectDeletions.purgeAfter, new Date()),
        ),
      )
      .limit(limit);

    console.log(`\n${due.length} object(s) due for deletion (dry run):\n`);

    for (const row of due) {
      console.log(`  ${row.objectKey}\n    reason: ${row.reason}`);
    }

    if (due.length === 0) console.log("  (nothing due)");
    return;
  }

  const report = await purgeExpiredObjects({ limit });

  console.log(`\nPurged ${report.purged.length} object(s):\n`);
  for (const key of report.purged) console.log(`  ${key}`);
  if (report.purged.length === 0) console.log("  (nothing due)");

  if (report.failed.length > 0) {
    console.error(`\n${report.failed.length} failure(s):\n`);
    for (const failure of report.failed) {
      console.error(`  ${failure.objectKey} — ${failure.error}`);
    }
  }

  console.log(`\n${report.pending} entr(ies) still queued.`);

  if (report.failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
