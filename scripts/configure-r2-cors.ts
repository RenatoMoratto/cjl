/**
 * Applies the bucket CORS policy that the "download MP3" button depends on.
 *
 *   npx tsx scripts/configure-r2-cors.ts
 *
 * Playback does not need CORS — a media element loads cross-origin audio
 * without it. The download button does, because the `download` attribute is
 * ignored on cross-origin links, so the client fetches the file and re-serves
 * it as a same-origin blob URL.
 *
 * GET/HEAD from any origin is not a widening of access: the bucket is already
 * world-readable over its public URL.
 *
 * NOTE: PutBucketCors is a bucket-level operation. An R2 API token scoped to
 * "Object Read & Write" gets AccessDenied here — it needs "Admin Read & Write".
 * The equivalent can also be set by hand in the Cloudflare dashboard under
 * R2 > the bucket > Settings > CORS policy.
 */

import {
  GetBucketCorsCommand,
  PutBucketCorsCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { config } from "dotenv";

config({ path: ".env.local" });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${requireEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
  },
});

const bucket = requireEnv("R2_BUCKET_NAME");

async function main() {
  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: ["*"],
            AllowedMethods: ["GET", "HEAD"],
            AllowedHeaders: ["range"],
            ExposeHeaders: ["content-length", "content-range", "accept-ranges"],
            MaxAgeSeconds: 86400,
          },
        ],
      },
    }),
  );

  const applied = await client.send(
    new GetBucketCorsCommand({ Bucket: bucket }),
  );
  console.log("CORS policy applied:");
  console.log(JSON.stringify(applied.CORSRules, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
