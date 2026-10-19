import { NextApiRequest, NextApiResponse } from "next";

import { setPublicAgendaCacheHeaders } from "@/lib/cache";
import { listUpcomingEvents } from "@/services/agenda";
import { Agenda } from "@/types";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Agenda | { error: string }>,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res
      .status(405)
      .json({ error: `Método ${req.method} não permitido` });
  }

  try {
    const events = await listUpcomingEvents();

    // Served from Vercel's CDN, which also hides Neon's cold start. Tagged so
    // any agenda mutation can purge it on demand — see src/lib/cache.
    setPublicAgendaCacheHeaders(res);

    // Keep the { events } envelope: the service worker serves cached copies of
    // this response offline, so its shape may only ever grow.
    return res.status(200).json({ events });
  } catch (error) {
    console.error("Failed to list the agenda", error);
    return res.status(500).json({ error: "Erro ao carregar a agenda" });
  }
}
