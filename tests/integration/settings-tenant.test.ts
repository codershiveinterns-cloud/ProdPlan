/**
 * Integration: tenant settings (docs/M1_SPEC.md §6.8, `tenant:manage`) against prodplan_test.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuditCtx } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { CalendarNotFoundError, listCalendarOptions, updateTenantSettings } from "@/lib/tenant/settings";
import type { Actor } from "@/lib/users/manage";
import { createTenantFixture, dbAvailable, deleteTenant, disconnectDb, type TenantFixture } from "./helpers";

const available = await dbAvailable();
const run = Date.now().toString(36);

describe.skipIf(!available)("tenant settings (integration)", () => {
  let T: TenantFixture;
  let other: TenantFixture;
  let actor: Actor;
  let ctx: AuditCtx;

  beforeAll(async () => {
    [T, other] = await Promise.all([
      createTenantFixture({ slugPrefix: `ts-${run}` }),
      createTenantFixture({ slugPrefix: `ts-other-${run}` }),
    ]);
    actor = { id: T.admin.id, email: T.admin.email, name: T.admin.name, tenantId: T.tenant.id, role: "ADMIN" };
    ctx = { actor, ip: "203.0.113.11", userAgent: "vitest" };
  });

  afterAll(async () => {
    await deleteTenant(T?.tenant.id);
    await deleteTenant(other?.tenant.id);
    await disconnectDb();
  });

  it("lists active calendars plus the current default and marks it", async () => {
    const second = await prisma.shiftCalendar.create({ data: { tenantId: T.tenant.id, name: "Two shifts" } });
    const retired = await prisma.shiftCalendar.create({ data: { tenantId: T.tenant.id, name: "Old", isActive: false } });
    const options = await listCalendarOptions(T.db, T.calendar.id);
    expect(options.map((o) => o.name)).toEqual(["General shift", "Two shifts"]);
    expect(options.find((o) => o.id === T.calendar.id)?.isDefault).toBe(true);
    expect(options.find((o) => o.id === second.id)?.isDefault).toBe(false);
    expect(options.some((o) => o.id === retired.id)).toBe(false);

    // An inactive calendar that IS the default stays visible so the form can still be saved.
    await prisma.tenant.update({ where: { id: T.tenant.id }, data: { defaultCalendarId: retired.id } });
    const withRetired = await listCalendarOptions(T.db, retired.id);
    expect(withRetired.find((o) => o.id === retired.id)).toMatchObject({ isActive: false, isDefault: true });
    await prisma.tenant.update({ where: { id: T.tenant.id }, data: { defaultCalendarId: T.calendar.id } });
  });

  it("updates name, timezone and default calendar in one audited transaction", async () => {
    const second = await prisma.shiftCalendar.findFirstOrThrow({ where: { tenantId: T.tenant.id, name: "Two shifts" } });
    const after = await updateTenantSettings(T.db, actor, ctx, {
      name: "Acme Precision Works",
      timezone: "Europe/Berlin",
      defaultCalendarId: second.id,
    });
    expect(after).toMatchObject({ id: T.tenant.id, name: "Acme Precision Works", timezone: "Europe/Berlin", defaultCalendarId: second.id });

    const row = await prisma.tenant.findUniqueOrThrow({ where: { id: T.tenant.id } });
    expect(row).toMatchObject({ name: "Acme Precision Works", timezone: "Europe/Berlin", defaultCalendarId: second.id });
    expect(row.slug).toBe(T.tenant.slug); // never changes

    const rows = await prisma.auditLog.findMany({ where: { tenantId: T.tenant.id, entityType: "Tenant" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "UPDATE", actorUserId: actor.id, entityId: T.tenant.id, entityLabel: "Acme Precision Works" });
    expect([...rows[0]!.changedFields].sort()).toEqual(["defaultCalendarId", "name", "timezone"]);
    expect(rows[0]!.before).toMatchObject({ timezone: "Asia/Kolkata", defaultCalendarId: T.calendar.id });

    // Saving identical values is a no-op (no second audit row).
    await updateTenantSettings(T.db, actor, ctx, { name: "Acme Precision Works", timezone: "Europe/Berlin", defaultCalendarId: second.id });
    expect(await prisma.auditLog.count({ where: { tenantId: T.tenant.id, entityType: "Tenant" } })).toBe(1);

    // Omitting the calendar keeps the current default.
    const kept = await updateTenantSettings(T.db, actor, ctx, { name: "Acme PW", timezone: "Europe/Berlin", defaultCalendarId: undefined });
    expect(kept.defaultCalendarId).toBe(second.id);
  });

  it("rejects a calendar of another tenant and an inactive calendar that is not the current default", async () => {
    await expect(
      updateTenantSettings(T.db, actor, ctx, { name: "Acme PW", timezone: "UTC", defaultCalendarId: other.calendar.id }),
    ).rejects.toBeInstanceOf(CalendarNotFoundError);
    const retired = await prisma.shiftCalendar.findFirstOrThrow({ where: { tenantId: T.tenant.id, name: "Old" } });
    await expect(
      updateTenantSettings(T.db, actor, ctx, { name: "Acme PW", timezone: "UTC", defaultCalendarId: retired.id }),
    ).rejects.toBeInstanceOf(CalendarNotFoundError);
    const row = await prisma.tenant.findUniqueOrThrow({ where: { id: T.tenant.id } });
    expect(row.timezone).toBe("Europe/Berlin"); // rolled back / untouched
    expect(await prisma.tenant.findUniqueOrThrow({ where: { id: other.tenant.id } })).toMatchObject({ defaultCalendarId: other.calendar.id });
  });
});
