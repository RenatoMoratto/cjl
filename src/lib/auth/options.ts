import type { AuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

import { isAllowedAdminEmail } from "@/lib/auth/admins";
import { safeAdminPath } from "@/lib/auth/paths";
import { env } from "@/lib/env";

/**
 * NextAuth configuration for the admin surface.
 *
 * Google is the only provider and there is no database adapter: the allowlist
 * in src/lib/auth/admins.ts is the whole user store, so there is nothing per
 * person to persist. That also keeps Neon out of the sign-in path entirely — a
 * cold database can never make signing in slow or flaky.
 */

/** Eight hours: long enough for an afternoon of editing, short enough to expire. */
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

let cached: AuthOptions | null = null;

/**
 * Built on first use rather than exported as a const.
 *
 * src/lib/env.ts reads its values through getters so that a missing variable
 * throws where it is used instead of at import time. A module-scope const here
 * would undo that: `next build` imports every page module while collecting page
 * data, so a build on a machine without Google credentials would fail.
 */
export function authOptions(): AuthOptions {
  if (cached) return cached;

  cached = {
    providers: [
      GoogleProvider({
        clientId: env.googleClientId,
        clientSecret: env.googleClientSecret,
        // Admins often have a personal Google account signed in already, and
        // silently reusing it produces an "access denied" they cannot explain.
        authorization: { params: { prompt: "select_account" } },
      }),
    ],
    secret: env.nextAuthSecret,
    session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
    jwt: { maxAge: SESSION_MAX_AGE_SECONDS },
    pages: { signIn: "/admin/entrar", error: "/admin/entrar" },
    callbacks: {
      /**
       * The first of the two places the allowlist is enforced. Refusing here
       * means a stranger never receives a session cookie at all; requireAdmin
       * checks again on every request, which is what makes removing an address
       * take effect immediately rather than at the next sign-in.
       */
      signIn({ user, account, profile }) {
        if (account?.provider !== "google") return false;

        const verified = (profile as { email_verified?: boolean } | undefined)
          ?.email_verified;

        if (verified === false) return false;

        return isAllowedAdminEmail(user.email);
      },
      /**
       * Stricter than the NextAuth default, which follows any same-origin path.
       * Every successful sign-in lands somewhere under /admin, so a callbackUrl
       * that says otherwise is either a mistake or an attempt.
       */
      redirect({ url, baseUrl }) {
        if (url.startsWith(baseUrl)) {
          return `${baseUrl}${safeAdminPath(url.slice(baseUrl.length) || "/admin")}`;
        }

        return `${baseUrl}${safeAdminPath(url)}`;
      },
    },
  };

  return cached;
}
