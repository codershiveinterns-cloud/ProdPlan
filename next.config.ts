import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // CSV import uploads (≤ 1 MB files) are posted through a Server Action.
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
