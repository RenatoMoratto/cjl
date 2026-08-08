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
 * NOTE: PutBucketCors is a bucket-level operation. An R2 API token scoped to
 * "Object Read & Write" gets AccessDenied here — it needs "Admin Read & Write".
 * The policy can also be pasted by hand in the Cloudflare dashboard under
 * R2 > the bucket > Settings > CORS policy, which is why this script always
 * prints it before trying to apply it.
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

/**
 * Origins permitted to fetch audio with JavaScript.
 *
 * Deliberately an explicit list rather than "*". Note that www and apex are
 * separate origins to a browser, as are the two spellings of the domain, so
 * each one that serves the site needs its own entry.
 */
const ALLOWED_ORIGINS = [
  "https://coraljovemlondrina.com.br",
  "https://www.coraljovemlondrina.com.br",
  "https://coraljovemdelondrina.com.br",
  // Vercel preview deployments get a fresh hostname per deploy. R2 follows the
  // S3 CORS spec, which permits a single "*" wildcard inside an origin.
  "https://*.vercel.app",
  "http://localhost:3000",
];

const CORS_RULES = [
  {
    AllowedOrigins: ALLOWED_ORIGINS,
    AllowedMethods: ["GET", "HEAD"],
    AllowedHeaders: ["range"],
    ExposeHeaders: ["content-length", "content-range", "accept-ranges"],
    MaxAgeSeconds: 86400,
  },
];

async function main() {
  // Printed first so the policy is still usable if the token cannot apply it.
  console.log("CORS policy (paste into the Cloudflare dashboard if needed):\n");
  console.log(JSON.stringify(CORS_RULES, null, 2));

  try {
    await client.send(
      new PutBucketCorsCommand({
        Bucket: bucket,
        CORSConfiguration: { CORSRules: CORS_RULES },
      }),
    );
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } })
      .$metadata?.httpStatusCode;

    if (status === 403) {
      console.error(
        "\nAccessDenied applying the policy. The R2 token needs " +
          '"Admin Read & Write"; "Object Read & Write" is not enough.\n' +
          "Paste the JSON above into R2 > bucket > Settings > CORS policy instead.",
      );
      process.exit(1);
    }

    throw error;
  }

  const applied = await client.send(
    new GetBucketCorsCommand({ Bucket: bucket }),
  );
  console.log("\nApplied. Bucket now reports:\n");
  console.log(JSON.stringify(applied.CORSRules, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
