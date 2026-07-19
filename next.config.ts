import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "200mb",
    },
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
