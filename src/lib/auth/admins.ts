/**
 * Who is allowed into the admin surface, and what a refusal looks like.
 *
 * This module imports nothing — not the database, not NextAuth, not even
 * src/lib/env.ts. That is deliberate: the access policy is the one rule in this
 * project worth testing directly, and keeping it dependency-free means
 * admins.test.ts can exercise it under `node --test` without a request, a
 * session, or a mock.
 *
 * The decision itself lives in decideAdminAccess, a pure function. requireAdmin
 * in src/lib/api/admin.ts and withAdminPage in src/lib/auth/page.ts both call
 * it, so the API and the pages can never drift on who gets in.
 */

/**
 * The deployment kill switch, still the first of the two latches.
 *
 * Read per call rather than once at module scope so the guard is testable in
 * process, and so `next dev` picks up an .env.local edit without a restart.
 */
export function isAdminApiEnabled(): boolean {
  return process.env.ADMIN_API_ENABLED === "true";
}

/** Splits ADMIN_EMAILS, tolerating spaces and empty entries. */
export function parseAdminEmails(raw: string | undefined): string[] {
  if (!raw) return [];

  return raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

/**
 * Exact membership, and nothing looser.
 *
 * The comparison is full-string equality on purpose: a substring or suffix test
 * would let admin@example.com.evil.tld in against an allowlist of
 * admin@example.com. admins.test.ts asserts that case so it cannot regress.
 *
 * Fails closed. An unset or empty allowlist admits nobody, which is why
 * ADMIN_EMAILS is read here rather than through env.ts's required() — a missing
 * list should lock the door, not crash the process.
 */
export function isAllowedAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;

  const allowed = parseAdminEmails(process.env.ADMIN_EMAILS);

  if (allowed.length === 0) {
    console.warn(
      "ADMIN_EMAILS is empty, so no account can reach the admin surface.",
    );
    return false;
  }

  return allowed.includes(email.trim().toLowerCase());
}

export type AdminDecision =
  | { ok: true }
  | { ok: false; status: 404 | 401 | 403; error: string };

/**
 * The whole 404/401/403 doctrine, in one reviewable place.
 *
 * 404 when the flag is off: the surface genuinely does not exist in this
 * deployment, and a 403 would only advertise that a mutation surface is here
 * and merely switched off. That is a fact about the deployment, not about the
 * caller, so there is nothing to challenge.
 *
 * 401 for an anonymous caller: unlike before, there is now an identity to
 * challenge and a sign-in page to send them to. Sessions expire after eight
 * hours, and an admin halfway through timing a lyric needs to be told to sign
 * in again rather than shown a 404 they cannot act on.
 *
 * 403 for a signed-in caller outside the list: rare by construction, since the
 * signIn callback refuses to issue them a session at all. In practice this
 * branch means revocation — an address removed from ADMIN_EMAILS while a cookie
 * was still live — which is exactly when an unambiguous status matters. It is
 * also why the check runs here on every request and not only at sign-in.
 */
export function decideAdminAccess(input: {
  enabled: boolean;
  email: string | null | undefined;
}): AdminDecision {
  if (!input.enabled) {
    return { ok: false, status: 404, error: "Not found" };
  }

  if (!input.email) {
    return {
      ok: false,
      status: 401,
      error: "Sua sessão expirou. Entre novamente para continuar.",
    };
  }

  if (!isAllowedAdminEmail(input.email)) {
    return {
      ok: false,
      status: 403,
      error: "Esta conta não tem acesso à administração.",
    };
  }

  return { ok: true };
}
