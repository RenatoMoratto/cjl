import { parseBody, withAdminRoute } from "@/lib/api/admin";
import { confirmTrackUploadSchema } from "@/lib/validation/songs";
import { confirmTrackUpload } from "@/services/tracks";

/**
 * PROTECTED-BY-KILL-SWITCH ONLY — see src/lib/api/admin.ts.
 *
 *   POST /api/admin/tracks — step 3 of 3: persist a kit whose object is now
 *                            in R2. Adds a voice, or replaces the existing
 *                            one for that voice.
 *
 * Returns 409 (upload_missing) when the object is not in the bucket, which is
 * what a client sees if step 2 never finished — the row is not written, so the
 * song keeps whatever kit it had.
 */
export default withAdminRoute({
  POST: async (req, res) => {
    const input = parseBody(res, confirmTrackUploadSchema, req.body);
    if (!input) return;

    const track = await confirmTrackUpload(input);

    return res.status(track.replacedObjectKey ? 200 : 201).json(track);
  },
});
