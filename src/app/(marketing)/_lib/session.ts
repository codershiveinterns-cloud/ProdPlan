import { cache } from "react";
import { cookies } from "next/headers";

import { sessionCookieName, verifySessionToken } from "@/lib/auth/jwt";

/**
 * Landing-page session probe. Verifies the cookie's signature and expiry with jose only — no database — so the
 * marketing route never pulls Prisma into its bundle. A verifying token is enough to offer "Open dashboard";
 * `(app)/layout.tsx` still checks `isActive` / `tokenVersion` against the database once the user gets there.
 *
 * Wrapped in `React.cache` so the layout (header, footer) and the page (hero, final CTA) share one cookie read.
 */
export const hasVerifiedSession = cache(async (): Promise<boolean> => {
  const store = await cookies();
  const claims = await verifySessionToken(store.get(sessionCookieName())?.value);
  return claims !== null;
});
