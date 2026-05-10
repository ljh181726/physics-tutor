import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 允許這個 IP 的連線
  experimental: {
    allowedDevOrigins: ['26.86.8.229'],
  },
};

export default nextConfig;