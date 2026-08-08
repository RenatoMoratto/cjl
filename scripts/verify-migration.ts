/**
 * Health check for the song data: run it after any seed or upload, and before
 * anything destructive.
 *
 *   npx tsx scripts/verify-migration.ts
 *
 * Checks three things:
 *   1. the database is internally consistent;
 *   2. every track row points at an object that really exists in R2, with a
 *      matching size;
 *   3. those objects are publicly readable over R2_PUBLIC_URL and support the
 *      range requests the player relies on for seeking.
 *
 * Exits non-zero if any check fails.
 */

import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config } from "dotenv";
import { sql } from "drizzle-orm";

config({ path: ".env.local" });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const failures: string[] = [];

function check(label: string, ok: boolean, detail = "") {
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`,
  );
  if (!ok) failures.push(label);
}

async function main() {
  const { db } = await import("../src/lib/db/client");

  const bucket = requireEnv("R2_BUCKET_NAME");
  const publicUrl = requireEnv("R2_PUBLIC_URL").replace(/\/+$/, "");

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${requireEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    },
  });

  console.log("\nDatabase");

  const [stats] = (
    await db.execute(sql`
      SELECT
        (SELECT count(*)::int FROM songs) AS songs,
        (SELECT count(*)::int FROM songs WHERE status = 'active') AS active,
        (SELECT count(*)::int FROM tracks) AS tracks,
        (SELECT count(DISTINCT slug)::int FROM songs) AS slugs,
        (SELECT coalesce(max(id), 0)::int FROM songs) AS max_id,
        (SELECT last_value::int FROM songs_id_seq) AS seq,
        (SELECT count(*)::int FROM tracks t
           LEFT JOIN songs s ON s.id = t.song_id WHERE s.id IS NULL) AS orphans,
        (SELECT count(*)::int FROM songs
           WHERE jsonb_array_length(lyrics -> 'lines') = 0) AS empty_lyrics
    `)
  ).rows as unknown as Array<Record<string, number>>;

  check("songs table is not empty", stats.songs > 0, `${stats.songs} songs`);
  check(
    "at least one song is active",
    stats.active > 0,
    `${stats.active} active`,
  );
  check(
    "slugs are unique",
    stats.slugs === stats.songs,
    `${stats.slugs}/${stats.songs}`,
  );
  check("no orphaned tracks", stats.orphans === 0);
  check("no song has empty lyrics", stats.empty_lyrics === 0);
  check(
    "id sequence is past migrated ids",
    stats.seq >= stats.max_id,
    `seq=${stats.seq} max_id=${stats.max_id}`,
  );

  const [songsWithoutTracks] = (
    await db.execute(sql`
      SELECT count(*)::int AS n FROM songs s
      WHERE NOT EXISTS (SELECT 1 FROM tracks t WHERE t.song_id = s.id)
    `)
  ).rows as unknown as Array<{ n: number }>;

  check(
    "every song has at least one track",
    songsWithoutTracks.n === 0,
    `${songsWithoutTracks.n} without tracks`,
  );

  console.log("\nR2 objects");

  const trackRows = (
    await db.execute(sql`
      SELECT s.slug, t.voice, t.object_key, t.size_bytes
      FROM tracks t JOIN songs s ON s.id = t.song_id
      ORDER BY s.slug, t.voice
    `)
  ).rows as unknown as Array<{
    slug: string;
    voice: string;
    object_key: string;
    size_bytes: number | null;
  }>;

  let objectsOk = 0;
  const objectProblems: string[] = [];

  for (const row of trackRows) {
    try {
      const head = await client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: row.object_key }),
      );
      if (row.size_bytes !== null && head.ContentLength !== row.size_bytes) {
        objectProblems.push(
          `${row.object_key} size ${head.ContentLength} != db ${row.size_bytes}`,
        );
      } else {
        objectsOk += 1;
      }
    } catch {
      objectProblems.push(`${row.object_key} MISSING`);
    }
  }

  check(
    `all ${trackRows.length} track objects exist with matching size`,
    objectProblems.length === 0,
    objectProblems.slice(0, 5).join("; "),
  );
  check(
    "track rows were found at all",
    trackRows.length > 0,
    `${objectsOk} verified`,
  );

  console.log("\nPublic access");

  const probe = trackRows[0];
  if (probe) {
    const url = `${publicUrl}/${probe.object_key}`;

    const head = await fetch(url, { method: "HEAD" });
    check(
      "public HEAD returns 200",
      head.status === 200,
      `status=${head.status}`,
    );
    check(
      "content-type is audio/mpeg",
      head.headers.get("content-type") === "audio/mpeg",
      head.headers.get("content-type") ?? "none",
    );
    check(
      "cache-control is immutable",
      (head.headers.get("cache-control") ?? "").includes("immutable"),
      head.headers.get("cache-control") ?? "none",
    );

    const ranged = await fetch(url, { headers: { Range: "bytes=0-1023" } });
    check(
      "range request returns 206 (seeking works)",
      ranged.status === 206,
      `status=${ranged.status}`,
    );

    const cors = await fetch(url, {
      headers: { Origin: "http://localhost:3000" },
    });
    const allowOrigin = cors.headers.get("access-control-allow-origin");
    check(
      "CORS allows browser fetch (needed for the download button)",
      allowOrigin !== null,
      allowOrigin ?? "no access-control-allow-origin header",
    );
  }

  console.log("");

  if (failures.length > 0) {
    console.error(`${failures.length} check(s) FAILED:`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }

  console.log("All checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
