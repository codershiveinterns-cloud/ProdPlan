/**
 * Per-kind data fetch for exports (docs/M3_SPEC.md §8). Every fetcher REUSES the owning module's existing
 * filter/order helpers — `src/lib/orders/list.ts`, `src/lib/audit-log-list.ts`, `src/lib/scheduling/queries.ts` —
 * rather than re-deriving filter logic, and enforces `EXPORT_MAX_ROWS` by counting before paging in (or, for the
 * two window-bounded kinds that have no separate count query, by rejecting after the fetch instead of truncating).
 */
import type { TenantDb } from "@/lib/db";
import { isIsoDate } from "@/lib/dates";
import {
  auditLogListOrderBy,
  auditLogListSelect,
  auditLogListWhere,
  parseAuditLogListParams,
  toAuditLogListRow,
  type AuditLogListRow,
} from "@/lib/audit-log-list";
import {
  orderListOrderBy,
  orderListSelect,
  orderListWhere,
  parseOrderListParams,
  toOrderListRow,
  type OrderListRow,
} from "@/lib/orders/list";
import { floorOperations, loadBoardWindow, type FloorOperationsInput } from "@/lib/scheduling/queries";
import { boardWindowSchema } from "@/lib/validation/scheduling";

import { EXPORT_MAX_ROWS, ExportTooLargeError, type ExportKind } from "./types";

export type ScheduleExportRow = {
  workCenterCode: string;
  workCenterName: string;
  machineCode: string;
  machineName: string;
  orderNumber: string;
  productSku: string;
  productName: string;
  sequence: number;
  plannedStartAt: string;
  plannedEndAt: string;
  status: string;
  locked: boolean;
  conflictSeverity: string | null;
};

export type ProductionStatusExportRow = {
  machineCode: string;
  machineName: string;
  orderNumber: string;
  productSku: string;
  productName: string;
  quantity: number;
  sequence: number;
  plannedStartAt: string;
  plannedEndAt: string;
  status: string;
  overdue: boolean;
};

export type ExportData =
  | { kind: "ORDERS"; rows: OrderListRow[] }
  | { kind: "SCHEDULE"; rows: ScheduleExportRow[] }
  | { kind: "PRODUCTION_STATUS"; rows: ProductionStatusExportRow[] }
  | { kind: "AUDIT_LOG"; rows: AuditLogListRow[] };

type SearchParams = Record<string, string | string[] | undefined>;

function toSearchParamsRecord(sp: URLSearchParams): SearchParams {
  const out: SearchParams = {};
  for (const key of sp.keys()) {
    const values = sp.getAll(key);
    out[key] = values.length > 1 ? values : values[0];
  }
  return out;
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
function idParam(v: string | null): string {
  const s = (v ?? "").trim();
  return ID_RE.test(s) ? s : "";
}

async function fetchOrders(db: TenantDb, sp: SearchParams): Promise<OrderListRow[]> {
  const params = parseOrderListParams(sp);
  const where = orderListWhere(params);
  const orderBy = orderListOrderBy(params);
  const total = await db.order.count({ where });
  if (total > EXPORT_MAX_ROWS) throw new ExportTooLargeError(total);
  const rows = await db.order.findMany({ where, orderBy, take: EXPORT_MAX_ROWS, select: orderListSelect });
  return rows.map(toOrderListRow);
}

async function fetchAuditLog(db: TenantDb, sp: SearchParams, tz: string): Promise<AuditLogListRow[]> {
  const params = parseAuditLogListParams(sp);
  const where = auditLogListWhere(params, tz);
  const orderBy = auditLogListOrderBy();
  const total = await db.auditLog.count({ where });
  if (total > EXPORT_MAX_ROWS) throw new ExportTooLargeError(total);
  const rows = await db.auditLog.findMany({ where, orderBy, take: EXPORT_MAX_ROWS, select: auditLogListSelect });
  return rows.map(toAuditLogListRow);
}

async function fetchSchedule(db: TenantDb, sp: URLSearchParams, tz: string, todayIso: string): Promise<ScheduleExportRow[]> {
  const fromRaw = sp.get("from");
  const from = fromRaw && isIsoDate(fromRaw) ? fromRaw : todayIso;
  const parsed = boardWindowSchema.parse({ from, days: sp.get("days") ?? undefined, workCenterId: sp.get("workCenterId") ?? undefined });
  const board = await loadBoardWindow(db, { from: parsed.from, days: parsed.days, workCenterId: parsed.workCenterId, tz });

  const rows: ScheduleExportRow[] = [];
  for (const wc of board.workCenters) {
    for (const m of wc.machines) {
      for (const e of m.entries) {
        rows.push({
          workCenterCode: wc.code,
          workCenterName: wc.name,
          machineCode: m.code,
          machineName: m.name,
          orderNumber: e.orderNumber,
          productSku: e.productSku,
          productName: e.productName,
          sequence: e.sequence,
          plannedStartAt: e.plannedStartAt,
          plannedEndAt: e.plannedEndAt,
          status: e.status,
          locked: e.locked,
          conflictSeverity: e.conflictSeverity,
        });
      }
    }
  }
  if (rows.length > EXPORT_MAX_ROWS) throw new ExportTooLargeError(rows.length);
  return rows;
}

async function fetchProductionStatus(db: TenantDb, sp: URLSearchParams, tz: string, todayIso: string): Promise<ProductionStatusExportRow[]> {
  const input: FloorOperationsInput = {
    date: todayIso,
    tz,
    ...(idParam(sp.get("workCenterId")) ? { workCenterId: idParam(sp.get("workCenterId")) } : {}),
    ...(idParam(sp.get("machineId")) ? { machineId: idParam(sp.get("machineId")) } : {}),
  };
  const machines = await floorOperations(db, input);

  const rows: ProductionStatusExportRow[] = [];
  for (const m of machines) {
    for (const op of m.operations) {
      rows.push({
        machineCode: m.code,
        machineName: m.name,
        orderNumber: op.orderNumber,
        productSku: op.productSku,
        productName: op.productName,
        quantity: op.quantity,
        sequence: op.sequence,
        plannedStartAt: op.plannedStartAt,
        plannedEndAt: op.plannedEndAt,
        status: op.status,
        overdue: op.overdue,
      });
    }
  }
  if (rows.length > EXPORT_MAX_ROWS) throw new ExportTooLargeError(rows.length);
  return rows;
}

/** Fetches the rows for one export request, applying the same filters the source page's list query uses. */
export async function fetchExportData(
  kind: ExportKind,
  db: TenantDb,
  tz: string,
  todayIso: string,
  searchParams: URLSearchParams,
): Promise<ExportData> {
  switch (kind) {
    case "ORDERS":
      return { kind, rows: await fetchOrders(db, toSearchParamsRecord(searchParams)) };
    case "AUDIT_LOG":
      return { kind, rows: await fetchAuditLog(db, toSearchParamsRecord(searchParams), tz) };
    case "SCHEDULE":
      return { kind, rows: await fetchSchedule(db, searchParams, tz, todayIso) };
    case "PRODUCTION_STATUS":
      return { kind, rows: await fetchProductionStatus(db, searchParams, tz, todayIso) };
    default: {
      const _exhaustive: never = kind;
      throw new Error(`Unknown export kind: ${String(_exhaustive)}`);
    }
  }
}
