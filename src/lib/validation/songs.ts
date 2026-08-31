import { z } from "zod";

import {
  ALLOWED_AUDIO_EXTENSION,
  isAllowedAudioMimeType,
  MAX_AUDIO_BYTES,
  MIN_AUDIO_BYTES,
} from "@/lib/audio";
import { isValidSlug, parseTrackObjectKey } from "@/lib/object-keys";
import { Status, VOICES } from "@/types";

/**
 * The server boundary for every mutation.
 *
 * Nothing in src/services trusts its arguments to have been checked elsewhere:
 * each API route parses its request through one of these schemas first, so the
 * services only ever receive values that already have the right shape. Parsing
 * here rather than in the services keeps the error messages HTTP-shaped
 * (field paths a form can highlight) while the services stay transport
 * agnostic.
 */

/** Mirrors next.config.ts images.remotePatterns — keep the two in sync. */
export const ALLOWED_IMAGE_HOSTS = ["i.ytimg.com"] as const;

const MAX_TITLE_LENGTH = 200;
const MAX_AUTHOR_LENGTH = 200;
const MAX_SLUG_LENGTH = 80;
const MAX_LYRIC_LINES = 2000;
const MAX_LYRIC_LINE_LENGTH = 500;
/** Well above any real song; a guard against an unbounded number in jsonb. */
const MAX_LYRIC_TIME_SECONDS = 60 * 60 * 3;

export const voiceSchema = z.enum(VOICES);

export const songIdSchema = z.coerce
  .number()
  .int("O identificador deve ser um número inteiro")
  .positive("O identificador deve ser positivo");

export const titleSchema = z
  .string()
  .trim()
  .min(1, "O título é obrigatório")
  .max(
    MAX_TITLE_LENGTH,
    `O título deve ter até ${MAX_TITLE_LENGTH} caracteres`,
  );

export const authorSchema = z
  .string()
  .trim()
  .max(
    MAX_AUTHOR_LENGTH,
    `O autor deve ter até ${MAX_AUTHOR_LENGTH} caracteres`,
  );

/**
 * Slugs are concatenated into R2 object keys and therefore into public URLs,
 * so the character set is restricted at the boundary rather than escaped
 * later. isValidSlug is the same predicate buildTrackObjectKey asserts on.
 */
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "O slug é obrigatório")
  .max(MAX_SLUG_LENGTH, `O slug deve ter até ${MAX_SLUG_LENGTH} caracteres`)
  .refine(isValidSlug, {
    message:
      "O slug deve conter apenas letras minúsculas, números e hífens simples",
  });

/**
 * next/image refuses to optimise a host that is not in remotePatterns, so an
 * unlisted host would render as a broken image rather than fail loudly here.
 * Root-relative paths are allowed for the images served from /public.
 */
export const imageUrlSchema = z
  .string()
  .trim()
  .min(1, "A imagem é obrigatória")
  .refine(
    (value) => {
      if (value.startsWith("/") && !value.startsWith("//")) return true;

      let url: URL;

      try {
        url = new URL(value);
      } catch {
        return false;
      }

      return (
        url.protocol === "https:" &&
        (ALLOWED_IMAGE_HOSTS as readonly string[]).includes(url.hostname)
      );
    },
    {
      message: `A imagem deve ser um caminho iniciado por "/" ou uma URL https em: ${ALLOWED_IMAGE_HOSTS.join(", ")}`,
    },
  );

export const lyricsSchema = z.object({
  lines: z
    .array(
      z.object({
        text: z.string().max(MAX_LYRIC_LINE_LENGTH),
        time: z
          .number()
          .min(0, "O tempo não pode ser negativo")
          .max(MAX_LYRIC_TIME_SECONDS)
          .finite(),
        isSolo: z.boolean().optional(),
      }),
    )
    .max(MAX_LYRIC_LINES),
});

export const statusSchema = z.enum(Status);

export const createSongSchema = z.object({
  slug: slugSchema,
  title: titleSchema,
  author: authorSchema.default(""),
  imageUrl: imageUrlSchema,
  status: statusSchema.default(Status.active),
  lyrics: lyricsSchema.default({ lines: [] }),
});

export type CreateSongInput = z.infer<typeof createSongSchema>;

/**
 * Every field optional, but at least one required: a PATCH that names no field
 * is a caller bug, and silently succeeding would hide it.
 *
 * Note that changing a slug does not rewrite existing object keys. Keys are
 * opaque references stored per track, so old kits keep the old slug in their
 * path and keep working; only later uploads pick up the new one.
 */
export const updateSongSchema = z
  .object({
    slug: slugSchema,
    title: titleSchema,
    author: authorSchema,
    imageUrl: imageUrlSchema,
    status: statusSchema,
    lyrics: lyricsSchema,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo para atualizar",
  });

export type UpdateSongInput = z.infer<typeof updateSongSchema>;

export const reorderSongsSchema = z.object({
  /**
   * The complete list of song ids in their new order. Deliberately not a
   * partial move ({id, position}): sending the whole list lets the server
   * reject an ordering that has drifted from the database — a stale admin tab
   * that never saw a newly created song would otherwise silently drop it to
   * the end.
   */
  orderedIds: z
    .array(songIdSchema)
    .min(1, "Informe a nova ordem das músicas")
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "A ordem não pode conter identificadores repetidos",
    }),
});

export type ReorderSongsInput = z.infer<typeof reorderSongsSchema>;

/**
 * The filename is used only to check the extension; the stored key is minted
 * server-side by buildTrackObjectKey and never derived from this value.
 */
const uploadFilenameSchema = z
  .string()
  .trim()
  .min(1, "O nome do arquivo é obrigatório")
  .max(255)
  .refine(
    (value) => value.toLowerCase().endsWith(ALLOWED_AUDIO_EXTENSION),
    `O arquivo deve ter a extensão ${ALLOWED_AUDIO_EXTENSION}`,
  );

const audioContentTypeSchema = z
  .string()
  .trim()
  .refine(isAllowedAudioMimeType, "O arquivo deve ser um MP3");

const audioSizeSchema = z
  .number()
  .int()
  .min(MIN_AUDIO_BYTES, "O arquivo parece vazio ou incompleto")
  .max(
    MAX_AUDIO_BYTES,
    `O arquivo deve ter no máximo ${MAX_AUDIO_BYTES / (1024 * 1024)} MB`,
  );

/** Step 1 of an upload: ask the server for a presigned PUT URL. */
export const createUploadUrlSchema = z.object({
  songId: songIdSchema,
  voice: voiceSchema,
  filename: uploadFilenameSchema,
  contentType: audioContentTypeSchema,
  /**
   * Declared up front so an oversized file is rejected before anything is
   * transferred. It is re-checked against the object R2 actually stored, since
   * a presigned PUT cannot enforce a length on its own.
   */
  sizeBytes: audioSizeSchema,
});

export type CreateUploadUrlInput = z.infer<typeof createUploadUrlSchema>;

/**
 * Any string that could be a kit object key.
 *
 * parseTrackObjectKey rejects traversal, absolute paths, foreign prefixes and
 * unexpected extensions. Whether the key belongs to the song being mutated is
 * a separate check the service makes, because only it knows the song's slug.
 */
export const objectKeySchema = z
  .string()
  .trim()
  .max(1024)
  .refine(
    (value) => parseTrackObjectKey(value) !== null,
    "Chave de armazenamento inválida",
  );

/** Step 3 of an upload: persist the track now that the object exists. */
export const confirmTrackUploadSchema = z.object({
  songId: songIdSchema,
  voice: voiceSchema,
  objectKey: objectKeySchema,
});

export type ConfirmTrackUploadInput = z.infer<typeof confirmTrackUploadSchema>;

export const trackIdSchema = songIdSchema;
