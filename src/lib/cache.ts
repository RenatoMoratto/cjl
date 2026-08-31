import { invalidateByTag } from "@vercel/functions";
import type { NextApiResponse } from "next";

/**
 * Cache control for the public song endpoints, and the matching invalidation.
 *
 * /api/musicas and /api/musicas/[id] are served from Vercel's CDN, which is
 * what hides Neon's cold start from choristers. That cache is also why a
 * mutation is not finished when the database commits: until the edge is told
 * otherwise it keeps serving the previous list for up to s-maxage seconds.
 *
 * Every cached response is tagged, and every successful mutation invalidates
 * the tags it touched. "Invalidate" rather than "delete" is deliberate — it
 * marks entries stale and revalidates in the background, so a save never
 * exposes a burst of users to a cold Neon query.
 */

const CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=86400";

/** Applied to every cached song response — invalidated by any mutation. */
export const SONGS_CACHE_TAG = "songs";

/** Applied to a single song's response, so one edit does not flush the list. */
export function songCacheTag(songId: number): string {
  return `song-${songId}`;
}

/**
 * Sets the caching and tagging headers on a public read response.
 *
 * The tag header is Vercel-specific and simply ignored elsewhere (including by
 * `next dev`), so the routes behave identically off-platform, just without
 * on-demand purging.
 */
export function setPublicSongCacheHeaders(
  res: NextApiResponse,
  tags: string[],
): void {
  res.setHeader("Cache-Control", CACHE_CONTROL);
  res.setHeader("Vercel-Cache-Tag", tags.join(","));
}

/**
 * Marks the public song cache stale after a successful mutation.
 *
 * Never throws. The database is already committed by the time this runs, so a
 * failed purge is a staleness problem bounded by s-maxage (five minutes), not
 * a reason to fail the request and leave the caller believing their edit was
 * rejected. Outside Vercel — local dev, tests — there is no edge cache to
 * purge and the call is skipped.
 */
export async function invalidatePublicSongCache(
  songId?: number,
): Promise<void> {
  const tags = songId
    ? [SONGS_CACHE_TAG, songCacheTag(songId)]
    : [SONGS_CACHE_TAG];

  if (!process.env.VERCEL) return;

  try {
    await invalidateByTag(tags);
  } catch (error) {
    console.error("Failed to invalidate the public song cache", {
      tags,
      error,
    });
  }
}
