/**
 * Orders list query (docs/M1_SPEC.md §5 "List URL contract", §6.1).
 *
 * URL params: `q`, `page` (1-based, 25/page), `sort`, `dir`, plus `status` (comma list; default `open`; `all`),
 * `priority`, `customerId`, `dueFrom`, `dueTo`, `batch` (import batch id). Everything is filtered, sorted and
 * paginated server-side; default sort is `dueDate asc`. Rows are mapped to plain DTOs for the table.
 */
import type { OrderPriority, OrderStatus } from "@/generated/prisma/enums";
import type { OrderOrderByWithRelationInput, OrderWhereInput } from "@/generated/prisma/models";
import type { SortDir } from "@/components/data/DataTable";
import { fromDateOnly, isIsoDate, toDateOnly } from "@/lib/dates";
import type { TenantDb } from "@/lib/db";
import { parseStatusFilter } from "@/lib/orders/kpis";
import { ORDER_PRIORITIES } from "@/lib/orders/status";

export const ORDERS_PAGE_SIZE = 25;

export const ORDER_SORT_KEYS = [
  "orderNumber",
  "customer",
  "product",
  "quantity",
  "priority",
  "dueDate",
  "status",
  "createdAt",
  "customerPoRef",
] as const;
export type OrderSortKey = (typeof ORDER_SORT_KEYS)[number];

export const DEFAULT_ORDER_SORT: OrderSortKey = "dueDate";
export const DEFAULT_ORDER_DIR: SortDir = "asc";

/** Narrows an arbitrary string (e.g. from a DataTable sort link) to a known sort key, defaulting to dueDate. */
export function toOrderSortKey(value: string): OrderSortKey {
  return (ORDER_SORT_KEYS as readonly string[]).includes(value) ? (value as OrderSortKey) : DEFAULT_ORDER_SORT;
}

export type OrderListParams = {
  q: string;
  page: number;
  sort: OrderSortKey;
  dir: SortDir;
  /** Canonical status value: "open", "all" or a comma list. */
  status: string;
  priority: OrderPriority | "";
  customerId: string;
  /** `YYYY-MM-DD` or "". */
  dueFrom: string;
  dueTo: string;
  /** ImportBatch id or "". */
  batch: string;
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

function idParam(v: string): string {
  const s = v.trim();
  return /^[A-Za-z0-9_-]{1,64}$/.test(s) ? s : "";
}

function dateParam(v: string): string {
  const s = v.trim();
  return isIsoDate(s) ? s : "";
}

export function parseOrderListParams(sp: SearchParams): OrderListParams {
  const q = first(sp.q).trim().slice(0, 120);
  const pageRaw = Number.parseInt(first(sp.page), 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const sortRaw = first(sp.sort);
  const sort = (ORDER_SORT_KEYS as readonly string[]).includes(sortRaw) ? (sortRaw as OrderSortKey) : DEFAULT_ORDER_SORT;
  const dirRaw = first(sp.dir).toLowerCase();
  const dir: SortDir = dirRaw === "desc" ? "desc" : dirRaw === "asc" ? "asc" : DEFAULT_ORDER_DIR;
  const status = parseStatusFilter(sp.status).value;
  const priorityRaw = first(sp.priority).trim().toUpperCase();
  const priority = (ORDER_PRIORITIES as readonly string[]).includes(priorityRaw) ? (priorityRaw as OrderPriority) : "";
  return {
    q,
    page,
    sort,
    dir,
    status,
    priority,
    customerId: idParam(first(sp.customerId)),
    dueFrom: dateParam(first(sp.dueFrom)),
    dueTo: dateParam(first(sp.dueTo)),
    batch: idParam(first(sp.batch)),
  };
}

/** Query string (with leading `?`, or "" when everything is default) for `/orders` links. */
export function orderListQuery(params: Partial<OrderListParams>): string {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  const status = params.status ?? "open";
  if (status !== "open") sp.set("status", status);
  if (params.priority) sp.set("priority", params.priority);
  if (params.customerId) sp.set("customerId", params.customerId);
  if (params.dueFrom) sp.set("dueFrom", params.dueFrom);
  if (params.dueTo) sp.set("dueTo", params.dueTo);
  if (params.batch) sp.set("batch", params.batch);
  const sort = params.sort ?? DEFAULT_ORDER_SORT;
  const dir = params.dir ?? DEFAULT_ORDER_DIR;
  if (sort !== DEFAULT_ORDER_SORT || dir !== DEFAULT_ORDER_DIR) {
    sp.set("sort", sort);
    sp.set("dir", dir);
  }
  if (params.page && params.page > 1) sp.set("page", String(params.page));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** Number of module filters that differ from their defaults (status counts only when ≠ open). */
export function countActiveOrderFilters(params: OrderListParams): number {
  let n = 0;
  if (params.status !== "open") n++;
  if (params.priority) n++;
  if (params.customerId) n++;
  if (params.dueFrom) n++;
  if (params.dueTo) n++;
  if (params.batch) n++;
  return n;
}

export function orderListWhere(params: OrderListParams): OrderWhereInput {
  const and: OrderWhereInput[] = [parseStatusFilter(params.status).where];
  if (params.priority) and.push({ priority: params.priority });
  if (params.customerId) and.push({ customerId: params.customerId });
  if (params.dueFrom) and.push({ dueDate: { gte: fromDateOnly(params.dueFrom) } });
  if (params.dueTo) and.push({ dueDate: { lte: fromDateOnly(params.dueTo) } });
  if (params.batch) and.push({ importBatchId: params.batch });
  if (params.q) {
    const contains = { contains: params.q, mode: "insensitive" as const };
    and.push({
      OR: [
        { orderNumber: contains },
        { customerPoRef: contains },
        { customer: { name: contains } },
        { product: { sku: contains } },
        { product: { name: contains } },
      ],
    });
  }
  return { AND: and };
}

export function orderListOrderBy(params: OrderListParams): OrderOrderByWithRelationInput[] {
  const dir = params.dir;
  const tiebreak: OrderOrderByWithRelationInput = { orderNumber: "asc" };
  switch (params.sort) {
    case "orderNumber":
      return [{ orderNumber: dir }];
    case "customer":
      return [{ customer: { name: dir } }, { dueDate: "asc" }, tiebreak];
    case "product":
      return [{ product: { sku: dir } }, { dueDate: "asc" }, tiebreak];
    case "quantity":
      return [{ quantity: dir }, tiebreak];
    case "priority":
      return [{ priority: dir }, { dueDate: "asc" }, tiebreak];
    case "status":
      return [{ status: dir }, { dueDate: "asc" }, tiebreak];
    case "createdAt":
      return [{ createdAt: dir }, tiebreak];
    case "customerPoRef":
      return [{ customerPoRef: { sort: dir, nulls: "last" } }, tiebreak];
    default:
      return [{ dueDate: dir }, { priority: "desc" }, tiebreak];
  }
}

/** Plain row DTO for the orders table (dates as ISO strings, quantity as number). */
export type OrderListRow = {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  productId: string;
  productSku: string;
  productName: string;
  productUnit: string;
  quantity: number;
  priority: OrderPriority;
  /** `YYYY-MM-DD` */
  dueDate: string;
  status: OrderStatus;
  /** ISO instant */
  createdAt: string;
  customerPoRef: string | null;
};

export const orderListSelect = {
  id: true,
  orderNumber: true,
  customerId: true,
  productId: true,
  quantity: true,
  priority: true,
  dueDate: true,
  status: true,
  createdAt: true,
  customerPoRef: true,
  customer: { select: { name: true } },
  product: { select: { sku: true, name: true, unit: true } },
} as const;

type OrderListRecord = {
  id: string;
  orderNumber: string;
  customerId: string;
  productId: string;
  quantity: { toString(): string };
  priority: OrderPriority;
  dueDate: Date;
  status: OrderStatus;
  createdAt: Date;
  customerPoRef: string | null;
  customer: { name: string };
  product: { sku: string; name: string; unit: string };
};

export function toOrderListRow(o: OrderListRecord): OrderListRow {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    customerId: o.customerId,
    customerName: o.customer.name,
    productId: o.productId,
    productSku: o.product.sku,
    productName: o.product.name,
    productUnit: o.product.unit,
    quantity: Number(String(o.quantity)),
    priority: o.priority,
    dueDate: toDateOnly(o.dueDate),
    status: o.status,
    createdAt: o.createdAt.toISOString(),
    customerPoRef: o.customerPoRef,
  };
}

export async function listOrders(
  db: TenantDb,
  params: OrderListParams,
  extraWhere: OrderWhereInput = {},
): Promise<{ rows: OrderListRow[]; total: number }> {
  const where: OrderWhereInput = { AND: [orderListWhere(params), extraWhere] };
  const [total, rows] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({
      where,
      orderBy: orderListOrderBy(params),
      skip: (params.page - 1) * ORDERS_PAGE_SIZE,
      take: ORDERS_PAGE_SIZE,
      select: orderListSelect,
    }),
  ]);
  return { total, rows: rows.map(toOrderListRow) };
}
