import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { songs } from "@/lib/db/schema";
import { buildAudioUrl } from "@/lib/r2";
import { Status, type SongDetail, type SongSummary } from "@/types";

/**
 * Data access for songs. API routes and, later, the authenticated management
 * UI both go through here — nothing else should touch the tables directly.
 */

export async function listActiveSongs(): Promise<SongSummary[]> {
  return db
    .select({
      id: songs.id,
      slug: songs.slug,
      title: songs.title,
      author: songs.author,
      imageUrl: songs.imageUrl,
    })
    .from(songs)
    .where(eq(songs.status, Status.active))
    .orderBy(asc(songs.id));
}

/**
 * Looks a song up by its public id.
 *
 * Deliberately not filtered by status: the previous JSON-backed endpoint
 * served inactive songs to anyone holding a direct link, and shared links are
 * the main way choristers reach a song.
 */
export async function getSongById(id: number): Promise<SongDetail | null> {
  const song = await db.query.songs.findFirst({
    where: eq(songs.id, id),
    with: { tracks: true },
  });

  if (!song) return null;

  return {
    id: song.id,
    slug: song.slug,
    status: song.status as Status,
    title: song.title,
    author: song.author,
    imageUrl: song.imageUrl,
    lyrics: song.lyrics,
    tracks: song.tracks
      .map((track) => ({
        voice: track.voice,
        url: buildAudioUrl(track.objectKey),
      }))
      .sort((a, b) => a.voice.localeCompare(b.voice)),
  };
}
