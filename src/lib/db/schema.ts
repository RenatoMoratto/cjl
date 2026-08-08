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

export const songs = pgTable("songs", {
  // generatedByDefaultAsIdentity (not generatedAlwaysAsIdentity) so the seed
  // can insert the existing ids 1-17 explicitly. Those ids are public URLs.
  id: integer().primaryKey().generatedByDefaultAsIdentity(),
  slug: text().notNull().unique(),
  status: songStatus().notNull().default("active"),
  title: text().notNull(),
  author: text().notNull().default(""),
  imageUrl: text("image_url").notNull(),
  lyrics: jsonb().$type<Lyrics>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

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

export const songsRelations = relations(songs, ({ many }) => ({
  tracks: many(tracks),
}));

export const tracksRelations = relations(tracks, ({ one }) => ({
  song: one(songs, {
    fields: [tracks.songId],
    references: [songs.id],
  }),
}));
