import { describe, expect, it } from "vitest";
import { BOM } from "@/lib/csv";
import { auditLogCsv, ordersCsv, productionStatusCsv, scheduleCsv } from "@/lib/export/csv";
import { EXPORT_MAX_ROWS, ExportTooLargeError, isExportFormat, isExportKind } from "@/lib/export/types";
import type { OrderListRow } from "@/lib/orders/list";
import type { AuditLogListRow } from "@/lib/audit-log-list";
import type { ScheduleExportRow, ProductionStatusExportRow } from "@/lib/export/query";

const TZ = "America/New_York";

function baseOrder(overrides: Partial<OrderListRow> = {}): OrderListRow {
  return {
    id: "o1",
    orderNumber: "SO-000001",
    customerId: "c1",
    customerName: "Acme, Inc.",
    productId: "p1",
    productSku: 'HB-200"Pro"',
    productName: "Widget",
    productUnit: "ea",
    quantity: 10,
    priority: "NORMAL",
    dueDate: "2026-09-20",
    status: "QUEUED",
    createdAt: "2026-09-14T00:00:00.000Z",
    customerPoRef: "=SUM(A1:A2)",
    deliveryRisk: "ON_TRACK",
    ...overrides,
  };
}

describe("ordersCsv", () => {
  it("quotes commas/quotes/newlines and guards a formula-looking PO ref (OWASP CSV injection list)", () => {
    const csv = ordersCsv([baseOrder({ customerName: 'Acme, "Inc."\nSecond line' })]);
    expect(csv.startsWith(BOM)).toBe(true);
    // The customer name (comma + quotes + newline, all three at once) round-trips through RFC 4180 quoting.
    expect(csv).toContain('"Acme, ""Inc.""\nSecond line"');
    // A PO ref starting with "=" is prefixed with an apostrophe so Excel/Sheets never evaluate it as a formula.
    expect(csv).toContain("'=SUM(A1:A2)");
    expect(csv).not.toMatch(/[^']=SUM\(A1:A2\)/);
  });

  it("writes one data row per order with the expected header set", () => {
    const csv = ordersCsv([baseOrder(), baseOrder({ id: "o2", orderNumber: "SO-000002" })]);
    const lines = csv.slice(1).split("\r\n").filter(Boolean);
    expect(lines[0]).toBe("Order #,Customer,PO Ref,Product SKU,Product Name,Qty,Unit,Priority,Due Date,Status,Delivery Risk,Created At");
    expect(lines).toHaveLength(3);
  });
});

describe("scheduleCsv", () => {
  it("formats planned times in the tenant timezone", () => {
    const row: ScheduleExportRow = {
      workCenterCode: "WC1",
      workCenterName: "Cutting",
      machineCode: "M1",
      machineName: "Laser 1",
      orderNumber: "SO-000001",
      productSku: "HB-200",
      productName: "Widget",
      sequence: 1,
      plannedStartAt: "2026-09-14T13:00:00.000Z",
      plannedEndAt: "2026-09-14T15:00:00.000Z",
      status: "QUEUED",
      locked: false,
      conflictSeverity: null,
    };
    const csv = scheduleCsv([row], TZ);
    expect(csv).toContain("WC1 · Cutting");
    expect(csv).toContain("M1 · Laser 1");
  });
});

describe("productionStatusCsv", () => {
  it("renders the overdue flag as a plain boolean cell", () => {
    const row: ProductionStatusExportRow = {
      machineCode: "M1",
      machineName: "Laser 1",
      orderNumber: "SO-000001",
      productSku: "HB-200",
      productName: "Widget",
      quantity: 5,
      sequence: 1,
      plannedStartAt: "2026-09-14T00:00:00.000Z",
      plannedEndAt: "2026-09-14T01:00:00.000Z",
      status: "QUEUED",
      overdue: true,
    };
    const csv = productionStatusCsv([row], TZ);
    expect(csv).toContain("true");
  });
});

describe("auditLogCsv", () => {
  it("joins changedFields and falls back actor name -> email -> System", () => {
    const row: AuditLogListRow = {
      id: "a1",
      createdAt: "2026-09-14T00:00:00.000Z",
      actorUserId: null,
      actorEmail: null,
      actorName: null,
      entityType: "Order",
      entityId: "o1",
      entityLabel: "SO-000001",
      action: "UPDATE",
      summary: "updated order SO-000001",
      changedFields: ["status", "priority"],
      before: {},
      after: {},
    };
    const csv = auditLogCsv([row], TZ);
    expect(csv).toContain("System");
    expect(csv).toContain("status; priority");
  });
});

describe("EXPORT_MAX_ROWS", () => {
  it("is 5000 and ExportTooLargeError carries a clear, human-readable message", () => {
    expect(EXPORT_MAX_ROWS).toBe(5000);
    const err = new ExportTooLargeError(6001);
    expect(err.message).toMatch(/5,000/);
    expect(err.message).toMatch(/Narrow your filters/);
    expect(err.total).toBe(6001);
  });
});

describe("isExportKind / isExportFormat", () => {
  it("accepts only the four kinds / two formats", () => {
    expect(isExportKind("ORDERS")).toBe(true);
    expect(isExportKind("SCHEDULE")).toBe(true);
    expect(isExportKind("PRODUCTION_STATUS")).toBe(true);
    expect(isExportKind("AUDIT_LOG")).toBe(true);
    expect(isExportKind("NOT_A_KIND")).toBe(false);
    expect(isExportFormat("CSV")).toBe(true);
    expect(isExportFormat("PDF")).toBe(true);
    expect(isExportFormat("XLSX")).toBe(false);
  });
});
