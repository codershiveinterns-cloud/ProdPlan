import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker/VPS builds ship the standalone server; Netlify uses its own adapter.
  output: process.env.NEXT_OUTPUT_STANDALONE ? "standalone" : undefined,
  experimental: {
    // Enables forbidden()/unauthorized() from next/navigation (src/app/forbidden.tsx).
    authInterrupts: true,
    serverActions: {
      // CSV import uploads (≤ 1 MB files) are posted through a Server Action.
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;

import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev());
