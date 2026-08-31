import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { CANONICAL_AUDIO_MIME_TYPE } from "@/lib/audio";
import { env } from "@/lib/env";

/**
 * Server-side access to the R2 bucket.
 *
 * Nothing here ever streams an audio body. Uploads go straight from the
 * browser to R2 through a presigned URL, so a 6 MB kit never crosses a Vercel
 * function: the server only signs, inspects (HEAD) and deletes.
 */

/**
 * Cache headers written onto every uploaded object.
 *
 * Safe to make immutable precisely because a replacement is a new key — see
 * buildTrackObjectKey. An object at a given key never changes content.
 */
export const AUDIO_CACHE_CONTROL = "public, max-age=31536000, immutable";

/**
 * How long a presigned upload URL stays valid.
 *
 * Long enough for a slow mobile connection to finish a 30 MB file, short
 * enough that a URL leaked from a browser history or a proxy log is not a
 * standing write grant on the bucket.
 */
export const UPLOAD_URL_TTL_SECONDS = 15 * 60;

let client: S3Client | undefined;

/**
 * Built on first use, not at import time: env reads throw when a variable is
 * missing, and the public read paths import this module for buildAudioUrl
 * alone. Reused across invocations so warm serverless instances skip the
 * credential and endpoint setup.
 */
function s3(): S3Client {
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${env.r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.r2AccessKeyId,
      secretAccessKey: env.r2SecretAccessKey,
    },
  });

  return client;
}

/**
 * Builds the public URL the browser loads audio from.
 *
 * The database stores only object keys, so the public host is a deployment
 * concern rather than stored data — moving from the r2.dev development
 * subdomain to a Cloudflare custom domain is an env-var change, not a
 * migration.
 */
export function buildAudioUrl(objectKey: string): string {
  return `${env.r2PublicUrl}/${objectKey}`;
}

export interface PresignedUpload {
  uploadUrl: string;
  objectKey: string;
  /**
   * Headers the browser must send on the PUT, verbatim.
   *
   * SigV4 covers these, so a request that omits or alters one is rejected by
   * R2 with a signature mismatch rather than silently storing an object with
   * different metadata.
   */
  requiredHeaders: Record<string, string>;
  expiresAt: string;
}

/**
 * Signs a single-object PUT.
 *
 * The signature is scoped to one exact key, so the URL cannot be redirected at
 * another object in the bucket. It does not constrain the body: S3-style
 * presigned PUTs carry no length limit, which is why the confirmation step
 * HEADs the stored object and enforces the size there.
 */
export async function createPresignedUpload(
  objectKey: string,
): Promise<PresignedUpload> {
  const requiredHeaders = {
    "Content-Type": CANONICAL_AUDIO_MIME_TYPE,
    "Cache-Control": AUDIO_CACHE_CONTROL,
  };

  const uploadUrl = await getSignedUrl(
    s3(),
    new PutObjectCommand({
      Bucket: env.r2BucketName,
      Key: objectKey,
      // Normalised rather than echoing back whatever the browser reported, so
      // every object in the bucket is served as audio/mpeg.
      ContentType: CANONICAL_AUDIO_MIME_TYPE,
      CacheControl: AUDIO_CACHE_CONTROL,
    }),
    {
      expiresIn: UPLOAD_URL_TTL_SECONDS,
      // Without this the presigner signs `host` alone and leaves both headers
      // out of the signature: the URL would then accept a PUT of any content
      // type, and an upload that simply omitted Cache-Control would store an
      // object with no cache metadata at all. Naming them makes SigV4 cover
      // them, and R2 answers 403 when what arrives does not match.
      signableHeaders: new Set(["content-type", "cache-control"]),
    },
  );

  return {
    uploadUrl,
    objectKey,
    requiredHeaders,
    expiresAt: new Date(
      Date.now() + UPLOAD_URL_TTL_SECONDS * 1000,
    ).toISOString(),
  };
}

export interface StoredObject {
  sizeBytes: number;
  contentType?: string;
}

/** Returns the stored object's metadata, or null when it does not exist. */
export async function headObject(
  objectKey: string,
): Promise<StoredObject | null> {
  try {
    const head = await s3().send(
      new HeadObjectCommand({ Bucket: env.r2BucketName, Key: objectKey }),
    );

    return {
      sizeBytes: head.ContentLength ?? 0,
      contentType: head.ContentType,
    };
  } catch (error) {
    if (httpStatus(error) === 404) return null;
    throw error;
  }
}

/**
 * Deletes an object.
 *
 * Only ever called for a key no database row references any more: either a
 * failed upload being cleaned up, or an entry the sweeper picked off
 * pending_object_deletions after its grace period.
 */
export async function deleteObject(objectKey: string): Promise<void> {
  await s3().send(
    new DeleteObjectCommand({ Bucket: env.r2BucketName, Key: objectKey }),
  );
}

function httpStatus(error: unknown): number | undefined {
  return (error as { $metadata?: { httpStatusCode?: number } }).$metadata
    ?.httpStatusCode;
}
