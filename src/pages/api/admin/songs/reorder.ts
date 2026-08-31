import { parseBody, withAdminRoute } from "@/lib/api/admin";
import { reorderSongsSchema } from "@/lib/validation/songs";
import { reorderSongs } from "@/services/songs";

/**
 * PROTECTED-BY-KILL-SWITCH ONLY — see src/lib/api/admin.ts.
 *
 *   POST /api/admin/songs/reorder — rewrite the public list order
 *
 * The body carries every song id in its new order. Sending a partial move
 * would silently mis-place songs the client had not loaded; the service
 * rejects a list that has drifted from the database instead.
 */
export default withAdminRoute({
  POST: async (req, res) => {
    const input = parseBody(res, reorderSongsSchema, req.body);
    if (!input) return;

    return res.status(200).json(await reorderSongs(input));
  },
});
