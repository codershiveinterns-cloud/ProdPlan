/**
 * Integration: materials master data (docs/M1_SPEC.md §6.4) — create/update/deactivate/delete rules with their
 * audit rows, the list URL contract + query, where-used maths, ledger pagination and audit history.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuditCtx } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { reorderState, toMaterialDTO } from "@/lib/materials/dto";
import {
  countActiveMaterialFilters,
  listMaterials,
  materialListHref,
  MATERIALS_PAGE_SIZE,
  parseMaterialListParams,
} from "@/lib/materials/list";
import { listLedger, materialAuditRows, whereUsed } from "@/lib/materials/queries";
import {
  createMaterial,
  deleteMaterial,
  describeReferences,
  isDeletable,
  MaterialCodeTakenError,
  MaterialInUseError,
  materialReferences,
  setMaterialActive,
  updateMaterial,
} from "@/lib/materials/service";
import { recordStockMovement, type StockActor } from "@/lib/stock";
import { materialSchema } from "@/lib/validation/materials";
import { createTenantFixture, dbAvailable, deleteTenant, disconnectDb, type TenantFixture } from "./helpers";

const available = await dbAvailable();

function input(overrides: Record<string, unknown>) {
  return materialSchema.parse({
    code: "RM-1",
    name: "Steel plate",
    unit: "KG",
    reorderThreshold: "10",
    reorderLeadTimeDays: "7",
    unitCost: "12.5",
    supplier: "Tata Steel",
    ...overrides,
  });
}

describe.skipIf(!available)("materials service (integration)", () => {
  let T: TenantFixture;
  let actor: StockActor;
  let ctx: AuditCtx;

  beforeAll(async () => {
    T = await createTenantFixture({ slugPrefix: "materials" });
    actor = {
      user: { id: T.admin.id, role: T.admin.role, email: T.admin.email, name: T.admin.name },
      tenant: { id: T.tenant.id },
    };
    ctx = { actor: { id: T.admin.id, email: T.admin.email, name: T.admin.name, tenantId: T.tenant.id }, ip: null, userAgent: null };
  });

  afterAll(async () => {
    await deleteTenant(T?.tenant.id);
    await disconnectDb();
  });

  it("creates a material (unit lower-cased, decimals stored at 3/2 dp) with a CREATE audit row", async () => {
    const m = await createMaterial(T.db, actor, ctx, input({ code: " RM-1 ", supplier: "  Tata Steel " }));
    expect(m).toMatchObject({ tenantId: T.tenant.id, code: "RM-1", name: "Steel plate", unit: "kg", reorderLeadTimeDays: 7, supplier: "Tata Steel", isActive: true });
    expect(String(m.stockOnHand)).toBe("0");
    expect(String(m.reorderThreshold)).toBe("10");
    expect(String(m.unitCost)).toBe("12.5");

    const dto = toMaterialDTO(m);
    expect(dto).toMatchObject({ id: m.id, stockOnHand: 0, reorderThreshold: 10, unitCost: 12.5, supplier: "Tata Steel" });
    expect(typeof dto.createdAt).toBe("string");
    expect(reorderState(m)).toBe("below");

    const audit = await prisma.auditLog.findFirst({ where: { tenantId: T.tenant.id, entityType: "Material", entityId: m.id } });
    expect(audit).toMatchObject({ action: "CREATE", entityLabel: "RM-1", actorUserId: T.admin.id, summary: "Material RM-1 (Steel plate) created" });
    expect(audit?.after).toMatchObject({ code: "RM-1", unit: "kg", reorderThreshold: 10, unitCost: 12.5 });
    expect(audit?.changedFields).toEqual([]);
  });

  it("rejects duplicate codes case-insensitively and leaves no partial rows", async () => {
    await expect(createMaterial(T.db, actor, ctx, input({ code: "rm-1", name: "Dup" }))).rejects.toBeInstanceOf(MaterialCodeTakenError);
    await expect(createMaterial(T.db, actor, ctx, input({ code: "rm-1", name: "Dup" }))).rejects.toMatchObject({ message: "Material code RM-1 already exists" });
    expect(await prisma.material.count({ where: { tenantId: T.tenant.id, name: "Dup" } })).toBe(0);

    const second = await createMaterial(T.db, actor, ctx, input({ code: "RM-2", name: "Copper wire", unit: "m" }));
    await expect(updateMaterial(T.db, actor, ctx, second.id, input({ code: "RM-1" }))).rejects.toBeInstanceOf(MaterialCodeTakenError);
    // Keeping its own code (different case) is fine.
    const renamed = await updateMaterial(T.db, actor, ctx, second.id, input({ code: "rm-2", name: "Copper wire" }));
    expect(renamed.code).toBe("rm-2");
  });

  it("updates master data and audits changedFields (stock on hand untouched)", async () => {
    const m = await prisma.material.findFirstOrThrow({ where: { tenantId: T.tenant.id, code: "RM-1" } });
    const updated = await updateMaterial(T.db, actor, ctx, m.id, input({ name: "Steel plate 5 mm", reorderThreshold: "25", unitCost: "", supplier: "" }));
    expect(updated).toMatchObject({ name: "Steel plate 5 mm", unitCost: null, supplier: null, isActive: true });
    expect(String(updated.reorderThreshold)).toBe("25");
    expect(String(updated.stockOnHand)).toBe("0");

    const audit = await prisma.auditLog.findFirst({
      where: { tenantId: T.tenant.id, entityType: "Material", entityId: m.id, action: "UPDATE" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit?.changedFields.sort()).toEqual(["name", "reorderThreshold", "supplier", "unitCost"]);
    expect(audit?.before).toMatchObject({ name: "Steel plate", reorderThreshold: 10 });
    expect(audit?.after).toMatchObject({ name: "Steel plate 5 mm", reorderThreshold: 25, unitCost: null });

    await expect(updateMaterial(T.db, actor, ctx, "nope", input({}))).rejects.toBeInstanceOf(NotFoundError);
  });

  it("deactivates / reactivates with an audit row", async () => {
    const m = await prisma.material.findFirstOrThrow({ where: { tenantId: T.tenant.id, code: "RM-1" } });
    const off = await setMaterialActive(T.db, actor, ctx, m.id, false);
    expect(off.isActive).toBe(false);
    const audit = await prisma.auditLog.findFirst({
      where: { tenantId: T.tenant.id, entityType: "Material", entityId: m.id, summary: { contains: "deactivated" } },
    });
    expect(audit?.changedFields).toEqual(["isActive"]);
    const on = await setMaterialActive(T.db, actor, ctx, m.id, true);
    expect(on.isActive).toBe(true);
  });

  it("blocks delete when a BOM line or a stock movement references the material; deletes otherwise", async () => {
    const used = await createMaterial(T.db, actor, ctx, input({ code: "RM-USED", name: "Used in BOM", unit: "kg" }));
    const moved = await createMaterial(T.db, actor, ctx, input({ code: "RM-MOVED", name: "Has movements", unit: "pcs" }));
    const free = await createMaterial(T.db, actor, ctx, input({ code: "RM-FREE", name: "Unreferenced", unit: "pcs" }));

    const product = await prisma.product.create({ data: { tenantId: T.tenant.id, sku: "HB-200", name: "Hydraulic Bracket" } });
    const customer = await prisma.customer.create({ data: { tenantId: T.tenant.id, name: "Acme OEM" } });
    await prisma.bomItem.create({ data: { tenantId: T.tenant.id, productId: product.id, materialId: used.id, quantityPerUnit: "2.5", scrapPercent: "4" } });
    await prisma.order.createMany({
      data: [
        { tenantId: T.tenant.id, orderNumber: "SO-000001", customerId: customer.id, productId: product.id, quantity: 10, dueDate: new Date("2026-10-01"), createdById: T.admin.id, status: "QUEUED" },
        { tenantId: T.tenant.id, orderNumber: "SO-000002", customerId: customer.id, productId: product.id, quantity: 10, dueDate: new Date("2026-10-01"), createdById: T.admin.id, status: "COMPLETED" },
      ],
    });
    await recordStockMovement(T.db, actor, ctx, { materialId: moved.id, type: "RECEIPT", quantity: 3 });

    const usedRefs = await materialReferences(T.db, used.id);
    expect(usedRefs).toEqual({ bomItems: 1, movements: 0, openOrders: 1 });
    expect(isDeletable(usedRefs)).toBe(false);
    expect(describeReferences(usedRefs)).toBe("used by 1 BOM line (1 open order)");

    const movedRefs = await materialReferences(T.db, moved.id);
    expect(movedRefs).toEqual({ bomItems: 0, movements: 1, openOrders: 0 });
    expect(describeReferences(movedRefs)).toBe("used by 1 stock movement");

    await expect(deleteMaterial(T.db, actor, ctx, used.id)).rejects.toBeInstanceOf(MaterialInUseError);
    await expect(deleteMaterial(T.db, actor, ctx, used.id)).rejects.toMatchObject({
      message: "RM-USED cannot be deleted: used by 1 BOM line (1 open order). Deactivate it instead.",
    });
    await expect(deleteMaterial(T.db, actor, ctx, moved.id)).rejects.toBeInstanceOf(MaterialInUseError);
    expect(await prisma.material.count({ where: { id: { in: [used.id, moved.id] } } })).toBe(2);

    const freeRefs = await materialReferences(T.db, free.id);
    expect(isDeletable(freeRefs)).toBe(true);
    expect(describeReferences(freeRefs)).toBe("not referenced anywhere");
    await deleteMaterial(T.db, actor, ctx, free.id);
    expect(await prisma.material.findUnique({ where: { id: free.id } })).toBeNull();
    const audit = await prisma.auditLog.findFirst({ where: { tenantId: T.tenant.id, entityType: "Material", entityId: free.id, action: "DELETE" } });
    expect(audit).toMatchObject({ entityLabel: "RM-FREE", summary: "Material RM-FREE (Unreferenced) deleted" });
    expect(audit?.before).toMatchObject({ code: "RM-FREE", name: "Unreferenced" });
    await expect(deleteMaterial(T.db, actor, ctx, free.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("where used: BOM lines with requiredPerUnit = qty × (1 + scrap/100)", async () => {
    const used = await prisma.material.findFirstOrThrow({ where: { tenantId: T.tenant.id, code: "RM-USED" } });
    const rows = await whereUsed(T.db, used.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sku: "HB-200", productName: "Hydraulic Bracket", productUnit: "pcs", productActive: true, quantityPerUnit: 2.5, scrapPercent: 4, requiredPerUnit: 2.6, note: null });
    expect(await whereUsed(T.db, "nope")).toEqual([]);
  });

  it("ledger pagination (25/page, newest first) and audit history with movement rows", async () => {
    const m = await createMaterial(T.db, actor, ctx, input({ code: "RM-LEDGER", name: "Ledger test", unit: "pcs" }));
    for (let i = 1; i <= 27; i++) {
      await recordStockMovement(T.db, actor, ctx, { materialId: m.id, type: "RECEIPT", quantity: i, reference: `GRN-${i}` });
    }
    const page1 = await listLedger(T.db, m.id, 1);
    expect(page1.total).toBe(27);
    expect(page1.rows).toHaveLength(25);
    expect(page1.rows[0].reference).toBe("GRN-27");
    expect(page1.rows[0].createdBy).toEqual({ id: T.admin.id, name: T.admin.name, email: T.admin.email });
    expect(String(page1.rows[0].balanceAfter)).toBe("378");
    const page2 = await listLedger(T.db, m.id, 2);
    expect(page2.rows.map((r) => r.reference)).toEqual(["GRN-2", "GRN-1"]);
    expect((await listLedger(T.db, m.id, 99)).page).toBe(2);

    const history = await materialAuditRows(T.db, m.id, 50);
    expect(history.filter((r) => r.entityType === "Material")).toHaveLength(1);
    expect(history.filter((r) => r.entityType === "StockMovement")).toHaveLength(27);
    expect(history[0].entityType).toBe("StockMovement");
    expect(history[history.length - 1]).toMatchObject({ entityType: "Material", action: "CREATE" });

    // Movements of OTHER materials never leak into this material's history.
    const other = await prisma.material.findFirstOrThrow({ where: { tenantId: T.tenant.id, code: "RM-MOVED" } });
    const otherHistory = await materialAuditRows(T.db, other.id);
    expect(otherHistory.map((r) => r.entityType)).toEqual(["StockMovement", "Material"]);
    expect(await materialAuditRows(T.db, "nope")).toEqual([]);
  });

  describe("list", () => {
    it("parses and re-serialises the URL contract", () => {
      expect(parseMaterialListParams({})).toEqual({ q: "", page: 1, sort: "code", dir: "asc", belowThreshold: false, includeInactive: false });
      const parsed = parseMaterialListParams({ q: " steel ", page: "3", sort: "onHand", dir: "DESC", belowThreshold: "1", includeInactive: "true" });
      expect(parsed).toEqual({ q: "steel", page: 3, sort: "onHand", dir: "desc", belowThreshold: true, includeInactive: true });
      expect(parseMaterialListParams({ page: "0", sort: "evil", dir: "sideways" })).toMatchObject({ page: 1, sort: "code", dir: "asc" });
      expect(materialListHref(parsed, { page: 1 })).toBe("/materials?q=steel&sort=onHand&dir=desc&belowThreshold=1&includeInactive=1");
      expect(materialListHref({ sort: "code", dir: "asc" })).toBe("/materials");
      expect(materialListHref({ q: "a" }, { q: "" })).toBe("/materials");
      expect(countActiveMaterialFilters(parsed)).toBe(2);
      expect(countActiveMaterialFilters({ belowThreshold: false, includeInactive: false })).toBe(0);
    });

    it("filters, sorts and paginates server-side", async () => {
      const L = await createTenantFixture({ slugPrefix: "materials-list" });
      try {
        await prisma.material.createMany({
          data: [
            { tenantId: L.tenant.id, code: "A-BELOW", name: "Below threshold", unit: "kg", stockOnHand: 5, reorderThreshold: 10 },
            { tenantId: L.tenant.id, code: "B-AT", name: "At threshold", unit: "kg", stockOnHand: 10, reorderThreshold: 10 },
            { tenantId: L.tenant.id, code: "C-OK", name: "Plenty", unit: "pcs", stockOnHand: 50, reorderThreshold: 10, supplier: "Zeta" },
            { tenantId: L.tenant.id, code: "D-INACTIVE", name: "Retired below", unit: "pcs", stockOnHand: 0, reorderThreshold: 1, isActive: false },
            ...Array.from({ length: 26 }, (_, i) => ({
              tenantId: L.tenant.id,
              code: `Z-${String(i + 1).padStart(2, "0")}`,
              name: `Filler ${i + 1}`,
              unit: "pcs",
              stockOnHand: 100 + i,
              reorderThreshold: 0,
              supplier: i % 2 ? "Alpha" : null,
            })),
          ],
        });
        const base = parseMaterialListParams({});

        const all = await listMaterials(L.db, base);
        expect(all.total).toBe(29);
        expect(all.rows).toHaveLength(MATERIALS_PAGE_SIZE);
        expect(all.rows[0].code).toBe("A-BELOW");
        expect(all.rows[0]._count).toEqual({ bomItems: 0, movements: 0 });
        const page2 = await listMaterials(L.db, { ...base, page: 2 });
        expect(page2.rows).toHaveLength(4);
        expect(page2.page).toBe(2);
        expect((await listMaterials(L.db, { ...base, page: 9 })).page).toBe(2);

        const below = await listMaterials(L.db, { ...base, belowThreshold: true });
        expect(below.rows.map((r) => r.code)).toEqual(["A-BELOW", "B-AT"]);
        expect(below.rows.map(reorderState)).toEqual(["below", "at"]);

        const belowIncl = await listMaterials(L.db, { ...base, belowThreshold: true, includeInactive: true });
        expect(belowIncl.rows.map((r) => r.code)).toEqual(["A-BELOW", "B-AT", "D-INACTIVE"]);

        const inactive = await listMaterials(L.db, { ...base, includeInactive: true });
        expect(inactive.total).toBe(30);

        const search = await listMaterials(L.db, { ...base, q: "THRESHOLD" });
        expect(search.rows.map((r) => r.code)).toEqual(["A-BELOW", "B-AT"]);
        expect((await listMaterials(L.db, { ...base, q: "c-ok" })).rows.map((r) => r.code)).toEqual(["C-OK"]);
        expect((await listMaterials(L.db, { ...base, q: "nothing here" })).total).toBe(0);

        const byStock = await listMaterials(L.db, { ...base, sort: "onHand", dir: "desc" });
        expect(byStock.rows[0].code).toBe("Z-26");
        expect(byStock.rows[24].code).toBe("Z-02");

        const bySupplier = await listMaterials(L.db, { ...base, sort: "supplier", dir: "asc" });
        expect(bySupplier.rows[0].supplier).toBe("Alpha");
        const suppliers = bySupplier.rows.map((r) => r.supplier);
        expect(suppliers.indexOf("Zeta")).toBeGreaterThan(suppliers.lastIndexOf("Alpha"));
        expect(suppliers.indexOf(null)).toBeGreaterThan(suppliers.indexOf("Zeta"));
      } finally {
        await deleteTenant(L.tenant.id);
      }
    });
  });
});
