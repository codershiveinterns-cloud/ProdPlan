// OpenNext configuration for the Cloudflare adapter (docs/CLOUDFLARE.md).
// Default overrides: no incremental cache / tag cache / revalidation queue. Every ProdPlan page is dynamic
// (session-gated), so ISR storage is not needed; add an R2 incremental cache here if that changes
// (https://opennext.js.org/cloudflare/caching).
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default {
  ...defineCloudflareConfig(),
  // `npm run build` is `prisma generate && next build`, which would overwrite the workerd flavour of the Prisma
  // client that scripts/cf-build.mjs generates right before this build. Run Next directly instead.
  buildCommand: "npx next build",
};
