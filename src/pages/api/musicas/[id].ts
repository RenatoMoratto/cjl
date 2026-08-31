import { NextApiRequest, NextApiResponse } from "next";

import {
  setPublicSongCacheHeaders,
  songCacheTag,
  SONGS_CACHE_TAG,
} from "@/lib/cache";
import { getSongById } from "@/services/songs";
import { SongDetail } from "@/types";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SongDetail | { error: string }>,
) {
  const id = Number(
    Array.isArray(req.query.id) ? req.query.id[0] : req.query.id,
  );

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Identificador inválido" });
  }

  try {
    const song = await getSongById(id);

    if (!song) {
      return res.status(404).json({ error: "Música não encontrada" });
    }

    // Both tags: editing this song purges it, and a bulk change (reorder, or a
    // delete that shifts the list) purges every song response at once.
    setPublicSongCacheHeaders(res, [SONGS_CACHE_TAG, songCacheTag(song.id)]);

    return res.status(200).json(song);
  } catch (error) {
    console.error(`Failed to load song ${id}`, error);
    return res.status(500).json({ error: "Erro ao carregar a música" });
  }
}
