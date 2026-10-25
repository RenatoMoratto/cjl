import type { NextConfig } from "next";

// The apps that fetch a shared link to preview it, by their user agents.
// Search engines are left out: they run the page's scripts.
const LINK_PREVIEW_AGENTS = [
  "facebookexternalhit", // Facebook, Instagram, Messenger, and iMessage too
  "WhatsApp", // and Signal, which sends WhatsApp's
  "TelegramBot",
  "Twitterbot",
  "Discordbot",
  "Slackbot",
  "LinkedInBot",
  "SkypeUriPreview", // Teams
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.ytimg.com",
        port: "",
        pathname: "/vi/**",
      },
    ],
    formats: ["image/webp", "image/avif"],
  },
  // Optimize bundle size
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react"],
  },
  // Enable compression
  compress: true,
  // The song page's HTML is the same for every song, so a link preview would
  // only show the site's name. The preview apps get the song's title from
  // here instead (see the route), and people still get the page.
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/kits/:voz/:musica",
          has: [
            {
              type: "header",
              key: "user-agent",
              value: `.*(${LINK_PREVIEW_AGENTS.join("|")}).*`,
            },
          ],
          destination: "/api/musicas/:musica/previa?voz=:voz",
        },
      ],
    };
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // No page is meant to be framed, and the admin's delete buttons must
          // never sit under someone else's page. X-Frame-Options for browsers
          // that predate frame-ancestors.
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      // Browsers must always check for a new service worker
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
};

export default nextConfig;
