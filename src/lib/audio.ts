/**
 * Constants describing what counts as an acceptable voice-kit upload.
 *
 * Shared by the validation schemas, the presigned-URL endpoint and the
 * post-upload verification step, so the limit the browser is told about and
 * the limit the server enforces cannot drift apart.
 */

/**
 * MIME types accepted for an uploaded kit.
 *
 * Browsers are inconsistent about what they report for an MP3 picked from a
 * file input — Safari and older Windows builds still send the pre-RFC-3003
 * spellings — so the alternates are accepted rather than rejecting a valid
 * file over a header the user has no control of. The extension check and the
 * post-upload size check are what actually constrain the object.
 */
export const ALLOWED_AUDIO_MIME_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/mpeg3",
  "audio/x-mpeg-3",
] as const;

/** Canonical type stored on the R2 object regardless of what the browser said. */
export const CANONICAL_AUDIO_MIME_TYPE = "audio/mpeg";

/** Only MP3 — every kit in the bucket is one, and the player assumes it. */
export const ALLOWED_AUDIO_EXTENSION = ".mp3";

/**
 * Upper bound for a single kit, in bytes.
 *
 * The largest kit currently in the bucket is roughly 6 MB. 30 MB leaves room
 * for a long, un-optimised 320 kbps export (~12 minutes) while still being far
 * too small to be worth abusing as general-purpose storage.
 */
export const MAX_AUDIO_BYTES = 30 * 1024 * 1024;

/** Rejects zero-byte and truncated uploads that R2 would otherwise accept. */
export const MIN_AUDIO_BYTES = 1024;

export function isAllowedAudioMimeType(value: string): boolean {
  return (ALLOWED_AUDIO_MIME_TYPES as readonly string[]).includes(
    value.toLowerCase(),
  );
}

export function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
