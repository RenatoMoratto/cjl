import { env } from "@/lib/env";

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
