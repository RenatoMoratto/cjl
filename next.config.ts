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
};

export default nextConfig;
