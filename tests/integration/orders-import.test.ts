/**
 * Integration: CSV import (docs/M1_SPEC.md §6.1) — a 50-row file with valid, error and warning rows plus new
 * customers (preview → commit → counts, orders, customers, audit rows), guard rails (limits, ownership, re-commit,
 * discard) and a 2,000-row file committed in under 5 seconds.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { commitImport, discardImport, loadImportBatch, previewImport, type ImportFile } from "@/lib/orders/import";
import { createTenantFixture, dbAvailable, deleteTenant, disconnectDb, type TenantFixture } from "./helpers";

const available = await dbAvailable();

function sessionFor(f: TenantFixture, userId = f.admin.id): Session {
  return {
    user: {
      id: userId,
      tenantId: f.tenant.id,
      email: f.admin.email,
      name: f.admin.name,
      role: "ADMIN",
      isActive: true,
      mustChangePassword: false,
      lastLoginAt: null,
      createdAt: f.admin.createdAt,
      updatedAt: f.admin.updatedAt,
    },
    tenant: { id: f.tenant.id, name: f.tenant.name, slug: f.tenant.slug, timezone: f.tenant.timezone, defaultCalendarId: f.tenant.defaultCalendarId },
  };
}

function csvFile(name: string, text: string): ImportFile {
  return { name, size: Buffer.byteLength(text, "utf8"), text: async () => text };
}

const HEADER = "order_number,customer,product_sku,quantity,priority,due_date,earliest_start_date,customer_po_ref,notes";

describe.skipIf(!available)("orders CSV import (integration)", () => {
  let f: TenantFixture;
  let session: Session;

  beforeAll(async () => {
    f = await createTenantFixture({ slugPrefix: "ord-import" });
    session = sessionFor(f);
    await prisma.product.createMany({
      data: [
        { tenantId: f.tenant.id, sku: "HB-200", name: "Hydraulic Bracket", unit: "pcs" },
        { tenantId: f.tenant.id, sku: "GX-40", name: "Gearbox Housing", unit: "pcs" },
        { tenantId: f.tenant.id, sku: "OLD-1", name: "Retired", unit: "pcs", isActive: false },
      ],
    });
    await prisma.customer.create({ data: { tenantId: f.tenant.id, name: "Bharat Motors" } });
    await prisma.order.create({
      data: {
        tenantId: f.tenant.id,
        orderNumber: "EXISTING-1",
        customerId: (await prisma.customer.findFirstOrThrow({ where: { tenantId: f.tenant.id } })).id,
        productId: (await prisma.product.findFirstOrThrow({ where: { tenantId: f.tenant.id, sku: "HB-200" } })).id,
        quantity: 1,
        dueDate: new Date("2030-01-01T00:00:00.000Z"),
        createdById: f.admin.id,
      },
    });
  });

  afterAll(async () => {
    await deleteTenant(f?.tenant.id);
    await disconnectDb();
  });

  it("previews and commits a 50-row file with valid, error and warning rows and new customers", async () => {
    const rows: string[] = [];
    // 40 valid rows: customers alternate between the existing one (with different casing) and two new ones.
    for (let i = 1; i <= 40; i++) {
      const customer = i % 4 === 0 ? "bharat motors" : i % 4 === 1 ? "Bharat Motors" : i % 2 === 0 ? "Mahindra Tractors" : "MAHINDRA tractors";
      const sku = i % 2 === 0 ? "hb-200" : "GX-40";
      const number = i % 5 === 0 ? `IMP-${i}` : "";
      const priority = ["", "low", "High", "URGENT"][i % 4];
      rows.push(`${number},${customer},${sku},${(i * 1.5).toFixed(1)},${priority},2030-06-${String((i % 28) + 1).padStart(2, "0")},,PO-${i},`);
    }
    // 5 warning rows (past due date, still valid).
    for (let i = 41; i <= 45; i++) rows.push(`,Bharat Motors,HB-200,${i},,2020-01-0${i - 40},,,"past due, imports as overdue"`);
    // 5 error rows.
    rows.push(",Bharat Motors,NOPE-1,1,,2030-01-01,,,");            // unknown sku
    rows.push(",Bharat Motors,OLD-1,1,,2030-01-01,,,");             // inactive sku
    rows.push("EXISTING-1,Bharat Motors,HB-200,1,,2030-01-01,,,"); // number already exists
    rows.push("IMP-5,Bharat Motors,HB-200,1,,2030-01-01,,,");      // duplicate of a number used above
    rows.push(",Bharat Motors,HB-200,1,,2030-01-01,2030-02-01,,"); // start after due
    expect(rows).toHaveLength(50);
    const text = `﻿${HEADER}\r\n${rows.join("\r\n")}\r\n`;

    const preview = await previewImport(f.db, session, csvFile("orders.csv", text));
    expect(preview.summary).toEqual({ total: 50, valid: 44, withErrors: 6, withWarnings: 5, newCustomers: 1 });

    const batch = await loadImportBatch(f.db, session, preview.batchId);
    expect(batch).not.toBeNull();
    expect(batch!.status).toBe("PENDING");
    expect(batch!.rowCount).toBe(50);
    expect(batch!.validCount).toBe(44);
    expect(batch!.errorCount).toBe(6);
    expect(batch!.parsedRows).toHaveLength(50);
    const byRow = new Map(batch!.parsedRows.map((r) => [r.rowNumber, r]));
    expect(byRow.get(46)!.errors).toEqual(['product_sku "NOPE-1" does not match an active product']);
    expect(byRow.get(48)!.errors).toEqual(["order_number EXISTING-1 already exists"]);
    expect(byRow.get(5)!.errors).toEqual(["order_number IMP-5 is used by another row in this file"]);
    expect(byRow.get(49)!.errors).toEqual(["order_number IMP-5 is used by another row in this file"]);
    expect(byRow.get(50)!.errors).toEqual(["earliest_start_date must be on or before due_date"]);
    expect(byRow.get(47)!.errors).toEqual(['product_sku "OLD-1" does not match an active product']);
    expect(byRow.get(41)!.warnings).toEqual(["Due date is in the past — the order will be imported as overdue"]);
    expect(byRow.get(41)!.ok).toBe(true);
    expect(byRow.get(2)!.values?.isNewCustomer).toBe(true);
    expect(byRow.get(1)!.values?.isNewCustomer).toBe(false);
    expect(byRow.get(1)!.values?.priority).toBe("LOW");
    // The file itself is never stored anywhere else: the client only ever posts the batch id.
    expect(await prisma.importBatch.count({ where: { tenantId: f.tenant.id } })).toBe(1);

    const otherUser = sessionFor(f, "someone-else");
    await expect(commitImport(f.db, otherUser, preview.batchId)).rejects.toBeInstanceOf(DomainError);

    const seqBefore = (await prisma.tenant.findUniqueOrThrow({ where: { id: f.tenant.id } })).orderSeq;
    const result = await commitImport(f.db, session, preview.batchId);
    expect(result).toMatchObject({ batchId: preview.batchId, importedCount: 44, skippedCount: 0, errorCount: 6, newCustomers: ["Mahindra Tractors"] });
    expect(result.orderNumbers).toHaveLength(44);
    expect(result.orderNumbers.filter((n) => n.startsWith("IMP-"))).toEqual(["IMP-10", "IMP-15", "IMP-20", "IMP-25", "IMP-30", "IMP-35", "IMP-40"]);
    const autoNumbers = result.orderNumbers.filter((n) => n.startsWith("SO-"));
    expect(autoNumbers).toHaveLength(37);
    expect(autoNumbers[0]).toBe(`SO-${String(seqBefore + 1).padStart(6, "0")}`);
    const seqAfter = (await prisma.tenant.findUniqueOrThrow({ where: { id: f.tenant.id } })).orderSeq;
    expect(seqAfter).toBe(seqBefore + 37);

    const orders = await prisma.order.findMany({ where: { tenantId: f.tenant.id, importBatchId: preview.batchId }, include: { customer: true } });
    expect(orders).toHaveLength(44);
    expect(new Set(orders.map((o) => o.customer.name))).toEqual(new Set(["Bharat Motors", "Mahindra Tractors"]));
    expect(orders.every((o) => o.status === "QUEUED" && o.createdById === f.admin.id)).toBe(true);
    const overdue = orders.filter((o) => o.dueDate < new Date("2021-01-01"));
    expect(overdue).toHaveLength(5);
    expect(overdue[0]!.notes).toBe("past due, imports as overdue");
    // Only ONE new customer, with the casing of its first occurrence in the file.
    expect(await prisma.customer.count({ where: { tenantId: f.tenant.id } })).toBe(2);

    const created = await prisma.auditLog.findMany({ where: { tenantId: f.tenant.id, entityType: "Order", action: "CREATE", entityId: { in: orders.map((o) => o.id) } } });
    expect(created).toHaveLength(44);
    expect(created.every((a) => a.actorUserId === f.admin.id && a.summary.endsWith("created via CSV import"))).toBe(true);
    const importRow = await prisma.auditLog.findFirstOrThrow({ where: { tenantId: f.tenant.id, entityType: "ImportBatch", entityId: preview.batchId, action: "IMPORT" } });
    expect(importRow.after).toMatchObject({ importedCount: 44, errorCount: 6, newCustomers: ["Mahindra Tractors"] });
    expect((importRow.after as { orderNumbers: string[] }).orderNumbers).toHaveLength(44);

    const committed = await loadImportBatch(f.db, session, preview.batchId);
    expect(committed!.status).toBe("COMMITTED");
    expect(committed!.importedCount).toBe(44);
    expect(committed!.parsedRows.filter((r) => r.orderNumber).length).toBe(44);
    expect(committed!.parsedRows.find((r) => r.rowNumber === 10)!.orderNumber).toBe("IMP-10");
    expect(committed!.parsedRows.find((r) => r.rowNumber === 1)!.orderNumber).toBe(autoNumbers[0]);

    // A second commit is refused; discarding a committed batch is a no-op.
    await expect(commitImport(f.db, session, preview.batchId)).rejects.toBeInstanceOf(DomainError);
    await discardImport(f.db, session, preview.batchId);
    expect((await prisma.importBatch.findUniqueOrThrow({ where: { id: preview.batchId } })).status).toBe("COMMITTED");
  });

  it("re-validates at commit time: rows that became invalid are skipped and counted", async () => {
    const text = `${HEADER}\nLATE-1,Bharat Motors,GX-40,3,,2030-05-01,,,\n,Bharat Motors,GX-40,4,,2030-05-02,,,\n`;
    const preview = await previewImport(f.db, session, csvFile("late.csv", text));
    expect(preview.summary.valid).toBe(2);
    // Someone creates LATE-1 by hand between preview and commit.
    const customer = await prisma.customer.findFirstOrThrow({ where: { tenantId: f.tenant.id, name: "Bharat Motors" } });
    const product = await prisma.product.findFirstOrThrow({ where: { tenantId: f.tenant.id, sku: "GX-40" } });
    await prisma.order.create({
      data: { tenantId: f.tenant.id, orderNumber: "LATE-1", customerId: customer.id, productId: product.id, quantity: 1, dueDate: new Date("2030-05-01T00:00:00.000Z"), createdById: f.admin.id },
    });
    const result = await commitImport(f.db, session, preview.batchId);
    expect(result).toMatchObject({ importedCount: 1, skippedCount: 1, errorCount: 1 });
    const batch = await loadImportBatch(f.db, session, preview.batchId);
    expect(batch!.parsedRows[0]!.ok).toBe(false);
    expect(batch!.parsedRows[0]!.errors).toEqual(["order_number LATE-1 already exists"]);
  });

  it("discard marks a pending batch DISCARDED and blocks commit", async () => {
    const text = `${HEADER}\n,Bharat Motors,GX-40,3,,2030-05-01,,,\n`;
    const preview = await previewImport(f.db, session, csvFile("discard.csv", text));
    await discardImport(f.db, session, preview.batchId);
    expect((await loadImportBatch(f.db, session, preview.batchId))!.status).toBe("DISCARDED");
    await expect(commitImport(f.db, session, preview.batchId)).rejects.toBeInstanceOf(DomainError);
    await expect(discardImport(f.db, session, "does-not-exist")).rejects.toMatchObject({ code: "not_found" });
  });

  it("rejects the whole file on limits and header problems", async () => {
    await expect(previewImport(f.db, session, csvFile("orders.txt", "x"))).rejects.toThrow(/\.csv/);
    await expect(previewImport(f.db, session, { name: "big.csv", size: 1_048_577, text: async () => "" })).rejects.toThrow(/1 MB/);
    await expect(previewImport(f.db, session, csvFile("empty.csv", ""))).rejects.toThrow(/empty/);
    await expect(previewImport(f.db, session, csvFile("noheader.csv", "customer,quantity\nA,1\n"))).rejects.toThrow(/Missing required columns: product_sku, due_date/);
    await expect(previewImport(f.db, session, csvFile("headeronly.csv", `${HEADER}\n`))).rejects.toThrow(/no data rows/);
    const tooMany = `${HEADER}\n${Array.from({ length: 2001 }, () => ",Bharat Motors,GX-40,1,,2030-01-01,,,").join("\n")}\n`;
    await expect(previewImport(f.db, session, csvFile("toomany.csv", tooMany))).rejects.toThrow(/limit is 2,000/);
  });

  it("imports a 2,000-row file in under 5 seconds", async () => {
    const rows: string[] = [];
    for (let i = 1; i <= 2000; i++) {
      const number = i % 4 === 0 ? `BULK-${i}` : "";
      const customer = `Bulk Customer ${i % 40}`;
      const sku = i % 2 === 0 ? "HB-200" : "GX-40";
      const due = `2030-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`;
      rows.push(`${number},${customer},${sku},${i % 7 === 0 ? "12.345" : String((i % 90) + 1)},${["", "LOW", "HIGH", "URGENT"][i % 4]},${due},,PO-${i},note ${i}`);
    }
    const text = `${HEADER}\n${rows.join("\n")}\n`;
    const t0 = performance.now();
    const preview = await previewImport(f.db, session, csvFile("bulk.csv", text));
    const t1 = performance.now();
    expect(preview.summary).toEqual({ total: 2000, valid: 2000, withErrors: 0, withWarnings: 0, newCustomers: 40 });

    const seqBefore = (await prisma.tenant.findUniqueOrThrow({ where: { id: f.tenant.id } })).orderSeq;
    const t2 = performance.now();
    const result = await commitImport(f.db, session, preview.batchId);
    const commitMs = performance.now() - t2;
    console.info(`[orders-import] preview 2000 rows: ${Math.round(t1 - t0)} ms, commit: ${Math.round(commitMs)} ms`);
    expect(commitMs).toBeLessThan(5000);

    expect(result.importedCount).toBe(2000);
    expect(result.skippedCount).toBe(0);
    expect(result.newCustomers).toHaveLength(40);
    expect(result.orderNumbers).toHaveLength(2000);
    expect(new Set(result.orderNumbers).size).toBe(2000);
    expect(await prisma.order.count({ where: { tenantId: f.tenant.id, importBatchId: preview.batchId } })).toBe(2000);
    expect(await prisma.customer.count({ where: { tenantId: f.tenant.id, name: { startsWith: "Bulk Customer" } } })).toBe(40);
    const seqAfter = (await prisma.tenant.findUniqueOrThrow({ where: { id: f.tenant.id } })).orderSeq;
    expect(seqAfter).toBe(seqBefore + 1500);
    expect(await prisma.auditLog.count({ where: { tenantId: f.tenant.id, action: "CREATE", entityType: "Order", summary: { endsWith: "via CSV import" }, entityLabel: { startsWith: "BULK-" } } })).toBe(500);
    expect(await prisma.auditLog.count({ where: { tenantId: f.tenant.id, entityType: "ImportBatch", entityId: preview.batchId, action: "IMPORT" } })).toBe(1);
    const batch = await loadImportBatch(f.db, session, preview.batchId);
    expect(batch!.status).toBe("COMMITTED");
    expect(batch!.importedCount).toBe(2000);
  }, 60_000);
});
