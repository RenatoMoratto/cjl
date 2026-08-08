/**
 * Seeds Neon from json/musicas.json plus the manifest written by
 * scripts/upload-songs-r2.ts.
 *
 *   npx tsx scripts/seed-songs.ts
 *
 * Idempotent: songs are upserted on their existing id, and each song's tracks
 * are replaced wholesale, so re-running converges rather than duplicating.
 *
 * Track rows come from the upload manifest, never from the JSON, so the
 * database can only ever reference objects that are really in the bucket.
 */

import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

config({ path: ".env.local" });

const lyricLineSchema = z.object({
  text: z.string(),
  time: z.number(),
  isSolo: z.boolean().optional(),
});

const songSchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(["active", "inactive"]),
  title: z.string().min(1),
  author: z.string(),
  musicPath: z.string().regex(/^\/songs\/[a-z0-9-]+$/),
  imageUrl: z.string().min(1),
  lyrics: z.object({ lines: z.array(lyricLineSchema) }),
});

const musicasSchema = z.object({ songs: z.array(songSchema) });

const manifestSchema = z.array(
  z.object({
    slug: z.string().min(1),
    voice: z.enum(["soprano", "contralto", "tenor", "baixo", "todos"]),
    objectKey: z.string().min(1),
    sizeBytes: z.number().int().nonnegative(),
  }),
);

async function readJson(relativePath: string) {
  return JSON.parse(
    await readFile(path.join(process.cwd(), relativePath), "utf8"),
  );
}

async function main() {
  // Imported lazily so dotenv has already populated DATABASE_URL.
  const { db } = await import("../src/lib/db/client");
  const { songs, tracks } = await import("../src/lib/db/schema");

  const musicas = musicasSchema.parse(await readJson("json/musicas.json"));
  const manifest = manifestSchema.parse(
    await readJson("drizzle/songs-manifest.json"),
  );

  const tracksBySlug = new Map<string, typeof manifest>();
  for (const entry of manifest) {
    const list = tracksBySlug.get(entry.slug) ?? [];
    list.push(entry);
    tracksBySlug.set(entry.slug, list);
  }

  let songCount = 0;
  let trackCount = 0;

  for (const song of musicas.songs) {
    const slug = song.musicPath.replace("/songs/", "");
    const songTracks = tracksBySlug.get(slug) ?? [];

    if (songTracks.length === 0) {
      throw new Error(`No uploaded tracks found for song "${slug}"`);
    }

    await db
      .insert(songs)
      .values({
        id: song.id,
        slug,
        status: song.status,
        title: song.title,
        author: song.author,
        imageUrl: song.imageUrl,
        lyrics: song.lyrics,
      })
      .onConflictDoUpdate({
        target: songs.id,
        set: {
          slug,
          status: song.status,
          title: song.title,
          author: song.author,
          imageUrl: song.imageUrl,
          lyrics: song.lyrics,
          updatedAt: sql`now()`,
        },
      });

    // Replace rather than upsert, so a track removed upstream disappears here.
    await db.delete(tracks).where(sql`${tracks.songId} = ${song.id}`);
    await db.insert(tracks).values(
      songTracks.map((track) => ({
        songId: song.id,
        voice: track.voice,
        objectKey: track.objectKey,
        sizeBytes: track.sizeBytes,
      })),
    );

    songCount += 1;
    trackCount += songTracks.length;

    const voices = songTracks
      .map((t) => t.voice)
      .sort()
      .join(", ");
    console.log(
      `  #${String(song.id).padStart(2)} ${slug.padEnd(24)} ${voices}`,
    );
  }

  // Identity column was seeded with explicit ids; move the sequence past them
  // so future inserts do not collide with the migrated rows.
  await db.execute(
    sql`SELECT setval(pg_get_serial_sequence('songs', 'id'), (SELECT MAX(id) FROM songs))`,
  );

  const unmatched = [...tracksBySlug.keys()].filter(
    (slug) => !musicas.songs.some((s) => s.musicPath.endsWith(`/${slug}`)),
  );

  if (unmatched.length > 0) {
    console.warn(
      `\nWarning: ${unmatched.length} uploaded song folder(s) have no JSON record: ${unmatched.join(", ")}`,
    );
  }

  console.log(`\nSeeded ${songCount} songs and ${trackCount} tracks.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
