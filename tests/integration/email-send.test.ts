/**
 * Integration: src/lib/email/send.ts#sendEmail() against the test database — writes exactly ONE EmailMessage row
 * per call (SENT via the log-provider by default; FAILED with `error` set when the provider rejects) and never
 * throws, docs/M3_SPEC.md §7.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email/send";
import { createTenantFixture, dbAvailable, deleteTenant, disconnectDb, type TenantFixture } from "./helpers";

const available = await dbAvailable();

describe.skipIf(!available)("sendEmail (integration)", () => {
  let f: TenantFixture;

  beforeAll(async () => {
    f = await createTenantFixture({ slugPrefix: "email-send" });
  });

  afterAll(async () => {
    await deleteTenant(f?.tenant.id);
    await disconnectDb();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("writes exactly one SENT EmailMessage row via the log-provider when RESEND_API_KEY is unset", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const before = await prisma.emailMessage.count({ where: { tenantId: f.tenant.id } });

    const row = await sendEmail(f.db, {
      tenantId: f.tenant.id,
      userId: f.admin.id,
      to: f.admin.email,
      subject: "Schedule updated",
      template: "schedule-run-finished",
      data: { tenantName: f.tenant.name, orderCount: 5, conflictCount: 1, conflicts: [], scheduleUrl: "https://x.test/schedule" },
      entityType: "ScheduleRun",
      entityId: "run-1",
    });

    expect(row.status).toBe("SENT");
    expect(row.providerId).toMatch(/^log:/);
    expect(row.error).toBeNull();
    const after = await prisma.emailMessage.count({ where: { tenantId: f.tenant.id } });
    expect(after).toBe(before + 1);

    const persisted = await prisma.emailMessage.findUniqueOrThrow({ where: { id: row.id } });
    expect(persisted).toMatchObject({
      tenantId: f.tenant.id,
      userId: f.admin.id,
      toEmail: f.admin.email,
      subject: "Schedule updated",
      template: "schedule-run-finished",
      status: "SENT",
      entityType: "ScheduleRun",
      entityId: "run-1",
    });
  });

  it("never throws and records FAILED + error when the provider rejects", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ message: "invalid API key" }), { status: 401 })),
    );
    const before = await prisma.emailMessage.count({ where: { tenantId: f.tenant.id } });

    const row = await sendEmail(f.db, {
      tenantId: f.tenant.id,
      userId: f.admin.id,
      to: f.admin.email,
      subject: "Order SO-1 is now on hold",
      template: "order-status-changed",
      data: { tenantName: f.tenant.name, orderNumber: "SO-1", status: "ON_HOLD", orderUrl: "https://x.test/orders/o1" },
      entityType: "Order",
      entityId: "o1",
    });

    expect(row.status).toBe("FAILED");
    expect(row.providerId).toBeNull();
    expect(row.error).toContain("Resend API error");
    const after = await prisma.emailMessage.count({ where: { tenantId: f.tenant.id } });
    expect(after).toBe(before + 1);
  });

  it("is tenant-scoped: EmailMessage rows are written through the scoped client's tenantId, not a caller-supplied one", async () => {
    const other = await createTenantFixture({ slugPrefix: "email-send-b" });
    try {
      const row = await sendEmail(f.db, {
        // Deliberately wrong tenantId in the input — the scoped client's own scope must win (same contract as audit()).
        tenantId: other.tenant.id,
        to: f.admin.email,
        subject: "Test",
        template: "order-status-changed",
        data: { tenantName: f.tenant.name, orderNumber: "SO-2", status: "CANCELLED", orderUrl: "https://x.test/orders/o2" },
      });
      const persisted = await prisma.emailMessage.findUniqueOrThrow({ where: { id: row.id } });
      expect(persisted.tenantId).toBe(f.tenant.id);
    } finally {
      await deleteTenant(other.tenant.id);
    }
  });
});
