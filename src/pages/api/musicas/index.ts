import { NextApiRequest, NextApiResponse } from "next";

import { listActiveSongs } from "@/services/songs";
import { SongSummary } from "@/types";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Array<SongSummary> | { error: string }>,
) {
  try {
    const songs = await listActiveSongs();

    // Served from Vercel's CDN, which also hides Neon's cold start from users.
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=86400",
    );

    return res.status(200).json(songs);
  } catch (error) {
    console.error("Failed to list songs", error);
    return res.status(500).json({ error: "Erro ao carregar as músicas" });
  }
}
