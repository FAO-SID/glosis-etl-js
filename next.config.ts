import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Use webpack instead of Turbopack (FAT32 incompatible with Turbopack cache)
  output: "standalone",
};

export default nextConfig;
