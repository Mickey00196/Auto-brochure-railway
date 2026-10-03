import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Minimal production image for Docker (see Dockerfile) — bundles only the
  // traced runtime files instead of the full node_modules tree.
  output: "standalone",
};

export default nextConfig;
