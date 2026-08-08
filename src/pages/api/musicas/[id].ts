import { NextApiRequest, NextApiResponse } from "next";

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

    res.setHeader(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=86400",
    );

    return res.status(200).json(song);
  } catch (error) {
    console.error(`Failed to load song ${id}`, error);
    return res.status(500).json({ error: "Erro ao carregar a música" });
  }
}
