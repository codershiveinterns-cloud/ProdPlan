/**
 * Integration: src/lib/notifications/service.ts against the test database — role fan-out (actor and inactive users
 * excluded), explicit userIds, per-tenant isolation, markRead / markAllRead / unreadCount / delete, listing filters,
 * and the 24 h dedupe (bump instead of duplicate; read or stale rows are not reused).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Role, User } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { orderStatusChanged, scheduleRunFinished } from "@/lib/notifications/events";
import {
  deleteNotification,
  getBellData,
  listNotifications,
  markAllRead,
  markRead,
  notify,
  unreadCount,
} from "@/lib/notifications/service";
import { createTenantFixture, dbAvailable, deleteTenant, disconnectDb, type TenantFixture } from "./helpers";

const available = await dbAvailable();

async function addUser(f: TenantFixture, role: Role, isActive = true): Promise<User> {
  const suffix = `${role.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}`;
  return prisma.user.create({
    data: {
      tenantId: f.tenant.id,
      email: `${suffix}@${f.tenant.slug}.test`,
      name: `${role} ${suffix}`,
      passwordHash: "x",
      role,
      isActive,
    },
  });
}

const sessionOf = (u: Pick<User, "id">) => ({ user: { id: u.id } });

describe.skipIf(!available)("notifications service (integration)", () => {
  let a: TenantFixture;
  let b: TenantFixture;
  let planner: User;
  let plannerOff: User;
  let supervisor: User;
  let viewer: User;
  let bPlanner: User;

  beforeAll(async () => {
    a = await createTenantFixture({ slugPrefix: "notif-a" });
    b = await createTenantFixture({ slugPrefix: "notif-b" });
    planner = await addUser(a, "PLANNER");
    plannerOff = await addUser(a, "PLANNER", false);
    supervisor = await addUser(a, "SUPERVISOR");
    viewer = await addUser(a, "VIEWER");
    bPlanner = await addUser(b, "PLANNER");
  });

  afterAll(async () => {
    await deleteTenant(a?.tenant.id);
    await deleteTenant(b?.tenant.id);
    await disconnectDb();
  });

  it("fans out to the roles, excluding the actor and inactive users", async () => {
    const result = await notify(
      a.db,
      scheduleRunFinished({ tenantId: a.tenant.id, actorUserId: planner.id, runId: "r1", orderCount: 18, conflictCount: 3 }),
    );
    expect(result.created).toBe(1);
    expect(result.bumped).toBe(0);
    expect(result.recipientIds).toEqual([a.admin.id]);

    const rows = await prisma.notification.findMany({ where: { tenantId: a.tenant.id, dedupeKey: "schedule:run" } });
    expect(rows.map((r) => r.userId)).toEqual([a.admin.id]);
    expect(rows[0]).toMatchObject({
      tenantId: a.tenant.id,
      type: "SCHEDULE_RUN",
      title: "Schedule updated",
      href: "/schedule",
      readAt: null,
    });
    // The inactive planner, the supervisor and the viewer got nothing.
    expect(await prisma.notification.count({ where: { userId: { in: [plannerOff.id, supervisor.id, viewer.id] } } })).toBe(0);
    await prisma.notification.deleteMany({ where: { tenantId: a.tenant.id } });
  });

  it("SUPERVISORs are included for ON_HOLD; explicit userIds work and ignore strangers/inactive users", async () => {
    const hold = await notify(
      a.db,
      orderStatusChanged({ tenantId: a.tenant.id, actorUserId: a.admin.id, actorName: "Admin", orderId: "o1", orderNumber: "SO-1", from: "QUEUED", to: "ON_HOLD" }),
    );
    expect(new Set(hold.recipientIds)).toEqual(new Set([planner.id, supervisor.id]));

    const direct = await notify(a.db, {
      tenantId: a.tenant.id,
      recipients: { userIds: [viewer.id, plannerOff.id, bPlanner.id, "nope"] },
      type: "ORDER_STATUS",
      title: "Direct",
      body: "Only the viewer should get this",
    });
    expect(direct.recipientIds).toEqual([viewer.id]);
    expect(direct.created).toBe(1);

    const none = await notify(a.db, { tenantId: a.tenant.id, recipients: {}, type: "ORDER_STATUS", title: "x", body: "y" });
    expect(none).toEqual({ created: 0, bumped: 0, recipientIds: [] });
    await prisma.notification.deleteMany({ where: { tenantId: a.tenant.id } });
  });

  it("is isolated per tenant: tenant B users never receive or see tenant A rows", async () => {
    await notify(a.db, { tenantId: a.tenant.id, recipients: { roles: ["ADMIN", "PLANNER"] }, type: "SCHEDULE_RUN", title: "A only", body: "b" });
    // No row for B's planner even though the role matches.
    expect(await prisma.notification.count({ where: { userId: bPlanner.id } })).toBe(0);
    // B's client cannot read A's rows, even when asking for A's user id.
    expect(await unreadCount(b.db, sessionOf(a.admin))).toBe(0);
    expect((await listNotifications(b.db, sessionOf(a.admin), { page: 1 })).total).toBe(0);
    // And B's client cannot mark or delete them.
    const aRow = await prisma.notification.findFirstOrThrow({ where: { userId: a.admin.id } });
    expect(await markRead(b.db, sessionOf(a.admin), aRow.id)).toBe(false);
    expect(await deleteNotification(b.db, sessionOf(a.admin), aRow.id)).toBe(false);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: aRow.id } })).readAt).toBeNull();
    await prisma.notification.deleteMany({ where: { tenantId: a.tenant.id } });
  });

  it("markRead / markAllRead / unreadCount / delete act on the caller's own rows only", async () => {
    await notify(a.db, { tenantId: a.tenant.id, recipients: { roles: ["ADMIN", "PLANNER"] }, type: "ORDER_STATUS", title: "One", body: "1" });
    await notify(a.db, { tenantId: a.tenant.id, recipients: { roles: ["ADMIN", "PLANNER"] }, type: "DELIVERY_RISK", title: "Two", body: "2" });
    expect(await unreadCount(a.db, sessionOf(a.admin))).toBe(2);
    expect(await unreadCount(a.db, sessionOf(planner))).toBe(2);

    const plannerRow = await prisma.notification.findFirstOrThrow({ where: { userId: planner.id, title: "One" } });
    // The admin cannot mark the planner's row.
    expect(await markRead(a.db, sessionOf(a.admin), plannerRow.id)).toBe(false);
    expect(await markRead(a.db, sessionOf(planner), plannerRow.id)).toBe(true);
    // Idempotent: already read → false, and the count is stable.
    expect(await markRead(a.db, sessionOf(planner), plannerRow.id)).toBe(false);
    expect(await unreadCount(a.db, sessionOf(planner))).toBe(1);
    expect(await unreadCount(a.db, sessionOf(a.admin))).toBe(2);

    expect(await markAllRead(a.db, sessionOf(a.admin))).toBe(2);
    expect(await markAllRead(a.db, sessionOf(a.admin))).toBe(0);
    expect(await unreadCount(a.db, sessionOf(a.admin))).toBe(0);
    expect(await unreadCount(a.db, sessionOf(planner))).toBe(1);

    const listed = await listNotifications(a.db, sessionOf(planner), { page: 1 });
    expect(listed.total).toBe(2);
    expect(listed.rows.map((r) => r.title)).toEqual(["Two", "One"]); // newest first
    expect((await listNotifications(a.db, sessionOf(planner), { page: 1, unreadOnly: true })).rows.map((r) => r.title)).toEqual(["Two"]);
    expect((await listNotifications(a.db, sessionOf(planner), { page: 1, type: "ORDER_STATUS" })).rows.map((r) => r.title)).toEqual(["One"]);
    expect((await listNotifications(a.db, sessionOf(planner), { page: 2 })).rows).toEqual([]);

    const bell = await getBellData(a.db, { user: { id: planner.id }, tenant: { timezone: a.tenant.timezone } } as Parameters<typeof getBellData>[1]);
    expect(bell.count).toBe(1);
    expect(bell.items.map((i) => [i.title, i.read])).toEqual([
      ["Two", false],
      ["One", true],
    ]);
    expect(bell.items[0]?.relative).toBe("just now");

    expect(await deleteNotification(a.db, sessionOf(a.admin), plannerRow.id)).toBe(false);
    expect(await deleteNotification(a.db, sessionOf(planner), plannerRow.id)).toBe(true);
    expect(await prisma.notification.count({ where: { id: plannerRow.id } })).toBe(0);
    await prisma.notification.deleteMany({ where: { tenantId: a.tenant.id } });
  });

  it("dedupes within 24 h: an unread row with the same key is bumped, not duplicated", async () => {
    const input = { tenantId: a.tenant.id, recipients: { roles: ["ADMIN"] as Role[] }, type: "DELIVERY_RISK" as const, dedupeKey: "risk:o1:LATE", href: "/orders/o1" };
    const first = await notify(a.db, { ...input, title: "Order SO-1 is late", body: "first" });
    expect(first).toMatchObject({ created: 1, bumped: 0 });
    const row = await prisma.notification.findFirstOrThrow({ where: { userId: a.admin.id, dedupeKey: "risk:o1:LATE" } });
    // Age the row a little so the bump is observable.
    const old = new Date(Date.now() - 60_000);
    await prisma.notification.update({ where: { id: row.id }, data: { createdAt: old } });

    const second = await notify(a.db, { ...input, title: "Order SO-1 is late", body: "second" });
    expect(second).toMatchObject({ created: 0, bumped: 1 });
    const rows = await prisma.notification.findMany({ where: { userId: a.admin.id, dedupeKey: "risk:o1:LATE" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(row.id);
    expect(rows[0]?.body).toBe("second");
    expect(rows[0]?.createdAt.getTime()).toBeGreaterThan(old.getTime());
    expect(rows[0]?.readAt).toBeNull();

    // A read row is not reused: a new one is created.
    await markRead(a.db, sessionOf(a.admin), row.id);
    const third = await notify(a.db, { ...input, title: "Order SO-1 is late", body: "third" });
    expect(third).toMatchObject({ created: 1, bumped: 0 });
    expect(await prisma.notification.count({ where: { userId: a.admin.id, dedupeKey: "risk:o1:LATE" } })).toBe(2);

    // An unread row older than 24 h is not reused either.
    await prisma.notification.updateMany({
      where: { userId: a.admin.id, dedupeKey: "risk:o1:LATE", readAt: null },
      data: { createdAt: new Date(Date.now() - 25 * 3_600_000) },
    });
    const fourth = await notify(a.db, { ...input, title: "Order SO-1 is late", body: "fourth" });
    expect(fourth).toMatchObject({ created: 1, bumped: 0 });
    expect(await prisma.notification.count({ where: { userId: a.admin.id, dedupeKey: "risk:o1:LATE" } })).toBe(3);

    // Different keys never collide; rows without a key are always inserted.
    await notify(a.db, { ...input, dedupeKey: "risk:o1:DELAYED", title: "t", body: "b" });
    await notify(a.db, { ...input, dedupeKey: null, title: "t", body: "b" });
    await notify(a.db, { ...input, dedupeKey: null, title: "t", body: "b" });
    expect(await prisma.notification.count({ where: { userId: a.admin.id } })).toBe(6);
    await prisma.notification.deleteMany({ where: { tenantId: a.tenant.id } });
  });

  it("works inside a transaction with the tx client", async () => {
    await a.db.$transaction(async (tx) => {
      const r = await notify(tx, { tenantId: a.tenant.id, recipients: { roles: ["PLANNER"] }, type: "OPERATION_STATUS", title: "In tx", body: "x" });
      expect(r.recipientIds).toEqual([planner.id]);
    });
    expect(await unreadCount(a.db, sessionOf(planner))).toBe(1);
    await prisma.notification.deleteMany({ where: { tenantId: a.tenant.id } });
  });
});
