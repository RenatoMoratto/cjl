import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Relative import on purpose: drizzle-kit loads this file outside Next's
// module resolver, where the "@/" alias is not available.
import type { Lyrics } from "../../types";

export const songStatus = pgEnum("song_status", ["active", "inactive"]);

export const voice = pgEnum("voice", [
  "soprano",
  "contralto",
  "tenor",
  "baixo",
  "todos",
]);

export const songs = pgTable(
  "songs",
  {
    // generatedByDefaultAsIdentity (not generatedAlwaysAsIdentity) so the seed
    // can insert the existing ids 1-17 explicitly. Those ids are public URLs.
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    slug: text().notNull().unique(),
    status: songStatus().notNull().default("active"),
    title: text().notNull(),
    author: text().notNull().default(""),
    imageUrl: text("image_url").notNull(),
    lyrics: jsonb().$type<Lyrics>().notNull(),
    /**
     * Explicit list order. Backfilled to the id so the order the public list
     * already had is preserved, but decoupled from it from now on: ids are
     * public URLs and must never be rewritten to reorder the list.
     *
     * Not unique — reordering rewrites many rows at once, and a unique
     * constraint would reject the intermediate states of that rewrite. Reads
     * order by (position, id) so ties stay deterministic.
     */
    position: integer().notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("songs_position_idx").on(table.position, table.id)],
);

export const tracks = pgTable(
  "tracks",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    songId: integer("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    voice: voice().notNull(),
    /** R2 object key, e.g. "songs/vem-a-nos/soprano.mp3". Never a full URL. */
    objectKey: text("object_key").notNull(),
    sizeBytes: integer("size_bytes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("tracks_song_id_voice_unique").on(table.songId, table.voice),
    index("tracks_song_id_idx").on(table.songId),
  ],
);

/**
 * Queue of R2 objects that no database row references any more.
 *
 * Mutations never delete from R2 inline. They drop the reference in Postgres
 * and enqueue the old key here in the same transaction, so the bucket is only
 * ever touched after the database has already committed. A crash between the
 * two is impossible; a crash before the sweeper runs leaves an orphaned object,
 * which costs storage but breaks nothing.
 *
 * `purge_after` is a grace period, not a schedule. Audio URLs are served with
 * `immutable` and a one-year max-age, and a chorister may be part-way through
 * streaming a track when it is replaced, so the object outlives its row by
 * days rather than seconds.
 */
export const pendingObjectDeletions = pgTable(
  "pending_object_deletions",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    /** R2 object key, matching tracks.object_key. Never a full URL. */
    objectKey: text("object_key").notNull(),
    /** Free-text audit trail: which mutation orphaned this object. */
    reason: text().notNull(),
    purgeAfter: timestamp("purge_after", { withTimezone: true }).notNull(),
    /** Set once the object is gone from R2; rows are kept as an audit log. */
    purgedAt: timestamp("purged_at", { withTimezone: true }),
    /** Last failure from the sweeper, so a stuck key is diagnosable. */
    lastError: text("last_error"),
    attempts: integer().notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("pending_object_deletions_purge_after_idx").on(
      table.purgedAt,
      table.purgeAfter,
    ),
  ],
);

export const songsRelations = relations(songs, ({ many }) => ({
  tracks: many(tracks),
}));

export const tracksRelations = relations(tracks, ({ one }) => ({
  song: one(songs, {
    fields: [tracks.songId],
    references: [songs.id],
  }),
}));
