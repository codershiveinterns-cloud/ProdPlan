/**
 * Server helper for the Topbar bell. `getSession()` is React.cache'd per request, so calling it here costs no extra
 * database round trip beyond what `(app)/layout.tsx` already paid. Server-only.
 */
import { getSession } from "@/lib/auth/session";
import { tenantDb } from "@/lib/db";
import { can } from "@/lib/rbac";
import { getBellData } from "./service";
import type { BellData } from "./types";

/** Bell data for the signed-in user, or `null` when there is no usable session or the role may not read notifications. */
export async function loadBellForCurrentUser(): Promise<BellData | null> {
  const result = await getSession();
  if (result === null || result.status !== "ok") return null;
  if (!can(result.user.role, "notifications:read")) return null;
  const session = { user: result.user, tenant: result.tenant };
  return getBellData(tenantDb(session.tenant.id), session);
}
