/**
 * Server-only environment access.
 *
 * Values are read through getters so a missing variable throws where it is
 * actually used, not at import time — otherwise `next build` would fail on
 * modules that merely import this file.
 *
 * ADMIN_EMAILS is deliberately NOT here: an unset allowlist must lock everyone
 * out rather than throw, so it is read directly in src/lib/auth/admins.ts.
 */

function required(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get r2AccountId() {
    return required("R2_ACCOUNT_ID");
  },
  get r2AccessKeyId() {
    return required("R2_ACCESS_KEY_ID");
  },
  get r2SecretAccessKey() {
    return required("R2_SECRET_ACCESS_KEY");
  },
  get r2BucketName() {
    return required("R2_BUCKET_NAME");
  },
  /** Public audio base URL, normalised without a trailing slash. */
  get r2PublicUrl() {
    return required("R2_PUBLIC_URL").replace(/\/+$/, "");
  },
  get googleClientId() {
    return required("GOOGLE_CLIENT_ID");
  },
  get googleClientSecret() {
    return required("GOOGLE_CLIENT_SECRET");
  },
  /** Signs and encrypts the admin session cookie. */
  get nextAuthSecret() {
    return required("NEXTAUTH_SECRET");
  },
};
