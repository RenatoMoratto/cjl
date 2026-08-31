/**
 * Where a sign-in is allowed to land.
 *
 * NextAuth carries a callbackUrl through the OAuth round trip, and the
 * sign-in page reads one out of the query string. Both are caller-supplied, so
 * both go through here: anything that is not a path inside /admin collapses to
 * /admin rather than being followed.
 */

const ADMIN_HOME = "/admin";

/**
 * Narrows an arbitrary value to a safe same-origin admin path.
 *
 * Rejects absolute URLs, protocol-relative "//host" (which a browser resolves
 * as a different origin), and backslash variants that some parsers normalise
 * into slashes. Anything unrecognised becomes the admin home, so a bad
 * callbackUrl is a mild redirect rather than an open one.
 */
export function safeAdminPath(value: unknown): string {
  if (typeof value !== "string") return ADMIN_HOME;

  const path = value.trim();

  if (!path.startsWith("/")) return ADMIN_HOME;
  if (path.startsWith("//") || path.startsWith("/\\")) return ADMIN_HOME;
  if (path !== ADMIN_HOME && !path.startsWith(`${ADMIN_HOME}/`)) {
    return ADMIN_HOME;
  }

  return path;
}
