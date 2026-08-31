import type { BatchItem } from "drizzle-orm/batch";

import { db } from "@/lib/db/client";

/**
 * Runs several writes as one transaction.
 *
 * The neon-http driver has no interactive transactions — db.transaction()
 * throws outright — so batch, which Neon executes as a single transaction over
 * one HTTP request, is the only way to make multiple statements commit or fail
 * together. Every mutation that pairs a row change with a
 * pending_object_deletions entry depends on that guarantee.
 *
 * Takes a plain array because callers build the list conditionally (a song may
 * have no tracks to orphan), while db.batch insists on a non-empty tuple.
 */
export async function runAtomically(
  queries: Array<BatchItem<"pg">>,
): Promise<void> {
  if (queries.length === 0) return;

  if (queries.length === 1) {
    await queries[0];
    return;
  }

  await db.batch(queries as [BatchItem<"pg">, ...Array<BatchItem<"pg">>]);
}
