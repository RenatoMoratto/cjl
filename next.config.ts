import type { NextConfig } from "next";

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
