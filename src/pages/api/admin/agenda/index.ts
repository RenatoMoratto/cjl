import { parseBody, withAdminRoute } from "@/lib/api/admin";
import { createAgendaEventSchema } from "@/lib/validation/agenda";
import { createEvent, listEventsForManagement } from "@/services/agenda";

/**
 * PROTECTED-BY-KILL-SWITCH ONLY — see src/lib/api/admin.ts.
 *
 *   GET  /api/admin/agenda  — every event, past ones included
 *   POST /api/admin/agenda  — create an event
 */
export default withAdminRoute({
  GET: async (req, res) => {
    return res.status(200).json(await listEventsForManagement());
  },

  POST: async (req, res) => {
    const input = parseBody(res, createAgendaEventSchema, req.body);
    if (!input) return;

    return res.status(201).json(await createEvent(input));
  },
});
