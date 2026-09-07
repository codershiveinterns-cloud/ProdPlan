/**
 * Tenant settings (docs/M1_SPEC.md §6.8, `tenant:manage`): plant name, timezone and the default shift calendar.
 * The default calendar must belong to this tenant (plain FK, checked here per §2) and be active — unless it is the
 * calendar that is already the default, so saving other fields never fails because of an old inactive default.
 */
import { audit, type AuditCtx } from "@/lib/audit";
import { tenantSelect, type SessionTenant } from "@/lib/auth/session";
import type { TenantDb } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import type { Actor } from "@/lib/users/manage";
import type { TenantSettingsInput } from "@/lib/validation/tenant";

export const CALENDAR_NOT_FOUND_MESSAGE = "Select an active shift calendar of this plant";

export class CalendarNotFoundError extends DomainError {
  constructor() {
    super(CALENDAR_NOT_FOUND_MESSAGE, "calendar_not_found", 422);
  }
}

export type CalendarOption = { id: string; name: string; isActive: boolean; isDefault: boolean };

/** Active calendars (plus the current default even when inactive), sorted by name, for the Select. */
export async function listCalendarOptions(db: TenantDb, defaultCalendarId: string | null): Promise<CalendarOption[]> {
  const rows = await db.shiftCalendar.findMany({
    where: defaultCalendarId ? { OR: [{ isActive: true }, { id: defaultCalendarId }] } : { isActive: true },
    select: { id: true, name: true, isActive: true },
    orderBy: { name: "asc" },
  });
  return rows.map((c) => ({ ...c, isDefault: c.id === defaultCalendarId }));
}

function tenantSnapshot(t: SessionTenant) {
  return { name: t.name, timezone: t.timezone, defaultCalendarId: t.defaultCalendarId };
}

export async function updateTenantSettings(
  db: TenantDb,
  actor: Actor,
  ctx: AuditCtx,
  input: TenantSettingsInput,
): Promise<SessionTenant> {
  return db.$transaction(async (tx) => {
    const before = await tx.tenant.findUniqueOrThrow({ where: { id: actor.tenantId }, select: tenantSelect });

    let defaultCalendarId = before.defaultCalendarId;
    if (input.defaultCalendarId !== undefined) {
      const calendar = await tx.shiftCalendar.findFirst({
        where: { id: input.defaultCalendarId },
        select: { id: true, isActive: true },
      });
      if (!calendar || (!calendar.isActive && calendar.id !== before.defaultCalendarId)) {
        throw new CalendarNotFoundError();
      }
      defaultCalendarId = calendar.id;
    }

    const changed =
      before.name !== input.name || before.timezone !== input.timezone || before.defaultCalendarId !== defaultCalendarId;
    if (!changed) return before;

    const after = await tx.tenant.update({
      where: { id: actor.tenantId },
      data: { name: input.name, timezone: input.timezone, defaultCalendarId },
      select: tenantSelect,
    });
    await audit(tx, ctx, {
      entityType: "Tenant",
      entityId: after.id,
      entityLabel: after.name,
      action: "UPDATE",
      before: tenantSnapshot(before),
      after: tenantSnapshot(after),
      summary: `Updated plant settings for ${after.name}`,
    });
    return after;
  });
}
