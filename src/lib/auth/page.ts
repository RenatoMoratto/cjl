import type { GetServerSideProps, GetServerSidePropsContext } from "next";
import { getServerSession } from "next-auth/next";

import { decideAdminAccess, isAdminApiEnabled } from "@/lib/auth/admins";
import { authOptions } from "@/lib/auth/options";

/**
 * The page-side half of the admin guard.
 *
 * Shares decideAdminAccess with requireAdmin in src/lib/api/admin.ts, so the
 * pages and the API can never disagree about who is an admin. The two differ
 * only in how they answer: a page redirects to the sign-in screen where the
 * API returns a status.
 *
 * Guarding in getServerSideProps rather than in the browser means the admin
 * HTML is never produced for anyone who should not see it — there is no flash
 * of admin chrome before a client-side redirect fires, and nothing later
 * inlined into props can leak. It also lets the whole section avoid
 * SessionProvider, which would otherwise fetch /api/auth/session on every
 * public page load just to serve five admin pages.
 */

/** The signed-in admin, as handed to the page. */
export interface AdminIdentity {
  email: string;
  name: string | null;
  image: string | null;
}

export interface AdminPageProps {
  admin: AdminIdentity;
}

/**
 * Guards an admin page. Deliberately fetches nothing.
 *
 * Every page in this section loads its data from /api/admin in the browser,
 * exactly like the public pages load theirs — keeping this to a guard means
 * server rendering never touches the database and there is one way, not two,
 * that admin data reaches a screen.
 */
export function withAdminPage(): GetServerSideProps<AdminPageProps> {
  return async (ctx: GetServerSidePropsContext) => {
    // Same rule the API applies to its own responses: nothing about an admin
    // screen may sit in a shared cache.
    ctx.res.setHeader("Cache-Control", "no-store");

    const enabled = isAdminApiEnabled();
    const session = enabled
      ? await getServerSession(ctx.req, ctx.res, authOptions())
      : null;

    const decision = decideAdminAccess({
      enabled,
      email: session?.user?.email,
    });

    if (!decision.ok) {
      // The surface does not exist in this deployment, so neither does the
      // sign-in page — redirecting there would be a dead end.
      if (decision.status === 404) return { notFound: true };

      const query =
        decision.status === 403
          ? "error=AccessDenied"
          : `callbackUrl=${encodeURIComponent(ctx.resolvedUrl)}`;

      return {
        redirect: { destination: `/admin/entrar?${query}`, permanent: false },
      };
    }

    return {
      props: {
        admin: {
          // decideAdminAccess only returns ok with an email present.
          email: session?.user?.email as string,
          // Next refuses to serialise undefined, which these two often are.
          name: session?.user?.name ?? null,
          image: session?.user?.image ?? null,
        },
      },
    };
  };
}
