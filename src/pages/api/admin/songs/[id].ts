import type { NextApiRequest } from "next";

import { parseBody, queryParam, withAdminRoute } from "@/lib/api/admin";
import { songIdSchema, updateSongSchema } from "@/lib/validation/songs";
import { deleteSong, getSongById, updateSong } from "@/services/songs";
import { ServiceError } from "@/services/errors";

/**
 * PROTECTED-BY-KILL-SWITCH ONLY — see src/lib/api/admin.ts.
 *
 *   GET    /api/admin/songs/:id — one song, whatever its status
 *   PATCH  /api/admin/songs/:id — update metadata (not audio)
 *   DELETE /api/admin/songs/:id — delete the song, its kits and, eventually,
 *                                 the objects behind them
 */
export default withAdminRoute({
  GET: async (req, res) => {
    const song = await getSongById(requireId(req));

    if (!song) {
      throw new ServiceError("not_found", "Música não encontrada");
    }

    return res.status(200).json(song);
  },

  PATCH: async (req, res) => {
    const id = requireId(req);
    const input = parseBody(res, updateSongSchema, req.body);
    if (!input) return;

    return res.status(200).json(await updateSong(id, input));
  },

  DELETE: async (req, res) => {
    return res.status(200).json(await deleteSong(requireId(req)));
  },
});

/** Throws a ServiceError the wrapper turns into a 422, rather than NaN. */
function requireId(req: NextApiRequest): number {
  const parsed = songIdSchema.safeParse(queryParam(req, "id"));

  if (!parsed.success) {
    throw new ServiceError("invalid", "Identificador inválido");
  }

  return parsed.data;
}
