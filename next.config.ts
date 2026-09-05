import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker/VPS builds ship the standalone server; Netlify uses its own adapter.
  output: process.env.NEXT_OUTPUT_STANDALONE ? "standalone" : undefined,
  experimental: {
    serverActions: {
      // CSV import uploads (≤ 1 MB files) are posted through a Server Action.
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
