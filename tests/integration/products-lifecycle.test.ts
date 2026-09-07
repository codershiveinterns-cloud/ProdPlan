/**
 * Integration: product lifecycle (docs/M1_SPEC.md §4 "Units", "Delete vs deactivate", §6.5) — create (unit
 * lower-cased, SKU unique case-insensitively), edit, list search/filter/sort/pagination contract, hard delete
 * only when unreferenced (cascades BOM + routing), delete blocked by orders → deactivate, audit on every step.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/guards";
import { prisma, type TenantDb } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { ProductFieldError } from "@/lib/products/errors";
import { listProducts } from "@/lib/products/list";
import { countActiveProductFilters, DEFAULT_PRODUCT_LIST_PARAMS, parseProductListParams, productListHref } from "@/lib/products/list-params";
import {
  addBomItem,
  addOperation,
  createProduct,
  deleteProduct,
  ProductInUseError,
  setProductActive,
  updateProduct,
} from "@/lib/products/mutations";
import { getProduct, getProductDetail } from "@/lib/products/queries";
import { productSchema } from "@/lib/validation/products";
import { createTenantFixture, dbAvailable, deleteTenant, disconnectDb, type TenantFixture } from "./helpers";
import { seedMaterial, seedWorkCenter, sessionFor } from "./products-helpers";

const available = await dbAvailable();

const base = { description: undefined, isActive: undefined };

describe.skipIf(!available)("products: lifecycle (integration)", () => {
  let fx: TenantFixture;
  let db: TenantDb;
  let session: Session;

  beforeAll(async () => {
    fx = await createTenantFixture({ slugPrefix: "prod-life" });
    db = fx.db;
    session = sessionFor(fx);
  });

  afterAll(async () => {
    await deleteTenant(fx?.tenant.id);
    await disconnectDb();
  });

  it("creates a product with a lower-cased unit and audits CREATE", async () => {
    const input = productSchema.parse({ sku: " HB-200 ", name: "Hydraulic Bracket", unit: " KG ", description: "", isActive: undefined });
    expect(input).toMatchObject({ sku: "HB-200", unit: "kg", description: undefined });
    const product = await createProduct(db, session, input);
    expect(product).toMatchObject({ tenantId: fx.tenant.id, sku: "HB-200", unit: "kg", isActive: true, description: null });
    const row = await prisma.auditLog.findFirstOrThrow({ where: { entityId: product.id, action: "CREATE" } });
    expect(row).toMatchObject({ tenantId: fx.tenant.id, entityType: "Product", entityLabel: "HB-200", actorUserId: fx.admin.id });
    expect(row.after).toMatchObject({ sku: "HB-200", unit: "kg" });
  });

  it("rejects a duplicate SKU (case-insensitive) as a field error, in create and edit", async () => {
    await expect(createProduct(db, session, { ...base, sku: "hb-200", name: "Dup", unit: "pcs" })).rejects.toMatchObject({
      field: "sku",
      message: "A product with SKU HB-200 already exists",
    });
    const other = await createProduct(db, session, { ...base, sku: "GX-40", name: "Gearbox", unit: "pcs" });
    await expect(updateProduct(db, session, other.id, { ...base, sku: "HB-200", name: "Gearbox", unit: "pcs" })).rejects.toBeInstanceOf(ProductFieldError);
    // Editing without changing the SKU is fine.
    const same = await updateProduct(db, session, other.id, { sku: "GX-40", name: "Gearbox Housing", unit: "PCS", description: "Cast", isActive: undefined });
    expect(same).toMatchObject({ name: "Gearbox Housing", unit: "PCS", description: "Cast" });
    const row = await prisma.auditLog.findFirstOrThrow({ where: { entityId: other.id, action: "UPDATE" }, orderBy: { createdAt: "desc" } });
    expect(row.changedFields.sort()).toEqual(["description", "name", "unit"]);
    // The same SKU in another tenant is allowed (composite uniqueness).
    const b = await createTenantFixture({ slugPrefix: "prod-life-b" });
    try {
      const twin = await createProduct(b.db, sessionFor(b), { ...base, sku: "HB-200", name: "Twin", unit: "pcs" });
      expect(twin.tenantId).toBe(b.tenant.id);
    } finally {
      await deleteTenant(b.tenant.id);
    }
  });

  it("list: search sku/name, hides inactive by default, includeInactive=1 shows them, sorts and paginates", async () => {
    const gx = await prisma.product.findFirstOrThrow({ where: { tenantId: fx.tenant.id, sku: "GX-40" } });
    await setProductActive(db, session, gx.id, false);
    expect((await getProduct(db, gx.id))?.isActive).toBe(false);
    const deact = await prisma.auditLog.findFirstOrThrow({ where: { entityId: gx.id, action: "UPDATE" }, orderBy: { createdAt: "desc" } });
    expect(deact.changedFields).toEqual(["isActive"]);
    expect(deact.summary).toContain("deactivated");

    for (let i = 1; i <= 26; i++) {
      await prisma.product.create({ data: { tenantId: fx.tenant.id, sku: `BULK-${String(i).padStart(2, "0")}`, name: `Bulk item ${i}` } });
    }

    const defaults = await listProducts(db, DEFAULT_PRODUCT_LIST_PARAMS);
    expect(defaults.total).toBe(27); // 26 bulk + HB-200 (GX-40 hidden)
    expect(defaults.rows).toHaveLength(25);
    expect(defaults.rows[0].sku).toBe("BULK-01");
    const page2 = await listProducts(db, { ...DEFAULT_PRODUCT_LIST_PARAMS, page: 2 });
    expect(page2.rows.map((r) => r.sku)).toEqual(["BULK-26", "HB-200"]);

    const withInactive = await listProducts(db, { ...DEFAULT_PRODUCT_LIST_PARAMS, includeInactive: true, sort: "sku", dir: "desc" });
    expect(withInactive.total).toBe(28);
    expect(withInactive.rows[0].sku).toBe("HB-200");
    expect(withInactive.rows[1]).toMatchObject({ sku: "GX-40", isActive: false });

    const search = await listProducts(db, { ...DEFAULT_PRODUCT_LIST_PARAMS, q: "gearbox", includeInactive: true });
    expect(search.rows.map((r) => r.sku)).toEqual(["GX-40"]);
    expect((await listProducts(db, { ...DEFAULT_PRODUCT_LIST_PARAMS, q: "gearbox" })).total).toBe(0);
    expect((await listProducts(db, { ...DEFAULT_PRODUCT_LIST_PARAMS, q: "hb-2" })).rows.map((r) => r.sku)).toEqual(["HB-200"]);

    const byName = await listProducts(db, { ...DEFAULT_PRODUCT_LIST_PARAMS, sort: "name", dir: "desc" });
    expect(byName.rows[0].sku).toBe("HB-200");

    // URL contract helpers.
    const params = parseProductListParams({ q: " gear ", page: "2", sort: "bomLines", dir: "desc", includeInactive: "1" });
    expect(params).toEqual({ q: "gear", page: 2, sort: "bomLines", dir: "desc", includeInactive: true });
    expect(countActiveProductFilters(params)).toBe(1);
    expect(productListHref(params)).toBe("/products?q=gear&includeInactive=1&sort=bomLines&dir=desc&page=2");
    expect(productListHref(DEFAULT_PRODUCT_LIST_PARAMS)).toBe("/products");
    expect(parseProductListParams({ page: "-3", sort: "hacker", dir: "sideways" })).toEqual(DEFAULT_PRODUCT_LIST_PARAMS);

    await prisma.product.deleteMany({ where: { tenantId: fx.tenant.id, sku: { startsWith: "BULK-" } } });
  });

  it("hard-deletes an unreferenced product with its BOM and routing, and audits DELETE", async () => {
    const product = await createProduct(db, session, { ...base, sku: "TMP-1", name: "Temporary", unit: "pcs" });
    const material = await seedMaterial(fx.tenant.id, { code: "RM-TMP", stockOnHand: 10 });
    const wc = await seedWorkCenter(fx.tenant.id, "WC-TMP");
    await addBomItem(db, session, { productId: product.id, materialId: material.id, quantityPerUnit: 1, scrapPercent: 0, note: undefined });
    await addOperation(db, session, { productId: product.id, workCenterId: wc.id, machineId: undefined, setupMinutes: 0, runMinutesPerUnit: 1 });

    expect((await getProductDetail(db, product.id))?.orderCount).toBe(0);
    expect(await deleteProduct(db, session, product.id)).toEqual({ sku: "TMP-1" });

    expect(await prisma.product.findUnique({ where: { id: product.id } })).toBeNull();
    expect(await prisma.bomItem.count({ where: { productId: product.id } })).toBe(0);
    expect(await prisma.productOperation.count({ where: { productId: product.id } })).toBe(0);
    // Master data referenced by the deleted rows is untouched.
    expect(await prisma.material.count({ where: { id: material.id } })).toBe(1);
    expect(await prisma.workCenter.count({ where: { id: wc.id } })).toBe(1);

    const row = await prisma.auditLog.findFirstOrThrow({ where: { entityId: product.id, action: "DELETE" } });
    expect(row.entityLabel).toBe("TMP-1");
    expect(row.summary).toContain("1 BOM line");
    expect(row.before).toMatchObject({ sku: "TMP-1", bomItems: [{ materialId: material.id }], operations: [{ sequence: 10 }] });
    expect(await getProductDetail(db, product.id)).toBeNull();
  });

  it("blocks delete while orders reference the product and offers deactivate instead", async () => {
    const product = await prisma.product.findFirstOrThrow({ where: { tenantId: fx.tenant.id, sku: "HB-200" } });
    const customer = await prisma.customer.create({ data: { tenantId: fx.tenant.id, name: "Acme OEM" } });
    await prisma.order.create({
      data: {
        tenantId: fx.tenant.id,
        orderNumber: "SO-000001",
        customerId: customer.id,
        productId: product.id,
        quantity: 100,
        dueDate: new Date(Date.UTC(2026, 9, 1)),
        createdById: fx.admin.id,
      },
    });

    const auditBefore = await prisma.auditLog.count({ where: { tenantId: fx.tenant.id } });
    const attempt = deleteProduct(db, session, product.id);
    await expect(attempt).rejects.toBeInstanceOf(ProductInUseError);
    await expect(attempt).rejects.toBeInstanceOf(DomainError);
    await expect(attempt).rejects.toMatchObject({ orderCount: 1, message: expect.stringContaining("Deactivate it instead") });
    expect(await prisma.product.count({ where: { id: product.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { tenantId: fx.tenant.id } })).toBe(auditBefore);
    expect((await getProductDetail(db, product.id))?.orderCount).toBe(1);

    const deactivated = await setProductActive(db, session, product.id, false);
    expect(deactivated.isActive).toBe(false);
    // Idempotent: a second deactivate writes no audit row.
    const afterFirst = await prisma.auditLog.count({ where: { tenantId: fx.tenant.id } });
    await setProductActive(db, session, product.id, false);
    expect(await prisma.auditLog.count({ where: { tenantId: fx.tenant.id } })).toBe(afterFirst);
    const reactivated = await setProductActive(db, session, product.id, true);
    expect(reactivated.isActive).toBe(true);
    const row = await prisma.auditLog.findFirstOrThrow({ where: { entityId: product.id, action: "UPDATE" }, orderBy: { createdAt: "desc" } });
    expect(row.summary).toContain("reactivated");
  });

  it("does not let tenant A touch tenant B's product", async () => {
    const b = await createTenantFixture({ slugPrefix: "prod-life-c" });
    try {
      const foreign = await createProduct(b.db, sessionFor(b), { ...base, sku: "B-1", name: "B product", unit: "pcs" });
      expect(await getProduct(db, foreign.id)).toBeNull();
      await expect(updateProduct(db, session, foreign.id, { ...base, sku: "B-1", name: "hacked", unit: "pcs" })).rejects.toMatchObject({ code: "not_found" });
      await expect(deleteProduct(db, session, foreign.id)).rejects.toMatchObject({ code: "not_found" });
      await expect(setProductActive(db, session, foreign.id, false)).rejects.toMatchObject({ code: "not_found" });
      expect((await prisma.product.findUniqueOrThrow({ where: { id: foreign.id } })).name).toBe("B product");
    } finally {
      await deleteTenant(b.tenant.id);
    }
  });
});
