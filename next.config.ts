import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produce .next/standalone/server.js with only the files required at
  // runtime, so the Docker image stays small (no full node_modules copy).
  output: "standalone",
};

export default nextConfig;
