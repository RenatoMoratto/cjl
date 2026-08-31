import { parseBody, withAdminRoute } from "@/lib/api/admin";
import { createUploadUrlSchema } from "@/lib/validation/songs";
import { prepareTrackUpload } from "@/services/tracks";

/**
 * PROTECTED-BY-KILL-SWITCH ONLY — see src/lib/api/admin.ts.
 *
 * This route is the most sensitive of the set: a successful response is a
 * time-limited write grant on the R2 bucket, usable by whoever holds it.
 *
 *   POST /api/admin/tracks/upload-url — step 1 of 3 of an audio upload
 *
 * Returns { uploadUrl, objectKey, requiredHeaders, expiresAt }. The browser
 * then PUTs the file to uploadUrl with exactly those headers (step 2) and
 * posts the objectKey back to /api/admin/tracks (step 3), which is the point
 * at which anything is written to the database. The MP3 itself never passes
 * through Vercel.
 */
export default withAdminRoute({
  POST: async (req, res) => {
    const input = parseBody(res, createUploadUrlSchema, req.body);
    if (!input) return;

    return res.status(200).json(await prepareTrackUpload(input));
  },
});
