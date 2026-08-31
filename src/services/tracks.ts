import { and, eq } from "drizzle-orm";

import {
  formatBytes,
  isAllowedAudioMimeType,
  MAX_AUDIO_BYTES,
} from "@/lib/audio";
import { invalidatePublicSongCache } from "@/lib/cache";
import { runAtomically } from "@/lib/db/batch";
import { db } from "@/lib/db/client";
import { songs, tracks } from "@/lib/db/schema";
import { buildTrackObjectKey, isTrackObjectKeyFor } from "@/lib/object-keys";
import {
  createPresignedUpload,
  deleteObject,
  headObject,
  type PresignedUpload,
} from "@/lib/r2";
import type {
  ConfirmTrackUploadInput,
  CreateUploadUrlInput,
} from "@/lib/validation/songs";
import { ServiceError } from "@/services/errors";
import { enqueueObjectDeletion } from "@/services/storage-cleanup";
import type { Voice } from "@/types";

/**
 * The voice-kit lifecycle: upload, replace, delete.
 *
 * Adding audio is three steps, and the split is what keeps a 6 MB MP3 off
 * Vercel entirely:
 *
 *   1. prepareTrackUpload — the server validates the request and signs a PUT
 *      for one specific, freshly minted key. Nothing is written anywhere.
 *   2. The browser PUTs the file straight to R2.
 *   3. confirmTrackUpload — the server checks the object really landed and
 *      matches what was promised, and only then writes the row.
 *
 * The database learns about a track only in step 3, so an abandoned or failed
 * upload leaves an unreferenced object and no row, never a row pointing at
 * audio that is not there.
 */

export interface PreparedTrackUpload extends PresignedUpload {
  songId: number;
  voice: Voice;
}

/**
 * Validates an upload request and signs a URL for it.
 *
 * The key is minted here, never accepted from the client: it is derived from
 * the song's own slug plus fresh randomness, so a caller cannot choose where
 * in the bucket the object lands or which existing object it would sit on top
 * of.
 */
export async function prepareTrackUpload(
  input: CreateUploadUrlInput,
): Promise<PreparedTrackUpload> {
  const song = await requireSong(input.songId);

  const objectKey = buildTrackObjectKey(song.slug, input.voice);
  const presigned = await createPresignedUpload(objectKey);

  return { ...presigned, songId: song.id, voice: input.voice };
}

export interface ConfirmedTrack {
  id: number;
  songId: number;
  voice: Voice;
  objectKey: string;
  sizeBytes: number;
  /** The key this upload replaced, now queued for deletion. */
  replacedObjectKey: string | null;
}

/**
 * Persists a track once its object is in the bucket.
 *
 * Handles both "add" and "replace": the unique index on (song_id, voice) means
 * a song has at most one kit per voice, so an upload for a voice that already
 * has one is an upsert, and the key it displaced is queued for deletion in the
 * same transaction.
 *
 * The object is verified before anything is written, because objectKey arrives
 * from the client — the server never saw the upload itself. It must be a key
 * this application could have minted for this exact song and voice, and it
 * must actually exist in R2 at the promised size.
 */
export async function confirmTrackUpload(
  input: ConfirmTrackUploadInput,
): Promise<ConfirmedTrack> {
  const song = await requireSong(input.songId);

  if (!isTrackObjectKeyFor(input.objectKey, song.slug, input.voice)) {
    throw new ServiceError(
      "invalid",
      "A chave de armazenamento não corresponde a esta música e voz",
    );
  }

  const stored = await headObject(input.objectKey);

  if (!stored) {
    throw new ServiceError(
      "upload_missing",
      "O arquivo não foi encontrado no armazenamento. Refaça o envio.",
    );
  }

  // Re-checked against the object R2 actually stored rather than trusted from
  // step 1: a presigned PUT carries no length limit, so the only enforceable
  // moment is after the fact. Deleting here is safe — no row has ever pointed
  // at this key, so this is cleaning up the caller's own failed attempt, not
  // removing something the site is serving.
  await rejectUnusableObject(input.objectKey, stored);

  const [existing] = await db
    .select({ objectKey: tracks.objectKey })
    .from(tracks)
    .where(and(eq(tracks.songId, song.id), eq(tracks.voice, input.voice)));

  const replacedObjectKey =
    existing && existing.objectKey !== input.objectKey
      ? existing.objectKey
      : null;

  const upsert = db
    .insert(tracks)
    .values({
      songId: song.id,
      voice: input.voice,
      objectKey: input.objectKey,
      sizeBytes: stored.sizeBytes,
    })
    .onConflictDoUpdate({
      target: [tracks.songId, tracks.voice],
      set: { objectKey: input.objectKey, sizeBytes: stored.sizeBytes },
    })
    .returning();

  // Repointing the row and queueing the key it displaced commit together, so
  // the old object can never be scheduled for deletion while the row still
  // references it, and can never be silently forgotten once it does not.
  const [saved] = replacedObjectKey
    ? (
        await db.batch([
          upsert,
          enqueueObjectDeletion(
            replacedObjectKey,
            `replaced by ${input.objectKey} for song ${song.id} (${input.voice})`,
          ),
        ])
      )[0]
    : await upsert;

  await invalidatePublicSongCache(song.id);

  return {
    id: saved.id,
    songId: saved.songId,
    voice: saved.voice,
    objectKey: saved.objectKey,
    sizeBytes: saved.sizeBytes ?? stored.sizeBytes,
    replacedObjectKey,
  };
}

export interface DeleteTrackResult {
  id: number;
  songId: number;
  /** Queued for deletion, not yet removed from the bucket. */
  orphanedObjectKey: string;
}

/**
 * Removes one voice kit from a song, leaving the song itself alone.
 *
 * The row and the queue entry go in a single batch, so the audio can never be
 * scheduled for deletion while something still links to it.
 */
export async function deleteTrack(trackId: number): Promise<DeleteTrackResult> {
  const [doomed] = await db.select().from(tracks).where(eq(tracks.id, trackId));

  if (!doomed) {
    throw new ServiceError("not_found", "Kit de voz não encontrado");
  }

  await runAtomically([
    db.delete(tracks).where(eq(tracks.id, trackId)),
    enqueueObjectDeletion(
      doomed.objectKey,
      `track ${trackId} (song ${doomed.songId}, ${doomed.voice}) deleted`,
    ),
  ]);

  await invalidatePublicSongCache(doomed.songId);

  return {
    id: trackId,
    songId: doomed.songId,
    orphanedObjectKey: doomed.objectKey,
  };
}

async function requireSong(songId: number) {
  const [song] = await db
    .select({ id: songs.id, slug: songs.slug })
    .from(songs)
    .where(eq(songs.id, songId));

  if (!song) {
    throw new ServiceError("not_found", "Música não encontrada");
  }

  return song;
}

/**
 * Deletes and rejects an object that is not a usable kit.
 *
 * Only ever called for a key that no row references, so the delete is not
 * destructive in the sense the rest of this module worries about — it removes
 * exactly the bytes the current request just caused to be written.
 */
async function rejectUnusableObject(
  objectKey: string,
  stored: { sizeBytes: number; contentType?: string },
): Promise<void> {
  const problem = describeUnusableObject(stored);

  if (!problem) return;

  try {
    await deleteObject(objectKey);
  } catch (error) {
    // Worth knowing about, but not worth turning into the caller's error: the
    // upload is being rejected either way, and the leftover object is exactly
    // the harmless orphan this design tolerates.
    console.error("Failed to clean up a rejected upload", { objectKey, error });
  }

  throw new ServiceError("invalid", problem);
}

function describeUnusableObject(stored: {
  sizeBytes: number;
  contentType?: string;
}): string | null {
  if (stored.sizeBytes > MAX_AUDIO_BYTES) {
    return `O arquivo enviado tem ${formatBytes(stored.sizeBytes)} e o limite é ${formatBytes(MAX_AUDIO_BYTES)}`;
  }

  if (stored.sizeBytes === 0) {
    return "O arquivo enviado está vazio";
  }

  if (stored.contentType && !isAllowedAudioMimeType(stored.contentType)) {
    return "O arquivo enviado não é um MP3";
  }

  return null;
}
