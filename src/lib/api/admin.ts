import type { NextApiHandler, NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { ZodError, type ZodType } from "zod";

import { decideAdminAccess, isAdminApiEnabled } from "@/lib/auth/admins";
import { authOptions } from "@/lib/auth/options";
import { ServiceError } from "@/services/errors";

/**
 * ============================================================================
 * THE MUTATION BOUNDARY — READ BEFORE ADDING A ROUTE UNDER /api/admin
 * ============================================================================
 *
 * Every route under /api/admin can create, modify and delete songs, and can
 * hand out write access to the R2 bucket in the form of presigned upload URLs.
 * Two latches stand in front of all of them, and both are applied here:
 *
 *   1. ADMIN_API_ENABLED must be exactly "true", or every route answers 404 and
 *      no handler runs. This is a deployment switch, not a statement about the
 *      caller: leave it unset on preview deployments and the surface simply is
 *      not there.
 *   2. A Google session whose email is in ADMIN_EMAILS. The list is checked on
 *      every request, not only at sign-in, so removing an address revokes
 *      access immediately instead of at the next login.
 *
 * The policy behind the 404/401/403 split lives in decideAdminAccess in
 * src/lib/auth/admins.ts — a pure function, unit tested, shared with the page
 * guard in src/lib/auth/page.ts so the API and the UI cannot drift on who gets
 * in.
 *
 * Still deliberately NOT relied on as authentication, because each would read
 * as protection while providing close to none:
 *   - a shared password or bearer token in an env var, compared in this file;
 *   - a check on Origin, Referer or User-Agent to establish who is calling;
 *   - anything enforced in the browser, which is not a trust boundary.
 *
 * The Sec-Fetch-Site check below is not an exception to that. It never decides
 * who the caller is — the session has already done that — and it cannot admit
 * anyone. It only refuses cross-site writes, layered behind the identity check
 * rather than in place of one.
 *
 * Every entry point that needs this goes through withAdminRoute; there is no
 * way to add an admin route that skips it.
 */

export interface ApiError {
  error: string;
  /** Field-level messages, keyed by input path, for form display. */
  fields?: Record<string, string[]>;
}

/**
 * Establishes that the caller may mutate, answering and returning false if not.
 *
 * The session is not read at all while the kill switch is off: there is no JWT
 * to verify and no cookie to parse, so an unauthenticated prober has nothing
 * here to work against.
 */
async function requireAdmin(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<boolean> {
  const enabled = isAdminApiEnabled();
  const session = enabled
    ? await getServerSession(req, res, authOptions())
    : null;

  const decision = decideAdminAccess({ enabled, email: session?.user?.email });

  if (!decision.ok) {
    if (decision.status === 403) {
      // Almost always a revoked address still holding a valid cookie. Worth a
      // line in the log, since the alternative reading is a misconfiguration.
      console.warn("Admin route refused a session outside the allowlist", {
        email: session?.user?.email,
      });
    }

    res.status(decision.status).json({ error: decision.error });
    return false;
  }

  return isSameSiteWrite(req, res);
}

/**
 * Refuses a cross-site write.
 *
 * The session cookie is SameSite=Lax, so a browser already declines to attach
 * it to a cross-site POST, PATCH or DELETE. This is the same rule stated a
 * second time, close to the thing it protects. A request without the header at
 * all — curl, an old browser — is allowed through, so nothing legitimate
 * breaks; the header is only ever used to reject.
 */
function isSameSiteWrite(req: NextApiRequest, res: NextApiResponse): boolean {
  if (!req.method || req.method === "GET" || req.method === "HEAD") return true;

  const site = req.headers["sec-fetch-site"];

  if (typeof site === "string" && site !== "same-origin") {
    res.status(403).json({ error: "Requisição de origem não permitida" });
    return false;
  }

  return true;
}

type MethodHandlers = Partial<Record<string, NextApiHandler>>;

/**
 * Wraps a set of method handlers with the admin guard and error translation.
 *
 * Centralising it means a new admin route cannot accidentally ship without the
 * guard: there is no way to add one except through this function.
 */
export function withAdminRoute(handlers: MethodHandlers): NextApiHandler {
  const allowed = Object.keys(handlers);

  return async (req, res) => {
    // First thing, so it covers every path out of here: the guard's 404, a
    // 405, a validation failure and the handler's own response alike. None of
    // these may be cached by the CDN or the browser.
    res.setHeader("Cache-Control", "no-store");

    try {
      // Inside the try, unlike when this guard was synchronous: it now awaits a
      // session, and a rejection there (a malformed secret, a corrupt cookie)
      // would otherwise escape as an unhandled rejection and be answered by
      // Next itself, bypassing sendError and its rule that internal details
      // never reach the client.
      if (!(await requireAdmin(req, res))) return;

      const handler = req.method ? handlers[req.method] : undefined;

      if (!handler) {
        res.setHeader("Allow", allowed.join(", "));
        return res
          .status(405)
          .json({ error: `Método ${req.method} não permitido` });
      }

      return await handler(req, res);
    } catch (error) {
      return sendError(res, error);
    }
  };
}

/**
 * Parses a request body, answering 422 with field paths when it does not fit.
 *
 * Returns null once it has responded, so callers stop by checking for null
 * rather than by catching.
 */
export function parseBody<T>(
  res: NextApiResponse,
  schema: ZodType<T>,
  body: unknown,
): T | null {
  const result = schema.safeParse(body);

  if (result.success) return result.data;

  res.status(422).json({
    error: "Dados inválidos",
    fields: fieldErrors(result.error),
  });

  return null;
}

/** Reads a single-valued query parameter, which Next may hand over as an array. */
export function queryParam(
  req: NextApiRequest,
  name: string,
): string | undefined {
  const value = req.query[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Maps a thrown value onto a response.
 *
 * ServiceError carries its own status because the service knows why it failed.
 * Anything else is a bug or an outage: it is logged in full and reported as a
 * generic 500, so internal details never reach the client.
 */
function sendError(res: NextApiResponse<ApiError>, error: unknown): void {
  if (error instanceof ServiceError) {
    res.status(error.status).json({ error: error.message });
    return;
  }

  if (error instanceof ZodError) {
    res
      .status(422)
      .json({ error: "Dados inválidos", fields: fieldErrors(error) });
    return;
  }

  console.error("Unhandled error in an admin route", error);
  res.status(500).json({ error: "Erro interno do servidor" });
}

function fieldErrors(error: ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const path = issue.path.join(".") || "_";
    (fields[path] ??= []).push(issue.message);
  }

  return fields;
}
