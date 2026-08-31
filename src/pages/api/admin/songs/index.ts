import { parseBody, withAdminRoute } from "@/lib/api/admin";
import { createSongSchema } from "@/lib/validation/songs";
import { createSong, listSongsForManagement } from "@/services/songs";

/**
 * PROTECTED-BY-KILL-SWITCH ONLY — see src/lib/api/admin.ts.
 *
 *   GET  /api/admin/songs  — every song, inactive ones included
 *   POST /api/admin/songs  — create a song (no audio; kits are uploaded after)
 */
export default withAdminRoute({
  GET: async (req, res) => {
    return res.status(200).json(await listSongsForManagement());
  },

  POST: async (req, res) => {
    const input = parseBody(res, createSongSchema, req.body);
    if (!input) return;

    const song = await createSong(input);

    return res.status(201).json(song);
  },
});
