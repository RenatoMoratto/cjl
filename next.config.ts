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
  // Browsers must always check for a new service worker
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
};

export default nextConfig;
