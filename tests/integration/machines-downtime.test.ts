/**
 * Integration: downtime windows (docs/M1_SPEC.md §4 "Machines & capacity", §6.2) — the non-blocking overlap warning
 * ("Overlaps with Maintenance 10 Sep 08:00–12:00") followed by a confirmed save, capacity impact and audit history.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/guards";
import { zonedToUtc } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { CONFIRM_OVERLAP_FIELD, mapModuleError } from "@/lib/machines/action-helpers";
import { buildCapacityTable } from "@/lib/machines/capacity";
import {
  createDowntime,
  deleteDowntime,
  formatWindowRange,
  listDowntime,
  machineAuditWhere,
  updateDowntime,
} from "@/lib/machines/downtime";
import { DowntimeOverlapError } from "@/lib/machines/errors";
import { getMachineDetail } from "@/lib/machines/machines";
import { createTenantFixture, dbAvailable, deleteTenant, disconnectDb, type TenantFixture } from "./helpers";

const available = await dbAvailable();
const TZ = "Asia/Kolkata";

function sessionFor(f: TenantFixture): Session {
  const { passwordHash: _hash, tokenVersion: _tv, ...user } = f.admin;
  void _hash;
  void _tv;
  return {
    user,
    tenant: { id: f.tenant.id, name: f.tenant.name, slug: f.tenant.slug, timezone: f.tenant.timezone, defaultCalendarId: f.tenant.defaultCalendarId },
  };
}

const at = (date: string, time: string) => zonedToUtc(date, time, TZ);

describe.skipIf(!available)("downtime windows (integration)", () => {
  let F: TenantFixture;
  let session: Session;
  let machineId: string;

  beforeAll(async () => {
    F = await createTenantFixture({ slugPrefix: "down", timezone: TZ });
    session = sessionFor(F);
    const wc = await prisma.workCenter.create({ data: { tenantId: F.tenant.id, code: "CNC", name: "CNC" } });
    const m = await prisma.machine.create({
      data: { tenantId: F.tenant.id, workCenterId: wc.id, calendarId: F.calendar.id, code: "CNC-01", name: "Mill", efficiencyPercent: 90 },
    });
    machineId = m.id;
  });

  afterAll(async () => {
    await deleteTenant(F?.tenant.id);
    await disconnectDb();
  });

  it("formats window ranges in the tenant timezone", () => {
    expect(formatWindowRange(at("2026-09-10", "08:00"), at("2026-09-10", "12:00"), TZ)).toBe("10 Sep 08:00–12:00");
    expect(formatWindowRange(at("2026-09-10", "22:00"), at("2026-09-11", "06:00"), TZ)).toBe("10 Sep 22:00 – 11 Sep 06:00");
  });

  it("warns on overlap first, then saves with confirmOverlap", async () => {
    const first = await createDowntime(F.db, session, machineId, {
      startsAt: at("2026-09-10", "08:00"),
      endsAt: at("2026-09-10", "12:00"),
      type: "MAINTENANCE",
      reason: "Spindle service",
    });
    expect(first).toMatchObject({ tenantId: F.tenant.id, machineId, type: "MAINTENANCE", createdById: F.admin.id });

    const overlapping = { startsAt: at("2026-09-10", "11:00"), endsAt: at("2026-09-10", "13:00"), type: "BREAKDOWN" as const, reason: undefined };
    const err = await createDowntime(F.db, session, machineId, overlapping).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DowntimeOverlapError);
    expect((err as DowntimeOverlapError).message).toBe("Overlaps with Maintenance 10 Sep 08:00–12:00");
    expect((err as DowntimeOverlapError).overlaps).toEqual(["Maintenance 10 Sep 08:00–12:00"]);
    // …which the action layer turns into the non-blocking `{ ok:false, error:'Overlaps with …' }` result.
    expect(mapModuleError(err)).toEqual({
      ok: false,
      error: "Overlaps with Maintenance 10 Sep 08:00–12:00",
      fieldErrors: { [CONFIRM_OVERLAP_FIELD]: ["Maintenance 10 Sep 08:00–12:00"] },
    });
    expect(await prisma.downtimeWindow.count({ where: { machineId } })).toBe(1);

    // "Save anyway" resubmits with confirmOverlap=1.
    const second = await createDowntime(F.db, session, machineId, { ...overlapping, confirmOverlap: true });
    expect(second.type).toBe("BREAKDOWN");
    expect(await prisma.downtimeWindow.count({ where: { machineId } })).toBe(2);

    // Adjacent windows (end == start) do not overlap.
    const adjacent = await createDowntime(F.db, session, machineId, { startsAt: at("2026-09-10", "13:00"), endsAt: at("2026-09-10", "14:00"), type: "OTHER", reason: undefined });
    expect(adjacent.id).toBeTruthy();
  });

  it("update excludes the window itself from the overlap check", async () => {
    const w = await prisma.downtimeWindow.findFirstOrThrow({ where: { machineId, type: "MAINTENANCE" } });
    const moved = await updateDowntime(F.db, session, w.id, { startsAt: at("2026-09-10", "07:00"), endsAt: at("2026-09-10", "10:30"), type: "MAINTENANCE", reason: "Earlier" });
    expect(moved.reason).toBe("Earlier");
    // Still overlaps the breakdown window (11:00–13:00)? No — 07:00–10:30 is clear; but 07:00–11:30 is not.
    await expect(
      updateDowntime(F.db, session, w.id, { startsAt: at("2026-09-10", "07:00"), endsAt: at("2026-09-10", "11:30"), type: "MAINTENANCE", reason: undefined }),
    ).rejects.toBeInstanceOf(DowntimeOverlapError);
  });

  it("lists upcoming/active vs past windows and reduces capacity for the day", async () => {
    const now = at("2026-09-10", "11:30");
    const { upcoming, past, all } = await listDowntime(F.db, machineId, TZ, now);
    expect(all).toHaveLength(3);
    expect(past.map((r) => r.rangeLabel)).toEqual(["10 Sep 07:00–10:30"]);
    expect(upcoming.map((r) => r.rangeLabel)).toEqual(["10 Sep 11:00–13:00", "10 Sep 13:00–14:00"]);
    expect(upcoming[0].isActive).toBe(true);
    expect(upcoming[1].isActive).toBe(false);

    const detail = await getMachineDetail(F.db, machineId);
    expect(detail).not.toBeNull();
    // 2026-09-10 is a Thursday; General shift 09:00–17:00, 60-min break → 420 net × 90 % = 378 effective.
    // Downtime inside the shift: 09:00–10:30 (90) + 11:00–13:00 (120) + 13:00–14:00 (60) = 270 → 108 available.
    const table = buildCapacityTable(detail!, detail!.calendar, all, "2026-09-10", TZ, 3);
    expect(table.days[0]).toMatchObject({ date: "2026-09-10", dayLabel: "Thu", isWorking: true, totalNet: 420, totalEffective: 378, totalDowntime: 270, totalAvailable: 108 });
    expect(table.days[0].shifts[0].timeLabel).toBe("09:00–17:00");
    expect(table.days[1]).toMatchObject({ date: "2026-09-11", totalDowntime: 0, totalAvailable: 378 });
    // 2026-09-12 is a Saturday (working); 2026-09-13 Sunday would be "Non-working".
    const sunday = buildCapacityTable(detail!, detail!.calendar, all, "2026-09-13", TZ, 1);
    expect(sunday.days[0]).toMatchObject({ isWorking: false, nonWorkingLabel: "Non-working" });
  });

  it("audits create/update/delete and keeps deleted windows in the machine's history", async () => {
    const w = await prisma.downtimeWindow.findFirstOrThrow({ where: { machineId, type: "OTHER" } });
    await deleteDowntime(F.db, session, w.id);
    expect(await prisma.downtimeWindow.count({ where: { id: w.id } })).toBe(0);

    const rows = await F.db.auditLog.findMany({ where: machineAuditWhere(machineId), orderBy: { createdAt: "asc" } });
    expect(rows.map((r) => r.action)).toEqual(["CREATE", "CREATE", "CREATE", "UPDATE", "DELETE"]);
    expect(rows.every((r) => r.entityType === "DowntimeWindow")).toBe(true);
    expect(rows[0].summary).toBe("Added downtime on CNC-01: Maintenance 10 Sep 08:00–12:00");
    expect(rows[0].entityLabel).toBe("CNC-01 · Maintenance 10 Sep 08:00–12:00");
    expect(rows[4].summary).toBe("Removed downtime on CNC-01: Other 10 Sep 13:00–14:00");
    expect(rows[4].actorUserId).toBe(F.admin.id);
  });
});
