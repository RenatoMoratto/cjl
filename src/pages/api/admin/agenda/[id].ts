import type { NextApiRequest } from "next";

import { parseBody, queryParam, withAdminRoute } from "@/lib/api/admin";
import {
  agendaEventIdSchema,
  updateAgendaEventSchema,
} from "@/lib/validation/agenda";
import { deleteEvent, updateEvent } from "@/services/agenda";
import { ServiceError } from "@/services/errors";

/**
 * PROTECTED-BY-KILL-SWITCH ONLY — see src/lib/api/admin.ts.
 *
 *   PATCH  /api/admin/agenda/:id — update an event
 *   DELETE /api/admin/agenda/:id — delete an event
 */
export default withAdminRoute({
  PATCH: async (req, res) => {
    const id = requireId(req);
    const input = parseBody(res, updateAgendaEventSchema, req.body);
    if (!input) return;

    return res.status(200).json(await updateEvent(id, input));
  },

  DELETE: async (req, res) => {
    return res.status(200).json(await deleteEvent(requireId(req)));
  },
});

/** Throws a ServiceError the wrapper turns into a 422, rather than NaN. */
function requireId(req: NextApiRequest): number {
  const parsed = agendaEventIdSchema.safeParse(queryParam(req, "id"));

  if (!parsed.success) {
    throw new ServiceError("invalid", "Identificador inválido");
  }

  return parsed.data;
}
