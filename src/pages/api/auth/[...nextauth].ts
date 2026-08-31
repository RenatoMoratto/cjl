import type { NextApiRequest, NextApiResponse } from "next";
import NextAuth from "next-auth";

import { isAdminApiEnabled } from "@/lib/auth/admins";
import { authOptions } from "@/lib/auth/options";

/**
 * The only route under /api that does not go through withAdminRoute, because
 * it is what establishes the identity that guard checks. It is still gated on
 * the same kill switch: a deployment with the flag off has no OAuth endpoint at
 * all, rather than one that hands out cookies which grant nothing.
 *
 * NextAuth is invoked per request instead of configured at module scope so the
 * lazy environment reads in authOptions() stay lazy — see its file header.
 */
export default async function auth(req: NextApiRequest, res: NextApiResponse) {
  if (!isAdminApiEnabled()) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(404).json({ error: "Not found" });
  }

  return NextAuth(req, res, authOptions());
}
