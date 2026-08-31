import type { NextApiHandler, NextApiRequest, NextApiResponse } from "next";
import { ZodError, type ZodType } from "zod";

import { ServiceError } from "@/services/errors";

/**
 * ============================================================================
 * UNAUTHENTICATED MUTATION BOUNDARY — READ BEFORE EXPOSING AN ADMIN UI
 * ============================================================================
 *
 * Every route under /api/admin can create, modify and delete songs, and can
 * hand out write access to the R2 bucket in the form of presigned upload URLs.
 * There is no authentication in this project yet, so there is nothing here
 * that establishes *who* is calling.
 *
 * What this module does instead is keep those routes switched off. Unless
 * ADMIN_API_ENABLED is exactly "true" in the server environment, every admin
 * route answers 404 and no handler runs. That is a deployment kill switch, not
 * a security mechanism: anyone who can reach the origin while the flag is on
 * can do anything the admin UI could.
 *
 * Deliberately NOT done here, because each would read as protection while
 * providing close to none:
 *   - a shared password or bearer token in an env var, compared in this file;
 *   - a check on Origin, Referer or User-Agent;
 *   - anything enforced in the browser, which is not a trust boundary.
 *
 * Before any admin UI ships, replace requireAdmin's body with a real identity
 * check — a session from an auth provider, or Vercel's deployment protection
 * in front of the routes — and keep the flag as a second latch. Every entry
 * point that needs this is listed in the file header of each route under
 * src/pages/api/admin/, and all of them go through withAdminRoute below.
 */

const ADMIN_ENABLED = process.env.ADMIN_API_ENABLED === "true";

export interface ApiError {
  error: string;
  /** Field-level messages, keyed by input path, for form display. */
  fields?: Record<string, string[]>;
}

/**
 * Answers 404 and returns false when the caller must not proceed.
 *
 * 404 rather than 401/403: with no identity to challenge, a 403 would only
 * advertise that a mutation surface exists here and is merely switched off.
 */
function requireAdmin(req: NextApiRequest, res: NextApiResponse): boolean {
  if (!ADMIN_ENABLED) {
    res.status(404).json({ error: "Not found" });
    return false;
  }

  // TODO(auth): no caller identity is established here. See the file header.
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

    if (!requireAdmin(req, res)) return;

    const handler = req.method ? handlers[req.method] : undefined;

    if (!handler) {
      res.setHeader("Allow", allowed.join(", "));
      return res
        .status(405)
        .json({ error: `Método ${req.method} não permitido` });
    }

    try {
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
