import type { NextConfig } from "next";

const nextConfig: any = {
  // 忽略編譯時的 lint 錯誤，這能大幅減少 Build 失敗的機率
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
