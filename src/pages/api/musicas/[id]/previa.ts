import { NextApiRequest, NextApiResponse } from "next";

import { SITE_URL, SOCIAL_IMAGE } from "@/lib/site";
import { getSongById } from "@/services/songs";
import { isVoice } from "@/types";

// The title is typed in the admin panel
const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/**
 * The song page as link previews see it. The apps that preview a shared link
 * (WhatsApp, iMessage, Telegram...) read its HTML without running its scripts,
 * and that HTML is the same for every song: the page is prerendered once, so
 * the offline copy can open them all. next.config.ts sends those apps here
 * instead, by their user agent, for a preview with the song's own title.
 *
 * Kept off the CDN cache: it answers at the song page's own URL, and must
 * never be served in its place to a person.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<string>,
) {
  // Some preview apps check the link with a HEAD first
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).send(`Método ${req.method} não permitido`);
  }

  res.setHeader("Cache-Control", "no-store");

  const id = Number(
    Array.isArray(req.query.id) ? req.query.id[0] : req.query.id,
  );
  const voice = Array.isArray(req.query.voz) ? req.query.voz[0] : req.query.voz;

  if (!Number.isInteger(id) || id <= 0 || !voice || !isVoice(voice)) {
    return res.status(404).send("Música não encontrada");
  }

  try {
    const song = await getSongById(id);

    if (!song) {
      return res.status(404).send("Música não encontrada");
    }

    const formattedVoice = voice.charAt(0).toUpperCase() + voice.slice(1);
    // Named like the MP3 download, and like the share sheet's title
    const title = escapeHtml(`${song.title} - ${formattedVoice}`);
    const description = "Kit de voz do Coral Jovem de Londrina";
    const url = `${SITE_URL}/kits/${voice}/${song.id}`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${title} | CJL</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Coral Jovem de Londrina">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SOCIAL_IMAGE.url}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="${SOCIAL_IMAGE.width}">
<meta property="og:image:height" content="${SOCIAL_IMAGE.height}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${SOCIAL_IMAGE.url}">
</head>
<body>
<h1>${title}</h1>
<p>${description}</p>
</body>
</html>
`);
  } catch (error) {
    console.error(`Failed to load the preview of song ${id}`, error);
    return res.status(500).send("Erro ao carregar a música");
  }
}
