/**
 * GET /api/notifications/unread-count → `{ count }` for the signed-in user (polled by the Topbar bell every 60 s,
 * docs/M2_SPEC.md §5). 401 JSON when there is no usable session. Never cached.
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { tenantDb } from "@/lib/db";
import { can } from "@/lib/rbac";
import { unreadCount } from "@/lib/notifications/service";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(): Promise<NextResponse<{ count: number } | { error: string }>> {
  const result = await getSession();
  if (result === null || result.status !== "ok") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }
  if (!can(result.user.role, "notifications:read")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  }
  const count = await unreadCount(tenantDb(result.tenant.id), { user: result.user });
  return NextResponse.json({ count }, { status: 200, headers: NO_STORE });
}
