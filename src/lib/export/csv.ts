/**
 * CSV report builders (docs/M3_SPEC.md §8). Thin wrappers over `src/lib/csv.ts`'s `toCsv()` — same BOM, CRLF,
 * RFC 4180 quoting and formula-injection guard as the orders-import template, so a customer name or order note
 * starting with `=`/`+`/`-`/`@` can never turn into a spreadsheet formula. No new escaping logic here.
 */
import { toCsv } from "@/lib/csv";
import { formatDateTime } from "@/lib/format";

import type { ExportData, ProductionStatusExportRow, ScheduleExportRow } from "./query";
import type { OrderListRow } from "@/lib/orders/list";
import type { AuditLogListRow } from "@/lib/audit-log-list";

export function ordersCsv(rows: readonly OrderListRow[]): string {
  const headers = ["Order #", "Customer", "PO Ref", "Product SKU", "Product Name", "Qty", "Unit", "Priority", "Due Date", "Status", "Delivery Risk", "Created At"];
  return toCsv(
    headers,
    rows.map((r) => [
      r.orderNumber,
      r.customerName,
      r.customerPoRef ?? "",
      r.productSku,
      r.productName,
      r.quantity,
      r.productUnit,
      r.priority,
      r.dueDate,
      r.status,
      r.deliveryRisk,
      r.createdAt,
    ]),
  );
}

export function scheduleCsv(rows: readonly ScheduleExportRow[], tz: string): string {
  const headers = ["Work Center", "Machine", "Order #", "Product SKU", "Product Name", "Sequence", "Planned Start", "Planned End", "Status", "Locked", "Conflict"];
  return toCsv(
    headers,
    rows.map((r) => [
      `${r.workCenterCode} · ${r.workCenterName}`,
      `${r.machineCode} · ${r.machineName}`,
      r.orderNumber,
      r.productSku,
      r.productName,
      r.sequence,
      formatDateTime(r.plannedStartAt, tz),
      formatDateTime(r.plannedEndAt, tz),
      r.status,
      r.locked,
      r.conflictSeverity ?? "",
    ]),
  );
}

export function productionStatusCsv(rows: readonly ProductionStatusExportRow[], tz: string): string {
  const headers = ["Machine", "Order #", "Product SKU", "Product Name", "Qty", "Sequence", "Planned Start", "Planned End", "Status", "Overdue"];
  return toCsv(
    headers,
    rows.map((r) => [
      `${r.machineCode} · ${r.machineName}`,
      r.orderNumber,
      r.productSku,
      r.productName,
      r.quantity,
      r.sequence,
      formatDateTime(r.plannedStartAt, tz),
      formatDateTime(r.plannedEndAt, tz),
      r.status,
      r.overdue,
    ]),
  );
}

export function auditLogCsv(rows: readonly AuditLogListRow[], tz: string): string {
  const headers = ["When", "Actor", "Action", "Entity Type", "Entity", "Summary", "Changed Fields"];
  return toCsv(
    headers,
    rows.map((r) => [
      formatDateTime(r.createdAt, tz),
      r.actorName ?? r.actorEmail ?? "System",
      r.action,
      r.entityType,
      r.entityLabel ?? r.entityId,
      r.summary,
      r.changedFields.join("; "),
    ]),
  );
}

/** Dispatches on `data.kind` to the matching builder above. */
export function buildExportCsv(data: ExportData, tz: string): string {
  switch (data.kind) {
    case "ORDERS":
      return ordersCsv(data.rows);
    case "SCHEDULE":
      return scheduleCsv(data.rows, tz);
    case "PRODUCTION_STATUS":
      return productionStatusCsv(data.rows, tz);
    case "AUDIT_LOG":
      return auditLogCsv(data.rows, tz);
  }
}
