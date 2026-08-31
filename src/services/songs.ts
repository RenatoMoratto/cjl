import { asc, eq, sql } from "drizzle-orm";

import { invalidatePublicSongCache } from "@/lib/cache";
import { runAtomically } from "@/lib/db/batch";
import { db } from "@/lib/db/client";
import { songs, tracks } from "@/lib/db/schema";
import { buildAudioUrl } from "@/lib/r2";
import type {
  CreateSongInput,
  ReorderSongsInput,
  UpdateSongInput,
} from "@/lib/validation/songs";
import { isUniqueViolation, ServiceError } from "@/services/errors";
import { enqueueObjectDeletion } from "@/services/storage-cleanup";
import { Status, type SongDetail, type SongSummary } from "@/types";

/**
 * Data access for songs. API routes and, later, the authenticated management
 * UI both go through here — nothing else should touch the tables directly.
 *
 * The mutations assume their input has already been parsed by the matching
 * schema in src/lib/validation/songs.ts. They own two things the callers do
 * not: keeping the public CDN cache in step with the database, and making sure
 * no R2 object is deleted before the row that referenced it is gone.
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
    .orderBy(asc(songs.position), asc(songs.id));
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

export interface ManagedSong {
  id: number;
  slug: string;
  status: Status;
  title: string;
  author: string;
  imageUrl: string;
  position: number;
  updatedAt: Date;
  tracks: Array<{ id: number; voice: string; objectKey: string }>;
}

/**
 * Every song, inactive ones included, in list order.
 *
 * The management counterpart to listActiveSongs: it returns object keys rather
 * than public URLs, because the eventual admin UI needs to name the object it
 * is about to replace, and positions, because it needs to render the order it
 * will send back to reorderSongs.
 */
export async function listSongsForManagement(): Promise<ManagedSong[]> {
  const rows = await db.query.songs.findMany({
    with: { tracks: true },
    orderBy: [asc(songs.position), asc(songs.id)],
  });

  return rows.map((song) => ({
    id: song.id,
    slug: song.slug,
    status: song.status as Status,
    title: song.title,
    author: song.author,
    imageUrl: song.imageUrl,
    position: song.position,
    updatedAt: song.updatedAt,
    tracks: song.tracks.map((track) => ({
      id: track.id,
      voice: track.voice,
      objectKey: track.objectKey,
    })),
  }));
}

export async function createSong(input: CreateSongInput): Promise<SongDetail> {
  let created;

  try {
    [created] = await db
      .insert(songs)
      .values({
        slug: input.slug,
        title: input.title,
        author: input.author,
        imageUrl: input.imageUrl,
        status: input.status,
        lyrics: input.lyrics,
        // Appended to the end of the list. Computed in the INSERT rather than
        // read first and written back, so two concurrent creates cannot both
        // claim the same position.
        position: sql<number>`(SELECT COALESCE(MAX(${songs.position}), 0) + 1 FROM ${songs})`,
      })
      .returning();
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ServiceError(
        "conflict",
        `Já existe uma música com o slug "${input.slug}"`,
      );
    }

    throw error;
  }

  await invalidatePublicSongCache(created.id);

  return toSongDetail(created, []);
}

export async function updateSong(
  id: number,
  input: UpdateSongInput,
): Promise<SongDetail> {
  let updated;

  try {
    [updated] = await db
      .update(songs)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(songs.id, id))
      .returning();
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ServiceError(
        "conflict",
        `Já existe uma música com o slug "${input.slug}"`,
      );
    }

    throw error;
  }

  if (!updated) {
    throw new ServiceError("not_found", "Música não encontrada");
  }

  const existing = await db
    .select({ voice: tracks.voice, objectKey: tracks.objectKey })
    .from(tracks)
    .where(eq(tracks.songId, id));

  await invalidatePublicSongCache(id);

  return toSongDetail(updated, existing);
}

export interface DeleteSongResult {
  id: number;
  /** Keys queued for deletion, not keys already removed from the bucket. */
  orphanedObjectKeys: string[];
}

/**
 * Deletes a song and everything hanging off it.
 *
 * The tracks rows go with it through the ON DELETE CASCADE on tracks.song_id,
 * and their objects are queued rather than deleted: the row disappears and the
 * queue entry appears in the same batch, so there is no window in which the
 * bucket has been emptied but the song still exists. See
 * src/services/storage-cleanup.ts for why that direction is the safe one.
 */
export async function deleteSong(id: number): Promise<DeleteSongResult> {
  const doomed = await db.query.songs.findFirst({
    where: eq(songs.id, id),
    with: { tracks: true },
  });

  if (!doomed) {
    throw new ServiceError("not_found", "Música não encontrada");
  }

  const objectKeys = doomed.tracks.map((track) => track.objectKey);

  await runAtomically([
    db.delete(songs).where(eq(songs.id, id)),
    ...objectKeys.map((objectKey) =>
      enqueueObjectDeletion(objectKey, `song ${id} (${doomed.slug}) deleted`),
    ),
  ]);

  await invalidatePublicSongCache(id);

  return { id, orphanedObjectKeys: objectKeys };
}

/**
 * Rewrites the list order.
 *
 * Requires the caller to send every song id exactly once. A partial reorder
 * would be ambiguous against a list that has changed since the client loaded
 * it — a song created in another tab would either vanish from the ordering or
 * silently sink to the bottom — so a stale list is rejected outright and the
 * admin is asked to reload.
 */
export async function reorderSongs(
  input: ReorderSongsInput,
): Promise<{ ordered: number }> {
  const existing = await db.select({ id: songs.id }).from(songs);

  const existingIds = new Set(existing.map((song) => song.id));
  const requestedIds = new Set(input.orderedIds);

  const missing = [...existingIds].filter((id) => !requestedIds.has(id));
  const unknown = [...requestedIds].filter((id) => !existingIds.has(id));

  if (missing.length > 0 || unknown.length > 0) {
    throw new ServiceError(
      "invalid",
      "A ordem enviada não corresponde às músicas cadastradas. " +
        "Recarregue a lista e tente novamente.",
    );
  }

  await runAtomically(
    input.orderedIds.map((songId, index) =>
      db
        .update(songs)
        .set({ position: index + 1, updatedAt: new Date() })
        .where(eq(songs.id, songId)),
    ),
  );

  await invalidatePublicSongCache();

  return { ordered: input.orderedIds.length };
}

function toSongDetail(
  song: typeof songs.$inferSelect,
  songTracks: Array<{ voice: string; objectKey: string }>,
): SongDetail {
  return {
    id: song.id,
    slug: song.slug,
    status: song.status as Status,
    title: song.title,
    author: song.author,
    imageUrl: song.imageUrl,
    lyrics: song.lyrics,
    tracks: songTracks
      .map((track) => ({
        voice: track.voice as SongDetail["tracks"][number]["voice"],
        url: buildAudioUrl(track.objectKey),
      }))
      .sort((a, b) => a.voice.localeCompare(b.voice)),
  };
}
