/**
 * Integration: BOM rules (docs/M1_SPEC.md §4 "BOM maths", §6.5) — add, duplicate material → "Already in this BOM",
 * coverage with scrap (limiting line), inactive material rejected, edit / remove, audit rows in the same
 * transaction, and the list page's "buildable from stock" column.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Material, Product } from "@/generated/prisma/client";
import type { Session } from "@/lib/auth/guards";
import { prisma, type TenantDb } from "@/lib/db";
import { BOM_DUPLICATE_MESSAGE, ProductFieldError } from "@/lib/products/errors";
import { listProducts } from "@/lib/products/list";
import { DEFAULT_PRODUCT_LIST_PARAMS } from "@/lib/products/list-params";
import { addBomItem, createProduct, removeBomItem, updateBomItem } from "@/lib/products/mutations";
import { getProductDetail, listMaterialOptions, listProductActivity } from "@/lib/products/queries";
import { createTenantFixture, dbAvailable, deleteTenant, disconnectDb, type TenantFixture } from "./helpers";
import { seedMaterial, sessionFor } from "./products-helpers";

const available = await dbAvailable();

describe.skipIf(!available)("products: BOM (integration)", () => {
  let fx: TenantFixture;
  let db: TenantDb;
  let session: Session;
  let product: Product;
  let aluminium: Material;
  let bolt: Material;
  let paint: Material;
  let retired: Material;

  beforeAll(async () => {
    fx = await createTenantFixture({ slugPrefix: "prod-bom" });
    db = fx.db;
    session = sessionFor(fx);
    product = await createProduct(db, session, { sku: "HB-200", name: "Hydraulic Bracket", unit: "pcs", description: undefined, isActive: undefined });
    [aluminium, bolt, paint, retired] = await Promise.all([
      seedMaterial(fx.tenant.id, { code: "RM-AL6061-BAR", name: "Aluminium bar", unit: "kg", stockOnHand: 200 }),
      seedMaterial(fx.tenant.id, { code: "HW-M8-BOLT", name: "M8 bolt", unit: "pcs", stockOnHand: 1000 }),
      seedMaterial(fx.tenant.id, { code: "PT-RAL9005", name: "Black paint", unit: "l", stockOnHand: 3 }),
      seedMaterial(fx.tenant.id, { code: "OLD-1", name: "Retired", unit: "kg", stockOnHand: 999, isActive: false }),
    ]);
  });

  afterAll(async () => {
    await deleteTenant(fx?.tenant.id);
    await disconnectDb();
  });

  it("adds BOM lines and audits each CREATE in the same tenant", async () => {
    const line = await addBomItem(db, session, {
      productId: product.id,
      materialId: aluminium.id,
      quantityPerUnit: 2.5,
      scrapPercent: 10,
      note: "cut to 200 mm",
    });
    expect(line.tenantId).toBe(fx.tenant.id);
    expect(Number(line.quantityPerUnit)).toBe(2.5);
    expect(Number(line.scrapPercent)).toBe(10);

    await addBomItem(db, session, { productId: product.id, materialId: bolt.id, quantityPerUnit: 4, scrapPercent: 0, note: undefined });
    await addBomItem(db, session, { productId: product.id, materialId: paint.id, quantityPerUnit: 0.05, scrapPercent: 0, note: undefined });

    const rows = await prisma.auditLog.findMany({ where: { tenantId: fx.tenant.id, entityType: "BomItem", action: "CREATE" } });
    expect(rows).toHaveLength(3);
    const first = rows.find((r) => r.entityId === line.id)!;
    expect(first.entityLabel).toBe("HB-200 · RM-AL6061-BAR");
    expect(first.actorUserId).toBe(fx.admin.id);
    expect(first.after).toMatchObject({ productId: product.id, materialId: aluminium.id, quantityPerUnit: 2.5, scrapPercent: 10 });
    expect(first.summary).toContain("RM-AL6061-BAR");
  });

  it("rejects a duplicate material with a field-level 'Already in this BOM' and writes nothing", async () => {
    const before = await prisma.bomItem.count({ where: { productId: product.id } });
    const auditBefore = await prisma.auditLog.count({ where: { tenantId: fx.tenant.id } });
    await expect(
      addBomItem(db, session, { productId: product.id, materialId: aluminium.id, quantityPerUnit: 1, scrapPercent: 0, note: undefined }),
    ).rejects.toMatchObject({ field: "materialId", message: BOM_DUPLICATE_MESSAGE });
    await expect(
      addBomItem(db, session, { productId: product.id, materialId: aluminium.id, quantityPerUnit: 1, scrapPercent: 0, note: undefined }),
    ).rejects.toBeInstanceOf(ProductFieldError);
    expect(await prisma.bomItem.count({ where: { productId: product.id } })).toBe(before);
    expect(await prisma.auditLog.count({ where: { tenantId: fx.tenant.id } })).toBe(auditBefore);
  });

  it("rejects inactive materials and materials of another tenant", async () => {
    await expect(
      addBomItem(db, session, { productId: product.id, materialId: retired.id, quantityPerUnit: 1, scrapPercent: 0, note: undefined }),
    ).rejects.toMatchObject({ field: "materialId", message: "This material is inactive" });

    const other = await createTenantFixture({ slugPrefix: "prod-bom-other" });
    try {
      const foreign = await seedMaterial(other.tenant.id, { code: "FOREIGN", stockOnHand: 5 });
      await expect(
        addBomItem(db, session, { productId: product.id, materialId: foreign.id, quantityPerUnit: 1, scrapPercent: 0, note: undefined }),
      ).rejects.toMatchObject({ field: "materialId", message: "Select a material" });
    } finally {
      await deleteTenant(other.tenant.id);
    }
    // The picker never offers inactive materials either.
    const options = await listMaterialOptions(db);
    expect(options.map((m) => m.code)).toEqual(["HW-M8-BOLT", "PT-RAL9005", "RM-AL6061-BAR"]);
  });

  it("computes coverage with scrap and highlights the limiting line", async () => {
    const detail = await getProductDetail(db, product.id);
    expect(detail).not.toBeNull();
    // aluminium: 2.5 × 1.10 = 2.75 kg/pc → 200 / 2.75 = 72; bolt: 1000 / 4 = 250; paint: 3 / 0.05 = 60 → limiting.
    expect(detail!.bom.buildable).toBe(60);
    expect(detail!.bom.limitingMaterialId).toBe(paint.id);
    const byCode = Object.fromEntries(detail!.bom.items.map((l) => [l.materialCode, l]));
    expect(byCode["RM-AL6061-BAR"]).toMatchObject({ requiredPerUnit: 2.75, onHand: 200, buildable: 72, isLimiting: false, note: "cut to 200 mm" });
    expect(byCode["HW-M8-BOLT"]).toMatchObject({ requiredPerUnit: 4, buildable: 250, isLimiting: false });
    expect(byCode["PT-RAL9005"]).toMatchObject({ requiredPerUnit: 0.05, buildable: 60, isLimiting: true, materialUnit: "l" });
    expect(detail!.bom.items.map((l) => l.materialCode)).toEqual(["HW-M8-BOLT", "PT-RAL9005", "RM-AL6061-BAR"]);
  });

  it("shows the same buildable figure and counts on the list page", async () => {
    const { rows, total } = await listProducts(db, DEFAULT_PRODUCT_LIST_PARAMS);
    expect(total).toBe(1);
    expect(rows[0]).toMatchObject({ sku: "HB-200", bomLines: 3, routingSteps: 0, buildable: 60, unit: "pcs" });
  });

  it("edits quantity/scrap (material fixed) and audits the changed fields", async () => {
    const paintLine = (await prisma.bomItem.findFirstOrThrow({ where: { productId: product.id, materialId: paint.id } })).id;
    await updateBomItem(db, session, paintLine, {
      productId: product.id,
      materialId: paint.id,
      quantityPerUnit: 0.02,
      scrapPercent: 5,
      note: undefined,
    });
    const detail = await getProductDetail(db, product.id);
    // paint: 0.02 × 1.05 = 0.021 → 3 / 0.021 = 142; aluminium (72) now limits.
    expect(detail!.bom.buildable).toBe(72);
    expect(detail!.bom.limitingMaterialId).toBe(aluminium.id);

    const row = await prisma.auditLog.findFirstOrThrow({ where: { entityId: paintLine, action: "UPDATE" } });
    expect(row.changedFields.sort()).toEqual(["quantityPerUnit", "scrapPercent"]);

    await expect(
      updateBomItem(db, session, paintLine, { productId: product.id, materialId: bolt.id, quantityPerUnit: 1, scrapPercent: 0, note: undefined }),
    ).rejects.toBeInstanceOf(ProductFieldError);
  });

  it("removes a line, audits DELETE with the productId in the snapshot, and the activity feed finds it", async () => {
    const boltLine = (await prisma.bomItem.findFirstOrThrow({ where: { productId: product.id, materialId: bolt.id } })).id;
    await removeBomItem(db, session, boltLine);
    expect(await prisma.bomItem.count({ where: { productId: product.id } })).toBe(2);
    const row = await prisma.auditLog.findFirstOrThrow({ where: { entityId: boltLine, action: "DELETE" } });
    expect(row.before).toMatchObject({ productId: product.id, materialId: bolt.id });

    const activity = await listProductActivity(db, product.id);
    const kinds = activity.map((a) => `${a.entityType}:${a.action}`);
    expect(kinds).toContain("BomItem:DELETE");
    expect(kinds).toContain("BomItem:UPDATE");
    expect(kinds.filter((k) => k === "BomItem:CREATE")).toHaveLength(3);
    expect(kinds).toContain("Product:CREATE");
    // Newest first.
    expect(kinds[0]).toBe("BomItem:DELETE");
  });

  it("keeps a removed material's stock untouched and the other tenant's audit log empty", async () => {
    expect(Number((await prisma.material.findUniqueOrThrow({ where: { id: bolt.id } })).stockOnHand)).toBe(1000);
    expect(await prisma.auditLog.count({ where: { tenantId: { not: fx.tenant.id }, entityId: product.id } })).toBe(0);
  });
});
