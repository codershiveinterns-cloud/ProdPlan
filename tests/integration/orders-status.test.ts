/**
 * Integration: status transitions (docs/M1_SPEC.md §4 "Orders") — legal / illegal, role-gated (cancel, reopen),
 * ON_HOLD reason rule, completedAt set on COMPLETED and cleared on reopen, STATUS_CHANGE audit rows with reason.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Role } from "@/generated/prisma/enums";
import type { Session } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { DomainError, ForbiddenError } from "@/lib/errors";
import { changeOrderStatus, createOrder } from "@/lib/orders/service";
import { createOrderSchema } from "@/lib/validation/orders";
import { createTenantFixture, dbAvailable, deleteTenant, disconnectDb, type TenantFixture } from "./helpers";

const available = await dbAvailable();

function sessionFor(f: TenantFixture, role: Role): Session {
  return {
    user: {
      id: f.admin.id,
      tenantId: f.tenant.id,
      email: f.admin.email,
      name: f.admin.name,
      role,
      isActive: true,
      mustChangePassword: false,
      lastLoginAt: null,
      createdAt: f.admin.createdAt,
      updatedAt: f.admin.updatedAt,
    },
    tenant: { id: f.tenant.id, name: f.tenant.name, slug: f.tenant.slug, timezone: f.tenant.timezone, defaultCalendarId: f.tenant.defaultCalendarId },
  };
}

describe.skipIf(!available)("order status transitions (integration)", () => {
  let f: TenantFixture;
  let admin: Session;
  let planner: Session;
  let supervisor: Session;
  let viewer: Session;
  let productId: string;
  let customerId: string;

  async function newOrder(): Promise<string> {
    const input = createOrderSchema("2030-01-01").parse({ customer: customerId, productId, quantity: "5", dueDate: "2030-03-01" });
    return (await createOrder(f.db, admin, input)).id;
  }

  beforeAll(async () => {
    f = await createTenantFixture({ slugPrefix: "ord-status" });
    admin = sessionFor(f, "ADMIN");
    planner = sessionFor(f, "PLANNER");
    supervisor = sessionFor(f, "SUPERVISOR");
    viewer = sessionFor(f, "VIEWER");
    productId = (await prisma.product.create({ data: { tenantId: f.tenant.id, sku: "GX-40", name: "Housing" } })).id;
    customerId = (await prisma.customer.create({ data: { tenantId: f.tenant.id, name: "Tata Autocomp" } })).id;
  });

  afterAll(async () => {
    await deleteTenant(f?.tenant.id);
    await disconnectDb();
  });

  it("SUPERVISOR may start an order; the STATUS_CHANGE audit row is written in the same transaction", async () => {
    const id = await newOrder();
    const updated = await changeOrderStatus(f.db, supervisor, { orderId: id, status: "IN_PROGRESS" });
    expect(updated.status).toBe("IN_PROGRESS");
    expect(updated.completedAt).toBeNull();
    const row = await prisma.auditLog.findFirstOrThrow({ where: { entityId: id, action: "STATUS_CHANGE" } });
    expect(row.summary).toBe(`Order ${updated.orderNumber} status QUEUED → IN_PROGRESS`);
    expect(row.changedFields).toEqual(["status"]);
    expect(row.before).toMatchObject({ status: "QUEUED" });
    expect(row.after).toMatchObject({ status: "IN_PROGRESS", reason: null });
  });

  it("illegal transitions are rejected with a DomainError and leave the row untouched", async () => {
    const id = await newOrder();
    await expect(changeOrderStatus(f.db, admin, { orderId: id, status: "COMPLETED" })).rejects.toBeInstanceOf(DomainError);
    await expect(changeOrderStatus(f.db, admin, { orderId: id, status: "QUEUED" })).rejects.toBeInstanceOf(DomainError);
    expect((await prisma.order.findUniqueOrThrow({ where: { id } })).status).toBe("QUEUED");
    expect(await prisma.auditLog.count({ where: { entityId: id, action: "STATUS_CHANGE" } })).toBe(0);
  });

  it("CANCELLED needs orders:cancel: SUPERVISOR and VIEWER are forbidden, PLANNER may cancel with an optional reason", async () => {
    const id = await newOrder();
    await expect(changeOrderStatus(f.db, supervisor, { orderId: id, status: "CANCELLED" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(changeOrderStatus(f.db, viewer, { orderId: id, status: "IN_PROGRESS" })).rejects.toBeInstanceOf(ForbiddenError);
    const cancelled = await changeOrderStatus(f.db, planner, { orderId: id, status: "CANCELLED", reason: "Customer withdrew the PO" });
    expect(cancelled.status).toBe("CANCELLED");
    const row = await prisma.auditLog.findFirstOrThrow({ where: { entityId: id, action: "STATUS_CHANGE" } });
    expect(row.summary).toBe(`Order ${cancelled.orderNumber} status QUEUED → CANCELLED — Customer withdrew the PO`);
    expect(row.after).toMatchObject({ status: "CANCELLED", reason: "Customer withdrew the PO" });
  });

  it("ON_HOLD requires a reason", async () => {
    const id = await newOrder();
    await expect(changeOrderStatus(f.db, planner, { orderId: id, status: "ON_HOLD" })).rejects.toBeInstanceOf(DomainError);
    await expect(changeOrderStatus(f.db, planner, { orderId: id, status: "ON_HOLD", reason: "   " })).rejects.toBeInstanceOf(DomainError);
    const held = await changeOrderStatus(f.db, planner, { orderId: id, status: "ON_HOLD", reason: "Waiting for aluminium bar" });
    expect(held.status).toBe("ON_HOLD");
    const resumed = await changeOrderStatus(f.db, supervisor, { orderId: id, status: "QUEUED" });
    expect(resumed.status).toBe("QUEUED");
  });

  it("COMPLETED sets completedAt; only ADMIN can reopen, which clears it", async () => {
    const id = await newOrder();
    await changeOrderStatus(f.db, supervisor, { orderId: id, status: "IN_PROGRESS" });
    const before = Date.now();
    const done = await changeOrderStatus(f.db, supervisor, { orderId: id, status: "COMPLETED" });
    expect(done.status).toBe("COMPLETED");
    expect(done.completedAt).toBeInstanceOf(Date);
    expect(done.completedAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);

    // Terminal: nobody but ADMIN can move it, and only to IN_PROGRESS.
    await expect(changeOrderStatus(f.db, planner, { orderId: id, status: "IN_PROGRESS" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(changeOrderStatus(f.db, admin, { orderId: id, status: "QUEUED" })).rejects.toBeInstanceOf(DomainError);
    const reopened = await changeOrderStatus(f.db, admin, { orderId: id, status: "IN_PROGRESS" });
    expect(reopened.status).toBe("IN_PROGRESS");
    expect(reopened.completedAt).toBeNull();

    const rows = await prisma.auditLog.findMany({ where: { entityId: id, action: "STATUS_CHANGE" }, orderBy: { createdAt: "asc" } });
    expect(rows.map((r) => r.summary.split(" status ")[1])).toEqual(["QUEUED → IN_PROGRESS", "IN_PROGRESS → COMPLETED", "COMPLETED → IN_PROGRESS"]);
    expect(rows[1]!.changedFields.sort()).toEqual(["completedAt", "status"]);
  });

  it("cancelled orders can only be reopened to QUEUED by ADMIN", async () => {
    const id = await newOrder();
    await changeOrderStatus(f.db, admin, { orderId: id, status: "CANCELLED" });
    await expect(changeOrderStatus(f.db, admin, { orderId: id, status: "IN_PROGRESS" })).rejects.toBeInstanceOf(DomainError);
    expect((await changeOrderStatus(f.db, admin, { orderId: id, status: "QUEUED" })).status).toBe("QUEUED");
  });

  it("orders of another tenant are not found", async () => {
    const other = await createTenantFixture({ slugPrefix: "ord-status-b" });
    try {
      const id = await newOrder();
      await expect(changeOrderStatus(other.db, sessionFor(other, "ADMIN"), { orderId: id, status: "IN_PROGRESS" })).rejects.toMatchObject({ code: "not_found" });
    } finally {
      await deleteTenant(other.tenant.id);
    }
  });

  // docs/M2_SPEC.md §4/§5: the order-level ON_HOLD/release dialog must pause/resume every ScheduleEntry step and
  // notify the office (+ floor). Regression for a blocker found in review: neither used to happen.
  it("ON_HOLD via the order dialog pauses schedule entries and notifies other users; release restores them", async () => {
    const id = await newOrder();
    const workCenter = await prisma.workCenter.create({ data: { tenantId: f.tenant.id, code: "CNC", name: "CNC" } });
    const machine = await prisma.machine.create({
      data: { tenantId: f.tenant.id, workCenterId: workCenter.id, calendarId: f.calendar.id, code: "CNC-01", name: "CNC 01" },
    });
    const entry = await prisma.scheduleEntry.create({
      data: {
        tenantId: f.tenant.id,
        orderId: id,
        sequence: 10,
        workCenterId: workCenter.id,
        machineId: machine.id,
        plannedStartAt: new Date(),
        plannedEndAt: new Date(Date.now() + 3600_000),
        plannedMinutes: 60,
        status: "IN_PROGRESS",
      },
    });

    // A second real user so the "exclude the actor" notify() rule has someone else to notify (the fixture's
    // admin/planner/supervisor/viewer sessions all impersonate the same single seeded user).
    const secondAdmin = await prisma.user.create({
      data: { tenantId: f.tenant.id, email: `second-admin-${f.tenant.slug}@example.test`, name: "Second Admin", passwordHash: "x", role: "ADMIN" },
    });

    await changeOrderStatus(f.db, planner, { orderId: id, status: "ON_HOLD", reason: "Waiting for aluminium bar" });
    const held = await prisma.scheduleEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(held.status).toBe("ON_HOLD");
    expect(held.holdReason).toContain("IN_PROGRESS");

    const notification = await prisma.notification.findFirst({
      where: { tenantId: f.tenant.id, entityType: "Order", entityId: id, type: "ORDER_STATUS", userId: secondAdmin.id },
      orderBy: { createdAt: "desc" },
    });
    expect(notification).not.toBeNull();
    expect(notification!.title).toContain("on hold");
    // The actor (planner, sharing the fixture's single real user id) never notifies themselves.
    expect(notification!.userId).not.toBe(planner.user.id);

    await changeOrderStatus(f.db, supervisor, { orderId: id, status: "QUEUED" });
    const released = await prisma.scheduleEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(released.status).toBe("IN_PROGRESS");
    expect(released.holdReason).toBeNull();
  });
});
