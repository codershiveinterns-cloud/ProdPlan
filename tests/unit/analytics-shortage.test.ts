/**
 * `predictShortages()` (docs/M3_SPEC.md §4): empty order book, the exact-zero boundary, correct
 * earliest-shortfall-order identification across multiple orders, no-consumption-history materials, and the
 * SHORT/WATCH/OK severity boundaries. Reads real tenant data (`requirementFor()`/BOM math is not reimplemented
 * here), so — like the integration suite — it needs the test database; skipped when unavailable.
 */
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { predictShortages } from "@/lib/analytics/shortage";
import { createTenantFixture, dbAvailable, deleteTenant, disconnectDb, type TenantFixture } from "../integration/helpers";

const available = await dbAvailable();

const ASOF = new Date("2026-09-14T04:00:00.000Z"); // ~09:30 IST

async function seedMaterial(f: TenantFixture, overrides: Partial<{ stockOnHand: number; reorderLeadTimeDays: number; code: string }> = {}) {
  return prisma.material.create({
    data: {
      tenantId: f.tenant.id,
      code: overrides.code ?? "RM-1",
      name: "Raw material 1",
      unit: "kg",
      stockOnHand: overrides.stockOnHand ?? 100,
      reorderThreshold: 10,
      reorderLeadTimeDays: overrides.reorderLeadTimeDays ?? 7,
    },
  });
}

let skuCounter = 0;

async function seedProduct(f: TenantFixture, materialId: string, quantityPerUnit: number) {
  const product = await prisma.product.create({ data: { tenantId: f.tenant.id, sku: `SKU-${++skuCounter}`, name: "Widget", unit: "pcs" } });
  await prisma.bomItem.create({ data: { tenantId: f.tenant.id, productId: product.id, materialId, quantityPerUnit, scrapPercent: 0 } });
  return product;
}

async function seedOrder(f: TenantFixture, customerId: string, productId: string, opts: { orderNumber: string; quantity: number; dueDate: string; status?: "QUEUED" | "IN_PROGRESS" | "ON_HOLD" }) {
  return prisma.order.create({
    data: {
      tenantId: f.tenant.id,
      orderNumber: opts.orderNumber,
      customerId,
      productId,
      quantity: opts.quantity,
      dueDate: new Date(`${opts.dueDate}T00:00:00.000Z`),
      status: opts.status ?? "QUEUED",
      createdById: f.admin.id,
    },
  });
}

describe.skipIf(!available)("predictShortages", () => {
  const fixtures: TenantFixture[] = [];

  afterAll(async () => {
    await Promise.all(fixtures.map((f) => deleteTenant(f.tenant.id)));
    await disconnectDb();
  });

  it("returns committedDemand 0 / projectedBalance = stockOnHand / OK / null coverage for an empty order book", async () => {
    const f = await createTenantFixture({ slugPrefix: "shortage-empty" });
    fixtures.push(f);
    const material = await seedMaterial(f, { stockOnHand: 100 });

    const rows = await predictShortages(f.db, { asOf: ASOF });
    const row = rows.find((r) => r.materialId === material.id);
    expect(row).toMatchObject({
      stockOnHand: 100,
      committedDemand: 0,
      projectedBalance: 100,
      firstShortfallOrderId: null,
      firstShortfallDate: null,
      daysOfCoverAtCurrentRate: null,
      severity: "OK",
    });
  });

  it("is not a shortfall when a single order exactly consumes stock to zero (boundary)", async () => {
    const f = await createTenantFixture({ slugPrefix: "shortage-boundary" });
    fixtures.push(f);
    const material = await seedMaterial(f, { stockOnHand: 100 });
    const customer = await prisma.customer.create({ data: { tenantId: f.tenant.id, name: "Acme" } });
    const product = await seedProduct(f, material.id, 100); // 1 unit * 100/unit = 100, exactly stockOnHand
    await seedOrder(f, customer.id, product.id, { orderNumber: "SO-000001", quantity: 1, dueDate: "2026-09-20" });

    const rows = await predictShortages(f.db, { asOf: ASOF });
    const row = rows.find((r) => r.materialId === material.id)!;
    expect(row.committedDemand).toBe(100);
    expect(row.projectedBalance).toBe(0);
    expect(row.firstShortfallOrderId).toBeNull();
    expect(row.severity).toBe("OK");
  });

  it("identifies the 3rd due order as the first to go short across multiple orders", async () => {
    const f = await createTenantFixture({ slugPrefix: "shortage-3rd" });
    fixtures.push(f);
    const material = await seedMaterial(f, { stockOnHand: 100, reorderLeadTimeDays: 7 });
    const customer = await prisma.customer.create({ data: { tenantId: f.tenant.id, name: "Acme" } });
    const product = await seedProduct(f, material.id, 40); // each order of qty 1 needs 40

    // Balance walk (earliest-due first): 100 -> 60 (o1) -> 20 (o2) -> -20 (o3, first shortfall).
    const o3 = await seedOrder(f, customer.id, product.id, { orderNumber: "SO-000003", quantity: 1, dueDate: "2026-09-25" });
    const o1 = await seedOrder(f, customer.id, product.id, { orderNumber: "SO-000001", quantity: 1, dueDate: "2026-09-15" });
    const o2 = await seedOrder(f, customer.id, product.id, { orderNumber: "SO-000002", quantity: 1, dueDate: "2026-09-20" });
    void o1;
    void o2;

    const rows = await predictShortages(f.db, { asOf: ASOF });
    const row = rows.find((r) => r.materialId === material.id)!;
    expect(row.committedDemand).toBe(120);
    expect(row.projectedBalance).toBe(-20);
    expect(row.firstShortfallOrderId).toBe(o3.id);
    expect(row.firstShortfallDate).toBe("2026-09-25");
  });

  it("is SHORT when the first shortfall order is already due, WATCH when within the reorder lead time, OK when beyond it", async () => {
    const f = await createTenantFixture({ slugPrefix: "shortage-severity" });
    fixtures.push(f);
    const customer = await prisma.customer.create({ data: { tenantId: f.tenant.id, name: "Acme" } });

    const shortMaterial = await seedMaterial(f, { code: "RM-SHORT", stockOnHand: 10, reorderLeadTimeDays: 7 });
    const shortProduct = await seedProduct(f, shortMaterial.id, 50);
    await seedOrder(f, customer.id, shortProduct.id, { orderNumber: "SO-SHORT-1", quantity: 1, dueDate: "2026-09-01" }); // already due

    const watchMaterial = await seedMaterial(f, { code: "RM-WATCH", stockOnHand: 10, reorderLeadTimeDays: 7 });
    const watchProduct = await seedProduct(f, watchMaterial.id, 50);
    await seedOrder(f, customer.id, watchProduct.id, { orderNumber: "SO-WATCH-1", quantity: 1, dueDate: "2026-09-18" }); // 4 days out, within 7-day lead time

    const okMaterial = await seedMaterial(f, { code: "RM-OK", stockOnHand: 10, reorderLeadTimeDays: 7 });
    const okProduct = await seedProduct(f, okMaterial.id, 50);
    await seedOrder(f, customer.id, okProduct.id, { orderNumber: "SO-OK-1", quantity: 1, dueDate: "2026-10-30" }); // far beyond lead time

    const rows = await predictShortages(f.db, { asOf: ASOF });
    expect(rows.find((r) => r.materialId === shortMaterial.id)!.severity).toBe("SHORT");
    expect(rows.find((r) => r.materialId === watchMaterial.id)!.severity).toBe("WATCH");
    expect(rows.find((r) => r.materialId === okMaterial.id)!.severity).toBe("OK");
  });

  it("returns null daysOfCoverAtCurrentRate for a material with no ISSUE movements, and a number for one with recent ISSUEs", async () => {
    const f = await createTenantFixture({ slugPrefix: "shortage-coverage" });
    fixtures.push(f);
    const noHistory = await seedMaterial(f, { code: "RM-NOHIST", stockOnHand: 100 });
    const withHistory = await seedMaterial(f, { code: "RM-HIST", stockOnHand: 100 });

    await prisma.stockMovement.create({
      data: {
        tenantId: f.tenant.id,
        materialId: withHistory.id,
        type: "ISSUE",
        quantity: 30,
        balanceAfter: 70,
        createdById: f.admin.id,
        createdAt: new Date(ASOF.getTime() - 5 * 24 * 60 * 60 * 1000),
      },
    });

    const rows = await predictShortages(f.db, { asOf: ASOF });
    expect(rows.find((r) => r.materialId === noHistory.id)!.daysOfCoverAtCurrentRate).toBeNull();
    const withHistoryRow = rows.find((r) => r.materialId === withHistory.id)!;
    expect(withHistoryRow.daysOfCoverAtCurrentRate).not.toBeNull();
    expect(withHistoryRow.daysOfCoverAtCurrentRate).toBeGreaterThan(0);
  });
});
