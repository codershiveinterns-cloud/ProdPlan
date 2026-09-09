import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // Docker/VPS builds ship the standalone server; Netlify uses its own adapter; Cloudflare uses @opennextjs/cloudflare.
  output: process.env.NEXT_OUTPUT_STANDALONE ? "standalone" : undefined,
  // `pg` requires `pg-cloudflare` only under the "workerd" export condition, which Next's file tracer does not
  // follow, so its files would be missing from the Cloudflare bundle (esbuild: Could not resolve "pg-cloudflare").
  outputFileTracingIncludes: {
    "/**": ["./node_modules/pg-cloudflare/dist/**", "./node_modules/pg-cloudflare/esm/**"],
  },
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

// `next dev` only: exposes the wrangler.jsonc bindings through getCloudflareContext() (no-op in builds and on other
// hosts). Wrangler refuses to emulate the HYPERDRIVE binding unless CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE
// is set (see .env.example), so only initialise when it is; `next dev` then keeps using DATABASE_URL directly.
if (process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE) {
  initOpenNextCloudflareForDev();
}
