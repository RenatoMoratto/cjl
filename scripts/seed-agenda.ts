/**
 * Seeds Neon's agenda_events from json/agenda.json, once.
 *
 *   npx tsx scripts/seed-agenda.ts
 *
 * Run after `npm run db:migrate` and before deploying the code that reads the
 * agenda from the database.
 *
 * Events get new ids from the table's identity, in file order. The old ids
 * were only React keys — no URL or other row refers to them — and keeping them
 * would drag the hand-typed 234235253 into the sequence.
 *
 * Refuses to run against a table that already has rows: with fresh ids there
 * is nothing to upsert on, so a second run would duplicate every event.
 */

import { config } from "dotenv";
import { count } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

config({ path: ".env.local" });

const agendaFileSchema = z.object({
  events: z.array(
    z.object({
      date: z.iso.date(),
      title: z.string().trim().min(1),
      location: z.string().trim(),
    }),
  ),
});

async function main() {
  // Imported lazily so dotenv has already populated DATABASE_URL.
  const { db } = await import("../src/lib/db/client");
  const { agendaEvents } = await import("../src/lib/db/schema");

  const { events } = agendaFileSchema.parse(
    JSON.parse(
      await readFile(path.join(process.cwd(), "json/agenda.json"), "utf8"),
    ),
  );

  const [{ existing }] = await db
    .select({ existing: count() })
    .from(agendaEvents);

  if (existing > 0) {
    throw new Error(
      `agenda_events already has ${existing} row(s); this seed only runs on an empty table.`,
    );
  }

  // Titles are kept verbatim, including times typed into them before the
  // table had a time column; those can be moved over from the admin screen.
  await db.insert(agendaEvents).values(events);

  console.log(`Seeded ${events.length} agenda events.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
