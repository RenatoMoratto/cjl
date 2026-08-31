import { NextApiRequest, NextApiResponse } from "next";

import { setPublicSongCacheHeaders, SONGS_CACHE_TAG } from "@/lib/cache";
import { listActiveSongs } from "@/services/songs";
import { SongSummary } from "@/types";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Array<SongSummary> | { error: string }>,
) {
  try {
    const songs = await listActiveSongs();

    // Served from Vercel's CDN, which also hides Neon's cold start from users.
    // Tagged so any song mutation can purge it on demand — see src/lib/cache.
    setPublicSongCacheHeaders(res, [SONGS_CACHE_TAG]);

    return res.status(200).json(songs);
  } catch (error) {
    console.error("Failed to list songs", error);
    return res.status(500).json({ error: "Erro ao carregar as músicas" });
  }
}
