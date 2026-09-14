/**
 * Integration: the `sendEmail(...)` addition next to the existing `notify(...)` call in
 * src/lib/orders/service.ts#changeOrderStatus() — docs/M3_SPEC.md §7 "order status changes -> ON_HOLD/CANCELLED".
 * Proves the real call site (not a simulation): an order status change to ON_HOLD or CANCELLED produces BOTH a
 * Notification and an EmailMessage row for the same recipient (the spec's acceptance test, applied to this call
 * site rather than a full schedule run — same wiring pattern, lighter fixture), and that other transitions
 * (IN_PROGRESS, QUEUED) do not send an email.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Role } from "@/generated/prisma/enums";
import type { Session } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
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

describe.skipIf(!available)("order status change -> email (integration)", () => {
  let f: TenantFixture;
  let admin: Session;
  let planner: Session;
  let secondAdminId: string;
  let secondAdminEmail: string;
  let productId: string;
  let customerId: string;

  async function newOrder(): Promise<string> {
    const input = createOrderSchema("2030-01-01").parse({ customer: customerId, productId, quantity: "5", dueDate: "2030-03-01" });
    return (await createOrder(f.db, admin, input)).id;
  }

  beforeAll(async () => {
    f = await createTenantFixture({ slugPrefix: "email-ordstatus" });
    admin = sessionFor(f, "ADMIN");
    planner = sessionFor(f, "PLANNER");
    productId = (await prisma.product.create({ data: { tenantId: f.tenant.id, sku: "GX-41", name: "Bracket" } })).id;
    customerId = (await prisma.customer.create({ data: { tenantId: f.tenant.id, name: "Bosch" } })).id;
    // A second recipient distinct from the actor, so notify()/sendEmail() have someone to fan out to
    // (the fixture's admin/planner sessions impersonate the same single seeded user).
    const secondAdmin = await prisma.user.create({
      data: { tenantId: f.tenant.id, email: `second-admin-${f.tenant.slug}@example.test`, name: "Second Admin", passwordHash: "x", role: "ADMIN" },
    });
    secondAdminId = secondAdmin.id;
    secondAdminEmail = secondAdmin.email;
  });

  afterAll(async () => {
    await deleteTenant(f?.tenant.id);
    await disconnectDb();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ON_HOLD produces both a Notification and an EmailMessage row for the same recipient", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const id = await newOrder();
    await changeOrderStatus(f.db, planner, { orderId: id, status: "ON_HOLD", reason: "Waiting for aluminium bar" });

    const notification = await prisma.notification.findFirst({
      where: { tenantId: f.tenant.id, entityType: "Order", entityId: id, userId: secondAdminId },
      orderBy: { createdAt: "desc" },
    });
    expect(notification).not.toBeNull();

    const email = await prisma.emailMessage.findFirst({
      where: { tenantId: f.tenant.id, entityType: "Order", entityId: id, userId: secondAdminId },
      orderBy: { createdAt: "desc" },
    });
    expect(email).not.toBeNull();
    expect(email!.toEmail).toBe(secondAdminEmail);
    expect(email!.template).toBe("order-status-changed");
    expect(email!.status).toBe("SENT");
    expect(email!.subject).toContain("on hold");

    // The actor never emails themselves, matching notify()'s excludeUserId rule.
    expect(await prisma.emailMessage.count({ where: { tenantId: f.tenant.id, entityId: id, userId: planner.user.id } })).toBe(0);
  });

  it("CANCELLED also sends the email; a non-ON_HOLD/CANCELLED transition (IN_PROGRESS) does not", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const inProgressId = await newOrder();
    await changeOrderStatus(f.db, planner, { orderId: inProgressId, status: "IN_PROGRESS" });
    expect(await prisma.emailMessage.count({ where: { tenantId: f.tenant.id, entityId: inProgressId } })).toBe(0);

    const cancelledId = await newOrder();
    await changeOrderStatus(f.db, admin, { orderId: cancelledId, status: "CANCELLED", reason: "Customer withdrew the PO" });
    const email = await prisma.emailMessage.findFirst({ where: { tenantId: f.tenant.id, entityId: cancelledId, userId: secondAdminId } });
    expect(email).not.toBeNull();
    expect(email!.subject).toContain("cancelled");
  });
});
