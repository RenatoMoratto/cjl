/**
 * Uploads the voice-kit MP3s from public/songs to Cloudflare R2.
 *
 *   npx tsx scripts/upload-songs-r2.ts [--dry-run]
 *
 * Files present in public/songs-optimized take precedence over public/songs,
 * matching the convention already used by scripts/optimize-audio.js.
 *
 * The script is idempotent: an object whose size already matches is skipped,
 * so it is safe to re-run after a partial failure.
 *
 * On success it writes a manifest that scripts/seed-songs.ts consumes, so the
 * database only ever references objects that are genuinely in the bucket.
 */

import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { config } from "dotenv";
import { createReadStream } from "node:fs";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

config({ path: ".env.local" });

const VOICES = ["soprano", "contralto", "tenor", "baixo", "todos"] as const;
type Voice = (typeof VOICES)[number];

const SONGS_DIR = path.join(process.cwd(), "public", "songs");
const OPTIMIZED_DIR = path.join(process.cwd(), "public", "songs-optimized");
const MANIFEST_PATH = path.join(
  process.cwd(),
  "drizzle",
  "songs-manifest.json",
);

/** Cache hard: object keys are stable, and a replaced kit gets a new key. */
const CACHE_CONTROL = "public, max-age=31536000, immutable";
const CONCURRENCY = 4;

export interface ManifestEntry {
  slug: string;
  voice: Voice;
  objectKey: string;
  sizeBytes: number;
}

const dryRun = process.argv.includes("--dry-run");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${requireEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
  },
});

const bucket = requireEnv("R2_BUCKET_NAME");

function isVoice(value: string): value is Voice {
  return (VOICES as readonly string[]).includes(value);
}

/** Collects every MP3 on disk, preferring the optimized copy when one exists. */
async function collectLocalTracks() {
  const slugs = (await readdir(SONGS_DIR, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const tracks: Array<ManifestEntry & { localPath: string }> = [];

  for (const slug of slugs) {
    const files = (await readdir(path.join(SONGS_DIR, slug)))
      .filter((file) => file.endsWith(".mp3"))
      .sort();

    for (const file of files) {
      const voice = path.basename(file, ".mp3");

      if (!isVoice(voice)) {
        throw new Error(`Unexpected voice file: ${slug}/${file}`);
      }

      const optimized = path.join(OPTIMIZED_DIR, slug, file);
      const original = path.join(SONGS_DIR, slug, file);
      const localPath = (await exists(optimized)) ? optimized : original;

      tracks.push({
        slug,
        voice,
        objectKey: `songs/${slug}/${file}`,
        sizeBytes: (await stat(localPath)).size,
        localPath,
      });
    }
  }

  return tracks;
}

async function exists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Returns the object's size, or null when it does not exist in the bucket. */
async function remoteSize(objectKey: string): Promise<number | null> {
  try {
    const head = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: objectKey }),
    );
    return head.ContentLength ?? null;
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } })
      .$metadata?.httpStatusCode;
    if (status === 404) return null;
    throw error;
  }
}

async function uploadTrack(track: ManifestEntry & { localPath: string }) {
  const existing = await remoteSize(track.objectKey);

  if (existing === track.sizeBytes) {
    return "skipped" as const;
  }

  if (dryRun) {
    return "would-upload" as const;
  }

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: track.objectKey,
      Body: createReadStream(track.localPath),
      ContentLength: track.sizeBytes,
      ContentType: "audio/mpeg",
      CacheControl: CACHE_CONTROL,
    }),
  );

  return existing === null ? ("uploaded" as const) : ("replaced" as const);
}

/** Runs `worker` over `items` with a bounded number of in-flight tasks. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await worker(items[index]);
      }
    }),
  );

  return results;
}

async function main() {
  const tracks = await collectLocalTracks();
  const totalBytes = tracks.reduce((sum, t) => sum + t.sizeBytes, 0);

  console.log(
    `Found ${tracks.length} tracks across ${new Set(tracks.map((t) => t.slug)).size} songs ` +
      `(${(totalBytes / 1024 ** 2).toFixed(1)} MB)${dryRun ? " [dry run]" : ""}`,
  );

  const counts: Record<string, number> = {};

  const outcomes = await mapWithConcurrency(
    tracks,
    CONCURRENCY,
    async (track) => {
      const outcome = await uploadTrack(track);
      counts[outcome] = (counts[outcome] ?? 0) + 1;
      console.log(`  ${outcome.padEnd(12)} ${track.objectKey}`);
      return outcome;
    },
  );

  console.log(
    "\n" +
      Object.entries(counts)
        .map(([outcome, count]) => `${outcome}: ${count}`)
        .join(", "),
  );

  if (dryRun) {
    console.log("Dry run — no manifest written.");
    return;
  }

  if (outcomes.length !== tracks.length) {
    throw new Error("Upload count mismatch; refusing to write manifest.");
  }

  const manifest: ManifestEntry[] = tracks.map(
    ({ slug, voice, objectKey, sizeBytes }) => ({
      slug,
      voice,
      objectKey,
      sizeBytes,
    }),
  );

  await mkdir(path.dirname(MANIFEST_PATH), { recursive: true });
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
  console.log(
    `\nManifest written to ${path.relative(process.cwd(), MANIFEST_PATH)}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
