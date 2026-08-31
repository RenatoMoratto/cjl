import { queryParam, withAdminRoute } from "@/lib/api/admin";
import { trackIdSchema } from "@/lib/validation/songs";
import { ServiceError } from "@/services/errors";
import { deleteTrack } from "@/services/tracks";

/**
 * PROTECTED-BY-KILL-SWITCH ONLY — see src/lib/api/admin.ts.
 *
 *   DELETE /api/admin/tracks/:id — remove one voice kit from a song
 *
 * The response reports the orphaned key as queued, not deleted: the object
 * outlives the row by a grace period so that anyone streaming it right now is
 * not cut off. See src/services/storage-cleanup.ts.
 */
export default withAdminRoute({
  DELETE: async (req, res) => {
    const parsed = trackIdSchema.safeParse(queryParam(req, "id"));

    if (!parsed.success) {
      throw new ServiceError("invalid", "Identificador inválido");
    }

    return res.status(200).json(await deleteTrack(parsed.data));
  },
});
