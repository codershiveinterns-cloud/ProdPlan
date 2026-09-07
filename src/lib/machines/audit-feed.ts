/**
 * Loads audit rows for a detail page and shapes them for `<AuditList>` (formatted in the tenant timezone, in a
 * Server Component). Rows for `User` / `Tenant` are hidden unless the viewer has `audit:read-all` (spec §4).
 */
import type { Prisma } from "@/generated/prisma/client";
import type { AuditListEntry } from "@/components/data/AuditList";
import { describeAudit } from "@/lib/audit";
import type { Session } from "@/lib/auth/guards";
import type { TenantDb } from "@/lib/db";
import { formatDateTime, formatRelative } from "@/lib/format";
import { can } from "@/lib/rbac";

export const AUDIT_FEED_LIMIT = 20;

export async function loadAuditEntries(
  db: TenantDb,
  session: Session,
  where: Prisma.AuditLogWhereInput,
  limit = AUDIT_FEED_LIMIT,
  now: Date = new Date(),
): Promise<AuditListEntry[]> {
  const rows = await db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: limit });
  const showAdminRows = can(session.user.role, "audit:read-all");
  const tz = session.tenant.timezone;
  return rows
    .filter((r) => showAdminRows || (r.entityType !== "User" && r.entityType !== "Tenant"))
    .map((r) => {
      const described = describeAudit(r);
      return {
        id: r.id,
        summary: r.summary || described.text,
        actorName: r.actorName ?? r.actorEmail ?? null,
        createdAtIso: r.createdAt.toISOString(),
        relative: formatRelative(r.createdAt, now, tz),
        absolute: formatDateTime(r.createdAt, tz),
        href: described.href,
      };
    });
}
