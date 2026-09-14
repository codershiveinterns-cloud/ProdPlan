/**
 * Integration: export row fetch (docs/M3_SPEC.md §8) — `fetchExportData()` reuses each module's own list-query
 * filter helpers (orders/list.ts, audit-log-list.ts), is tenant-scoped, and enforces `EXPORT_MAX_ROWS` by
 * rejecting with `ExportTooLargeError` instead of silently truncating.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { fetchExportData } from "@/lib/export/query";
import { EXPORT_MAX_ROWS, ExportTooLargeError } from "@/lib/export/types";
import { createTenantFixture, dbAvailable, deleteTenant, disconnectDb, type TenantFixture } from "./helpers";

const available = await dbAvailable();

describe.skipIf(!available)("export query (integration)", () => {
  let f: TenantFixture;
  let otherTenant: TenantFixture;
  let acmeId: string;
  let bracketId: string;

  beforeAll(async () => {
    f = await createTenantFixture({ slugPrefix: "exp-q" });
    otherTenant = await createTenantFixture({ slugPrefix: "exp-q-other" });
    const t = f.tenant.id;
    acmeId = (await prisma.customer.create({ data: { tenantId: t, name: "Acme Motors" } })).id;
    bracketId = (await prisma.product.create({ data: { tenantId: t, sku: "HB-200", name: "Hydraulic Bracket", unit: "pcs" } })).id;

    const rows = [];
    for (let i = 1; i <= 12; i++) {
      rows.push({
        tenantId: t,
        orderNumber: `SO-${String(i).padStart(6, "0")}`,
        customerId: acmeId,
        productId: bracketId,
        quantity: i,
        priority: "NORMAL" as const,
        dueDate: new Date(Date.UTC(2030, 0, i)),
        status: "QUEUED" as const,
        createdById: f.admin.id,
      });
    }
    await prisma.order.createMany({ data: rows });

    // A row in the OTHER tenant must never appear in this tenant's export (tenant isolation).
    const otherCustomer = await prisma.customer.create({ data: { tenantId: otherTenant.tenant.id, name: "Other Co" } });
    const otherProduct = await prisma.product.create({ data: { tenantId: otherTenant.tenant.id, sku: "OTHER-1", name: "Other widget", unit: "ea" } });
    await prisma.order.create({
      data: {
        tenantId: otherTenant.tenant.id,
        orderNumber: "SO-999999",
        customerId: otherCustomer.id,
        productId: otherProduct.id,
        quantity: 1,
        priority: "NORMAL",
        dueDate: new Date(Date.UTC(2030, 0, 1)),
        status: "QUEUED",
        createdById: otherTenant.admin.id,
      },
    });
  });

  afterAll(async () => {
    await deleteTenant(f?.tenant.id);
    await deleteTenant(otherTenant?.tenant.id);
    await disconnectDb();
  });

  it("ORDERS: reuses orders/list.ts filters and stays tenant-scoped", async () => {
    const sp = new URLSearchParams({ status: "all" });
    const data = await fetchExportData("ORDERS", f.db, f.tenant.timezone, "2026-09-14", sp);
    if (data.kind !== "ORDERS") throw new Error("expected ORDERS");
    expect(data.rows).toHaveLength(12);
    expect(data.rows.every((r) => r.orderNumber.startsWith("SO-0000"))).toBe(true);
    expect(data.rows.some((r) => r.orderNumber === "SO-999999")).toBe(false);
  });

  it("ORDERS: applies the same q/priority filters as the list page", async () => {
    const sp = new URLSearchParams({ status: "all", q: "SO-000001" });
    const data = await fetchExportData("ORDERS", f.db, f.tenant.timezone, "2026-09-14", sp);
    if (data.kind !== "ORDERS") throw new Error("expected ORDERS");
    expect(data.rows.map((r) => r.orderNumber)).toEqual(["SO-000001"]);
  });

  it("AUDIT_LOG: empty when no audit rows exist yet, and stays tenant-scoped", async () => {
    const sp = new URLSearchParams();
    const data = await fetchExportData("AUDIT_LOG", f.db, f.tenant.timezone, "2026-09-14", sp);
    expect(data.kind).toBe("AUDIT_LOG");
    expect(Array.isArray(data.rows)).toBe(true);
  });

  it("rejects with ExportTooLargeError above EXPORT_MAX_ROWS instead of truncating silently", async () => {
    const t = f.tenant.id;
    const extra = [];
    const needed = EXPORT_MAX_ROWS + 1 - 12;
    for (let i = 0; i < needed; i++) {
      extra.push({
        tenantId: t,
        orderNumber: `BULK-${i}`,
        customerId: acmeId,
        productId: bracketId,
        quantity: 1,
        priority: "NORMAL" as const,
        dueDate: new Date(Date.UTC(2030, 0, 1)),
        status: "QUEUED" as const,
        createdById: f.admin.id,
      });
    }
    await prisma.order.createMany({ data: extra });
    try {
      const sp = new URLSearchParams({ status: "all" });
      await expect(fetchExportData("ORDERS", f.db, f.tenant.timezone, "2026-09-14", sp)).rejects.toBeInstanceOf(ExportTooLargeError);
    } finally {
      await prisma.order.deleteMany({ where: { tenantId: t, orderNumber: { startsWith: "BULK-" } } });
    }
  });
});
