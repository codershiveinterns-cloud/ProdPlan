/**
 * Integration: orders list query (docs/M1_SPEC.md §5 "List URL contract", §6.1) — default open filter, status /
 * priority / customer / due range / batch filters, case-insensitive search across order #, customer, SKU, name and
 * PO ref, sorting and 25-per-page pagination; plus the detail read model (BOM requirement + routing preview).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { countActiveOrderFilters, listOrders, orderListQuery, parseOrderListParams } from "@/lib/orders/list";
import { getOrderDetail } from "@/lib/orders/service";
import { createTenantFixture, dbAvailable, deleteTenant, disconnectDb, type TenantFixture } from "./helpers";

const available = await dbAvailable();

describe.skipIf(!available)("orders list + detail (integration)", () => {
  let f: TenantFixture;
  let acmeId: string;
  let betaId: string;
  let bracketId: string;
  let housingId: string;
  let batchId: string;

  beforeAll(async () => {
    f = await createTenantFixture({ slugPrefix: "ord-list" });
    const t = f.tenant.id;
    acmeId = (await prisma.customer.create({ data: { tenantId: t, name: "Acme Motors" } })).id;
    betaId = (await prisma.customer.create({ data: { tenantId: t, name: "Beta Fab" } })).id;
    bracketId = (await prisma.product.create({ data: { tenantId: t, sku: "HB-200", name: "Hydraulic Bracket", unit: "pcs" } })).id;
    housingId = (await prisma.product.create({ data: { tenantId: t, sku: "GX-40", name: "Gearbox Housing", unit: "set" } })).id;
    batchId = (await prisma.importBatch.create({ data: { tenantId: t, fileName: "x.csv", status: "COMMITTED", createdById: f.admin.id } })).id;
    const rows = [];
    for (let i = 1; i <= 30; i++) {
      rows.push({
        tenantId: t,
        orderNumber: `SO-${String(i).padStart(6, "0")}`,
        customerId: i % 3 === 0 ? betaId : acmeId,
        productId: i % 2 === 0 ? housingId : bracketId,
        quantity: i * 10,
        priority: (["LOW", "NORMAL", "HIGH", "URGENT"] as const)[i % 4],
        dueDate: new Date(Date.UTC(2030, 0, i)),
        status: i > 26 ? ("COMPLETED" as const) : i === 26 ? ("CANCELLED" as const) : i % 5 === 0 ? ("IN_PROGRESS" as const) : ("QUEUED" as const),
        customerPoRef: i % 7 === 0 ? `PO-SEVEN-${i}` : null,
        importBatchId: i <= 3 ? batchId : null,
        createdById: f.admin.id,
      });
    }
    await prisma.order.createMany({ data: rows });
  });

  afterAll(async () => {
    await deleteTenant(f?.tenant.id);
    await disconnectDb();
  });

  it("parses the URL contract with defaults and ignores garbage", () => {
    const p = parseOrderListParams({});
    expect(p).toEqual({ q: "", page: 1, sort: "dueDate", dir: "asc", status: "open", priority: "", customerId: "", dueFrom: "", dueTo: "", batch: "", risk: "" });
    expect(countActiveOrderFilters(p)).toBe(0);
    expect(orderListQuery(p)).toBe("");
    const q = parseOrderListParams({ q: " so-1 ", page: "3", sort: "customer", dir: "DESC", status: "completed,cancelled", priority: "urgent", customerId: "abc", dueFrom: "2030-01-05", dueTo: "not-a-date", batch: "b1" });
    expect(q).toMatchObject({ q: "so-1", page: 3, sort: "customer", dir: "desc", status: "COMPLETED,CANCELLED", priority: "URGENT", customerId: "abc", dueFrom: "2030-01-05", dueTo: "", batch: "b1" });
    expect(countActiveOrderFilters(q)).toBe(5);
    expect(orderListQuery(q)).toBe("?q=so-1&status=COMPLETED%2CCANCELLED&priority=URGENT&customerId=abc&dueFrom=2030-01-05&batch=b1&sort=customer&dir=desc&page=3");
    expect(parseOrderListParams({ page: "0", sort: "bogus", dir: "sideways" })).toMatchObject({ page: 1, sort: "dueDate", dir: "asc" });
  });

  it("defaults to open orders, dueDate asc, 25 per page", async () => {
    const page1 = await listOrders(f.db, parseOrderListParams({}));
    expect(page1.total).toBe(25); // 30 minus 4 COMPLETED minus 1 CANCELLED
    expect(page1.rows).toHaveLength(25);
    expect(page1.rows[0]).toMatchObject({ orderNumber: "SO-000001", customerName: "Acme Motors", productSku: "HB-200", productUnit: "pcs", quantity: 10, dueDate: "2030-01-01", status: "QUEUED" });
    expect(page1.rows.map((r) => r.dueDate)).toEqual([...page1.rows.map((r) => r.dueDate)].sort());
    const all = await listOrders(f.db, parseOrderListParams({ status: "all" }));
    expect(all.total).toBe(30);
    expect(all.rows).toHaveLength(25);
    const page2 = await listOrders(f.db, parseOrderListParams({ status: "all", page: "2" }));
    expect(page2.rows.map((r) => r.orderNumber)).toEqual(["SO-000026", "SO-000027", "SO-000028", "SO-000029", "SO-000030"]);
  });

  it("applies status, priority, customer, due range and batch filters", async () => {
    expect((await listOrders(f.db, parseOrderListParams({ status: "IN_PROGRESS" }))).rows.map((r) => r.orderNumber)).toEqual(["SO-000005", "SO-000010", "SO-000015", "SO-000020", "SO-000025"]);
    expect((await listOrders(f.db, parseOrderListParams({ status: "completed" }))).total).toBe(4);
    expect((await listOrders(f.db, parseOrderListParams({ status: "all", priority: "URGENT" }))).rows.every((r) => r.priority === "URGENT")).toBe(true);
    expect((await listOrders(f.db, parseOrderListParams({ status: "all", customerId: betaId }))).total).toBe(10);
    expect((await listOrders(f.db, parseOrderListParams({ status: "all", dueFrom: "2030-01-10", dueTo: "2030-01-12" }))).rows.map((r) => r.orderNumber)).toEqual(["SO-000010", "SO-000011", "SO-000012"]);
    expect((await listOrders(f.db, parseOrderListParams({ status: "all", batch: batchId }))).rows.map((r) => r.orderNumber)).toEqual(["SO-000001", "SO-000002", "SO-000003"]);
  });

  it("searches order #, customer, SKU, product name and PO ref case-insensitively", async () => {
    expect((await listOrders(f.db, parseOrderListParams({ status: "all", q: "so-00001" }))).total).toBe(10);
    expect((await listOrders(f.db, parseOrderListParams({ status: "all", q: "beta" }))).total).toBe(10);
    expect((await listOrders(f.db, parseOrderListParams({ status: "all", q: "gx-40" }))).total).toBe(15);
    expect((await listOrders(f.db, parseOrderListParams({ status: "all", q: "hydraulic" }))).total).toBe(15);
    expect((await listOrders(f.db, parseOrderListParams({ status: "all", q: "po-seven" }))).rows.map((r) => r.customerPoRef)).toEqual(["PO-SEVEN-7", "PO-SEVEN-14", "PO-SEVEN-21", "PO-SEVEN-28"]);
    expect((await listOrders(f.db, parseOrderListParams({ q: "nothing-matches" }))).total).toBe(0);
  });

  it("sorts by every declared key", async () => {
    const byNumberDesc = await listOrders(f.db, parseOrderListParams({ status: "all", sort: "orderNumber", dir: "desc" }));
    expect(byNumberDesc.rows[0]!.orderNumber).toBe("SO-000030");
    const byCustomer = await listOrders(f.db, parseOrderListParams({ status: "all", sort: "customer", dir: "desc" }));
    expect(byCustomer.rows[0]!.customerName).toBe("Beta Fab");
    const byQty = await listOrders(f.db, parseOrderListParams({ status: "all", sort: "quantity", dir: "desc" }));
    expect(byQty.rows[0]!.quantity).toBe(300);
    const byProduct = await listOrders(f.db, parseOrderListParams({ status: "all", sort: "product", dir: "asc" }));
    expect(byProduct.rows[0]!.productSku).toBe("GX-40");
    const byStatus = await listOrders(f.db, parseOrderListParams({ status: "all", sort: "status", dir: "desc" }));
    expect(byStatus.rows[0]!.status).toBe("CANCELLED");
    const byPriority = await listOrders(f.db, parseOrderListParams({ status: "all", sort: "priority", dir: "desc" }));
    expect(byPriority.rows[0]!.priority).toBe("URGENT");
    const byCreated = await listOrders(f.db, parseOrderListParams({ status: "all", sort: "createdAt", dir: "asc" }));
    expect(byCreated.rows).toHaveLength(25);
    const byPo = await listOrders(f.db, parseOrderListParams({ status: "all", sort: "customerPoRef", dir: "asc" }));
    expect(byPo.rows[0]!.customerPoRef).toBe("PO-SEVEN-14");
  });

  it("getOrderDetail computes the material requirement via lib/bom and the routing preview", async () => {
    const t = f.tenant.id;
    const steel = await prisma.material.create({ data: { tenantId: t, code: "RM-STEEL", name: "Steel", unit: "kg", stockOnHand: 100 } });
    const bolt = await prisma.material.create({ data: { tenantId: t, code: "HW-BOLT", name: "Bolt", unit: "pcs", stockOnHand: 10 } });
    await prisma.bomItem.createMany({
      data: [
        { tenantId: t, productId: bracketId, materialId: steel.id, quantityPerUnit: 2.5, scrapPercent: 4 },
        { tenantId: t, productId: bracketId, materialId: bolt.id, quantityPerUnit: 4, scrapPercent: 0 },
      ],
    });
    const wc = await prisma.workCenter.create({ data: { tenantId: t, code: "CNC", name: "CNC milling" } });
    const paint = await prisma.workCenter.create({ data: { tenantId: t, code: "PAINT", name: "Paint shop" } });
    await prisma.productOperation.createMany({
      data: [
        { tenantId: t, productId: bracketId, sequence: 20, workCenterId: paint.id, setupMinutes: 15, runMinutesPerUnit: 0.5 },
        { tenantId: t, productId: bracketId, sequence: 10, workCenterId: wc.id, setupMinutes: 30, runMinutesPerUnit: 2 },
      ],
    });
    const order = await prisma.order.findFirstOrThrow({ where: { tenantId: t, orderNumber: "SO-000001" } });
    const detail = await getOrderDetail(f.db, order.id);
    expect(detail).not.toBeNull();
    expect(detail!.quantity).toBe(10);
    expect(detail!.materials.map((m) => ({ code: m.materialCode, required: m.required, onHand: m.onHand, shortBy: m.shortBy, isShort: m.isShort }))).toEqual([
      { code: "RM-STEEL", required: 26, onHand: 100, shortBy: 0, isShort: false },
      { code: "HW-BOLT", required: 40, onHand: 10, shortBy: 30, isShort: true },
    ]);
    expect(detail!.routing.map((r) => [r.sequence, r.workCenterCode, r.estimatedMinutes])).toEqual([
      [10, "CNC", 50],
      [20, "PAINT", 20],
    ]);
    expect(detail!.routingTotalMinutes).toBe(70);
    expect(await getOrderDetail(f.db, "nope")).toBeNull();
  });
});
