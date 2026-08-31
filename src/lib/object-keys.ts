import { ALLOWED_AUDIO_EXTENSION } from "@/lib/audio";
import { VOICES, type Voice } from "@/types";

/**
 * Construction and validation of R2 object keys.
 *
 * Kept free of environment access and of the S3 client so it can be unit
 * tested directly, and so the rules live in exactly one place: keys are
 * user-influenced (the slug comes from a form) and end up concatenated into a
 * public URL, so every key that reaches the bucket goes through here.
 */

/** Prefix every voice kit lives under. Nothing else writes to the bucket. */
export const AUDIO_KEY_PREFIX = "songs";

/** Random hex characters appended to make each upload a distinct object. */
const VERSION_HEX_LENGTH = 16;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Keys written by scripts/upload-songs-r2.ts during the JSON-to-Neon
 * migration: "songs/<slug>/<voice>.mp3", with no version segment. They are
 * still valid keys to read and to delete, they are just never minted again.
 */
const LEGACY_KEY_PATTERN = new RegExp(
  `^${AUDIO_KEY_PREFIX}/([a-z0-9-]+)/(${VOICES.join("|")})\\.mp3$`,
);

/** Keys minted by buildTrackObjectKey: "songs/<slug>/<voice>-<hex>.mp3". */
const VERSIONED_KEY_PATTERN = new RegExp(
  `^${AUDIO_KEY_PREFIX}/([a-z0-9-]+)/(${VOICES.join("|")})-([0-9a-f]{${VERSION_HEX_LENGTH}})\\.mp3$`,
);

export function isValidSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}

/**
 * Mints a fresh key for a kit.
 *
 * Always a new random suffix, never a deterministic name: audio is served with
 * `max-age=31536000, immutable`, so overwriting a key that any browser or CDN
 * has already cached would leave listeners on the old file indefinitely with
 * no way to tell. Replacing a kit therefore means writing a new object and
 * repointing the row, never a PUT over the old key.
 */
export function buildTrackObjectKey(slug: string, voice: Voice): string {
  if (!isValidSlug(slug)) {
    throw new Error(
      `Refusing to build an object key for invalid slug: ${slug}`,
    );
  }

  // Web Crypto rather than node:crypto, so this module stays importable from
  // the browser: the admin forms reuse the schemas in
  // src/lib/validation/songs.ts, which reach this file. `crypto` is a global
  // in Node 19+ (.nvmrc pins 22) and in every browser, and getRandomValues is
  // the same CSPRNG randomBytes was drawing from.
  const bytes = new Uint8Array(VERSION_HEX_LENGTH / 2);
  crypto.getRandomValues(bytes);
  const version = Array.from(bytes, (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");

  return `${AUDIO_KEY_PREFIX}/${slug}/${voice}-${version}${ALLOWED_AUDIO_EXTENSION}`;
}

export interface ParsedTrackObjectKey {
  slug: string;
  voice: Voice;
  /** Absent for legacy migration keys, which carry no version segment. */
  version?: string;
}

/**
 * Parses a key back into the song and voice it belongs to.
 *
 * Returns null for anything that is not a well-formed kit key, which is what
 * makes it safe to feed a client-supplied key to R2: traversal ("../"),
 * absolute paths, other prefixes and unknown extensions all fail to parse
 * rather than being sanitised into something that happens to work.
 */
export function parseTrackObjectKey(
  objectKey: string,
): ParsedTrackObjectKey | null {
  const versioned = VERSIONED_KEY_PATTERN.exec(objectKey);

  if (versioned) {
    return {
      slug: versioned[1],
      voice: versioned[2] as Voice,
      version: versioned[3],
    };
  }

  const legacy = LEGACY_KEY_PATTERN.exec(objectKey);

  if (legacy) {
    return { slug: legacy[1], voice: legacy[2] as Voice };
  }

  return null;
}

/**
 * True when the key is one this application could have written for the given
 * song and voice.
 *
 * The upload confirmation step takes the key from the client — the browser
 * uploads straight to R2, so the server never sees the object until it is told
 * about it. Checking that the key both parses and belongs to the song and
 * voice being confirmed means the worst a caller can do is point a row at
 * another version of the very kit it was already allowed to replace.
 */
export function isTrackObjectKeyFor(
  objectKey: string,
  slug: string,
  voice: Voice,
): boolean {
  const parsed = parseTrackObjectKey(objectKey);

  return parsed !== null && parsed.slug === slug && parsed.voice === voice;
}
