/**
 * Integration: work centers + machines (docs/M1_SPEC.md §4 "Machines & capacity", "Delete vs deactivate", §6.2).
 * Runs against TEST_DATABASE_URL; skips with a warning when the database is unreachable.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { InUseError } from "@/lib/machines/errors";
import { zonedToUtc } from "@/lib/dates";
import { createDowntime } from "@/lib/machines/downtime";
import {
  createMachine,
  deleteMachine,
  listMachines,
  parseMachineListParams,
  setMachineStatus,
  updateMachine,
} from "@/lib/machines/machines";
import {
  createWorkCenter,
  deleteWorkCenter,
  describeUsage,
  listWorkCenters,
  parseWorkCenterListParams,
  setWorkCenterActive,
  updateWorkCenter,
  workCenterOptions,
  workCenterUsage,
} from "@/lib/machines/work-centers";
import { calendarOptions, setDefaultCalendar } from "@/lib/calendars/calendars";
import { createTenantFixture, dbAvailable, deleteTenant, disconnectDb, type TenantFixture } from "./helpers";

const available = await dbAvailable();

function sessionFor(f: TenantFixture): Session {
  const { passwordHash: _hash, tokenVersion: _tv, ...user } = f.admin;
  void _hash;
  void _tv;
  return {
    user,
    tenant: {
      id: f.tenant.id,
      name: f.tenant.name,
      slug: f.tenant.slug,
      timezone: f.tenant.timezone,
      defaultCalendarId: f.tenant.defaultCalendarId,
    },
  };
}

const machineInput = (over: Partial<Parameters<typeof createMachine>[2]> & { workCenterId: string; calendarId: string }) => ({
  code: "CNC-01",
  name: "Haas VF-2",
  status: "ACTIVE" as const,
  efficiencyPercent: 100,
  ratedCapacityPerShift: undefined,
  capacityUnit: undefined,
  notes: undefined,
  ...over,
});

describe.skipIf(!available)("work centers & machines (integration)", () => {
  let F: TenantFixture;
  let session: Session;

  beforeAll(async () => {
    F = await createTenantFixture({ slugPrefix: "mach" });
    session = sessionFor(F);
  });

  afterAll(async () => {
    await deleteTenant(F?.tenant.id);
    await disconnectDb();
  });

  it("creates, lists (with usage counts), edits and audits work centers", async () => {
    const cnc = await createWorkCenter(F.db, session, { code: "CNC", name: "CNC machining", description: undefined, isActive: undefined });
    expect(cnc).toMatchObject({ tenantId: F.tenant.id, code: "CNC", isActive: true });

    const renamed = await updateWorkCenter(F.db, session, cnc.id, { code: "CNC", name: "CNC cell", description: "3-axis mills", isActive: undefined });
    expect(renamed.description).toBe("3-axis mills");

    const { rows, total } = await listWorkCenters(F.db, parseWorkCenterListParams({ q: "cnc" }));
    expect(total).toBe(1);
    expect(rows[0]).toMatchObject({ code: "CNC", machineCount: 0, operationCount: 0 });

    const auditRows = await prisma.auditLog.findMany({ where: { tenantId: F.tenant.id, entityType: "WorkCenter", entityId: cnc.id }, orderBy: { createdAt: "asc" } });
    expect(auditRows.map((r) => r.action)).toEqual(["CREATE", "UPDATE"]);
    expect(auditRows[1].changedFields).toEqual(expect.arrayContaining(["name", "description"]));
  });

  it("machine create uses the tenant default calendar and keeps it when the default changes", async () => {
    const wc = await F.db.workCenter.findFirstOrThrow({ where: { code: "CNC" } });
    // The form pre-fills calendarId with session.tenant.defaultCalendarId (spec §4 "Calendars").
    expect(session.tenant.defaultCalendarId).toBe(F.calendar.id);
    const options = await calendarOptions(F.db);
    expect(options.map((c) => c.id)).toContain(session.tenant.defaultCalendarId);

    const m = await createMachine(F.db, session, machineInput({ workCenterId: wc.id, calendarId: session.tenant.defaultCalendarId!, efficiencyPercent: 80 }));
    expect(m).toMatchObject({ tenantId: F.tenant.id, calendarId: F.calendar.id, status: "ACTIVE", efficiencyPercent: 80 });

    const { rows } = await listMachines(F.db, parseMachineListParams({}), F.tenant.timezone);
    expect(rows).toHaveLength(1);
    // General shift 09:00–17:00 with a 60-minute break = 420 net minutes × 80 % = 336.
    expect(rows[0]).toMatchObject({ code: "CNC-01", calendarName: "General shift", shiftsPerDay: 1, capacityPerDay: 336, activeDowntime: null });

    // Switching the tenant default never silently changes an existing machine.
    const other = await prisma.shiftCalendar.create({ data: { tenantId: F.tenant.id, name: "Night line" } });
    await prisma.shift.create({ data: { tenantId: F.tenant.id, calendarId: other.id, name: "Night", startTime: "22:00", endTime: "06:00", daysOfWeek: [1, 2, 3], breakMinutes: 30 } });
    await setDefaultCalendar(F.db, session, other.id);
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: F.tenant.id } })).defaultCalendarId).toBe(other.id);
    expect((await prisma.machine.findUniqueOrThrow({ where: { id: m.id } })).calendarId).toBe(F.calendar.id);
    await setDefaultCalendar(F.db, session, F.calendar.id);
  });

  it("rejects an inactive or foreign work center / calendar on create", async () => {
    const paint = await createWorkCenter(F.db, session, { code: "PAINT", name: "Paint", description: undefined, isActive: false });
    await expect(
      createMachine(F.db, session, machineInput({ code: "P-1", workCenterId: paint.id, calendarId: F.calendar.id })),
    ).rejects.toMatchObject({ field: "workCenterId" });
    await expect(
      createMachine(F.db, session, machineInput({ code: "P-1", workCenterId: "does-not-exist", calendarId: F.calendar.id })),
    ).rejects.toMatchObject({ field: "workCenterId" });
    const cnc = await F.db.workCenter.findFirstOrThrow({ where: { code: "CNC" } });
    await expect(
      createMachine(F.db, session, machineInput({ code: "P-1", workCenterId: cnc.id, calendarId: "nope" })),
    ).rejects.toMatchObject({ field: "calendarId" });
    // Inactive work centers are hidden from pickers unless they are the current value.
    expect((await workCenterOptions(F.db)).map((w) => w.code)).toEqual(["CNC"]);
    expect((await workCenterOptions(F.db, paint.id)).map((w) => w.code)).toEqual(["CNC", "PAINT"]);
  });

  it("list filters: INACTIVE hidden by default, status filter, includeInactive, active-downtime badge", async () => {
    const cnc = await F.db.workCenter.findFirstOrThrow({ where: { code: "CNC" } });
    const retired = await createMachine(F.db, session, machineInput({ code: "CNC-99", name: "Old mill", status: "INACTIVE", workCenterId: cnc.id, calendarId: F.calendar.id }));
    const maint = await createMachine(F.db, session, machineInput({ code: "CNC-02", name: "Lathe", status: "MAINTENANCE", workCenterId: cnc.id, calendarId: F.calendar.id }));
    const tz = F.tenant.timezone;

    const byDefault = await listMachines(F.db, parseMachineListParams({}), tz);
    expect(byDefault.rows.map((r) => r.code).sort()).toEqual(["CNC-01", "CNC-02"]);
    const all = await listMachines(F.db, parseMachineListParams({ includeInactive: "1" }), tz);
    expect(all.total).toBe(3);
    const onlyInactive = await listMachines(F.db, parseMachineListParams({ status: "inactive" }), tz);
    expect(onlyInactive.rows.map((r) => r.id)).toEqual([retired.id]);
    const byWc = await listMachines(F.db, parseMachineListParams({ workCenterId: "nope" }), tz);
    expect(byWc.total).toBe(0);
    const search = await listMachines(F.db, parseMachineListParams({ q: "lathe" }), tz);
    expect(search.rows.map((r) => r.id)).toEqual([maint.id]);

    // A window covering `now` yields the red "Down · Type until HH:mm" badge data.
    const now = zonedToUtc("2026-09-10", "10:00", tz);
    await createDowntime(F.db, session, maint.id, { startsAt: zonedToUtc("2026-09-10", "08:00", tz), endsAt: zonedToUtc("2026-09-10", "12:00", tz), type: "BREAKDOWN", reason: undefined });
    const withDown = await listMachines(F.db, parseMachineListParams({ status: "MAINTENANCE" }), tz, now);
    expect(withDown.rows[0].activeDowntime).toEqual({ type: "BREAKDOWN", until: "12:00" });
    const later = await listMachines(F.db, parseMachineListParams({ status: "MAINTENANCE" }), tz, zonedToUtc("2026-09-10", "12:00", tz));
    expect(later.rows[0].activeDowntime).toBeNull();
  });

  it("blocks deleting a used work center with a 'Used by …' message and offers deactivate", async () => {
    const cnc = await F.db.workCenter.findFirstOrThrow({ where: { code: "CNC" } });
    const usage = await workCenterUsage(F.db, cnc.id);
    expect(usage).toEqual({ machines: 3, operations: 0 });
    expect(describeUsage(usage)).toBe("Used by 3 machines");
    await expect(deleteWorkCenter(F.db, session, cnc.id)).rejects.toBeInstanceOf(InUseError);
    await expect(deleteWorkCenter(F.db, session, cnc.id)).rejects.toThrow(/Used by 3 machines/);
    expect(await prisma.workCenter.count({ where: { id: cnc.id } })).toBe(1);

    const deactivated = await setWorkCenterActive(F.db, session, cnc.id, false);
    expect(deactivated.isActive).toBe(false);
    await setWorkCenterActive(F.db, session, cnc.id, true);

    // An unused work center can be hard-deleted (and the deletion is audited).
    const tmp = await createWorkCenter(F.db, session, { code: "TMP", name: "Temporary", description: undefined, isActive: undefined });
    await deleteWorkCenter(F.db, session, tmp.id);
    expect(await prisma.workCenter.count({ where: { id: tmp.id } })).toBe(0);
    const deleted = await prisma.auditLog.findFirst({ where: { tenantId: F.tenant.id, entityType: "WorkCenter", entityId: tmp.id, action: "DELETE" } });
    expect(deleted?.summary).toBe("Deleted work center TMP (Temporary)");
  });

  it("blocks deleting a machine pinned by a routing step; status changes and edits are audited", async () => {
    const cnc = await F.db.workCenter.findFirstOrThrow({ where: { code: "CNC" } });
    const m = await F.db.machine.findFirstOrThrow({ where: { code: "CNC-01" } });
    const product = await prisma.product.create({ data: { tenantId: F.tenant.id, sku: "HB-200", name: "Bracket" } });
    await prisma.productOperation.create({
      data: { tenantId: F.tenant.id, productId: product.id, sequence: 10, workCenterId: cnc.id, machineId: m.id, runMinutesPerUnit: 1.5 },
    });
    await expect(deleteMachine(F.db, session, m.id)).rejects.toBeInstanceOf(InUseError);
    await expect(deleteMachine(F.db, session, m.id)).rejects.toThrow(/Used by 1 routing step/);

    const inactive = await setMachineStatus(F.db, session, m.id, "INACTIVE");
    expect(inactive.status).toBe("INACTIVE");
    const edited = await updateMachine(F.db, session, m.id, machineInput({ workCenterId: cnc.id, calendarId: F.calendar.id, status: "ACTIVE", ratedCapacityPerShift: 120, capacityUnit: "pcs", notes: "Spindle replaced" }));
    expect(edited).toMatchObject({ status: "ACTIVE", capacityUnit: "pcs", notes: "Spindle replaced" });
    expect(Number(edited.ratedCapacityPerShift)).toBe(120);

    const rows = await prisma.auditLog.findMany({ where: { tenantId: F.tenant.id, entityType: "Machine", entityId: m.id }, orderBy: { createdAt: "asc" } });
    expect(rows.map((r) => r.action)).toEqual(["CREATE", "UPDATE", "UPDATE"]);
    expect(rows[1].summary).toBe("Machine CNC-01 status ACTIVE → INACTIVE");
    expect(rows[2].changedFields).toEqual(expect.arrayContaining(["status", "ratedCapacityPerShift", "capacityUnit", "notes"]));

    // An unpinned machine deletes (downtime cascades) and is audited.
    const lathe = await F.db.machine.findFirstOrThrow({ where: { code: "CNC-02" } });
    await deleteMachine(F.db, session, lathe.id);
    expect(await prisma.machine.count({ where: { id: lathe.id } })).toBe(0);
    expect(await prisma.downtimeWindow.count({ where: { machineId: lathe.id } })).toBe(0);
  });

  it("is tenant-scoped: another tenant cannot see or delete these rows", async () => {
    const other = await createTenantFixture({ slugPrefix: "mach-other" });
    try {
      const cnc = await F.db.workCenter.findFirstOrThrow({ where: { code: "CNC" } });
      expect((await listWorkCenters(other.db, parseWorkCenterListParams({}))).total).toBe(0);
      expect((await listMachines(other.db, parseMachineListParams({ includeInactive: "1" }), other.tenant.timezone)).total).toBe(0);
      await expect(deleteWorkCenter(other.db, sessionFor(other), cnc.id)).rejects.toMatchObject({ code: "not_found" });
    } finally {
      await deleteTenant(other.tenant.id);
    }
  });
});
