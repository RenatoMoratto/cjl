import { asc, eq, gte, sql } from "drizzle-orm";

import { invalidatePublicAgendaCache } from "@/lib/cache";
import { todayInLondrina } from "@/lib/dates";
import { db } from "@/lib/db/client";
import { agendaEvents } from "@/lib/db/schema";
import type {
  CreateAgendaEventInput,
  UpdateAgendaEventInput,
} from "@/lib/validation/agenda";
import { ServiceError } from "@/services/errors";
import type { Event } from "@/types";

/**
 * Data access for the agenda. The public endpoint and the admin screen both go
 * through here — nothing else should touch the table directly.
 *
 * The mutations assume their input has already been parsed by the matching
 * schema in src/lib/validation/agenda.ts, and own keeping the public CDN cache
 * in step with the database. Each one is a single statement, so none needs
 * runAtomically.
 */

/**
 * By day, then time. An event without a time comes first on its day, the way
 * an all-day entry would; the admin screen sorts the same way.
 */
const EVENT_ORDER = [
  asc(agendaEvents.date),
  sql`${agendaEvents.time} ASC NULLS FIRST`,
  asc(agendaEvents.id),
];

type AgendaEventRow = typeof agendaEvents.$inferSelect;

function toEvent(row: AgendaEventRow): Event {
  return {
    id: row.id,
    date: row.date,
    // Postgres answers "19:30:00"; the seconds are never set, so never shown.
    time: row.time?.slice(0, 5) ?? null,
    title: row.title,
    location: row.location,
  };
}

/** Today's events and later ones, for the public agenda. */
export async function listUpcomingEvents(): Promise<Event[]> {
  const rows = await db
    .select()
    .from(agendaEvents)
    .where(gte(agendaEvents.date, todayInLondrina()))
    .orderBy(...EVENT_ORDER);

  return rows.map(toEvent);
}

/** Every event, past ones included; the admin screen splits them itself. */
export async function listEventsForManagement(): Promise<Event[]> {
  const rows = await db
    .select()
    .from(agendaEvents)
    .orderBy(...EVENT_ORDER);

  return rows.map(toEvent);
}

export async function createEvent(
  input: CreateAgendaEventInput,
): Promise<Event> {
  const [created] = await db.insert(agendaEvents).values(input).returning();

  await invalidatePublicAgendaCache();

  return toEvent(created);
}

export async function updateEvent(
  id: number,
  input: UpdateAgendaEventInput,
): Promise<Event> {
  const [updated] = await db
    .update(agendaEvents)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(agendaEvents.id, id))
    .returning();

  if (!updated) {
    throw new ServiceError("not_found", "Evento não encontrado");
  }

  await invalidatePublicAgendaCache();

  return toEvent(updated);
}

export async function deleteEvent(id: number): Promise<{ id: number }> {
  const [deleted] = await db
    .delete(agendaEvents)
    .where(eq(agendaEvents.id, id))
    .returning({ id: agendaEvents.id });

  if (!deleted) {
    throw new ServiceError("not_found", "Evento não encontrado");
  }

  await invalidatePublicAgendaCache();

  return deleted;
}
