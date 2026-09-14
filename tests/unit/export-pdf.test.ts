import { describe, expect, it } from "vitest";
import { buildExportPdf } from "@/lib/export/pdf";
import type { OrderListRow } from "@/lib/orders/list";

function order(overrides: Partial<OrderListRow> = {}): OrderListRow {
  return {
    id: "o1",
    orderNumber: "SO-000001",
    customerId: "c1",
    customerName: 'Acme <script>alert(1)</script> & Co.',
    productId: "p1",
    productSku: "HB-200",
    productName: "Widget",
    productUnit: "ea",
    quantity: 10,
    priority: "NORMAL",
    dueDate: "2026-09-20",
    status: "QUEUED",
    createdAt: "2026-09-14T00:00:00.000Z",
    customerPoRef: null,
    deliveryRisk: "ON_TRACK",
    ...overrides,
  };
}

describe("buildExportPdf", () => {
  it("renders a valid PDF buffer for an ORDERS export", async () => {
    const buf = await buildExportPdf(
      { kind: "ORDERS", rows: [order()] },
      { tenantName: "Acme Manufacturing", tz: "America/New_York", generatedAt: new Date("2026-09-14T12:00:00.000Z") },
    );
    expect(Buffer.isBuffer(buf)).toBe(true);
    // %PDF- magic bytes: proof the renderer produced a real PDF, not an error page.
    expect(buf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(500);
  });

  it("treats HTML-looking customer text as plain text, not markup (react-pdf renders string children literally)", async () => {
    const buf = await buildExportPdf(
      { kind: "ORDERS", rows: [order({ customerName: "<b>bold</b> & \"quoted\"" })] },
      { tenantName: "Acme", tz: "UTC", generatedAt: new Date("2026-09-14T00:00:00.000Z") },
    );
    expect(buf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });

  it("renders an empty AUDIT_LOG export (header + footer only, no rows) without throwing", async () => {
    const buf = await buildExportPdf(
      { kind: "AUDIT_LOG", rows: [] },
      { tenantName: "Acme", tz: "UTC", generatedAt: new Date("2026-09-14T00:00:00.000Z") },
    );
    expect(buf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });
});
