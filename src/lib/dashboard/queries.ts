/**
 * Dashboard data (docs/M1_SPEC.md §6.6) — everything the page needs in one server render.
 *
 * KPI definitions come from `src/lib/orders/kpis.ts` (shared with the orders list). Counts are aggregate queries
 * (`count` / `groupBy`), the three lists are single `findMany` calls with `include`, and there is no per-row
 * follow-up query. The first-run checklist counts are fetched only when the plant has no orders yet.
 */
import type { DeliveryRisk, DowntimeType, MachineStatus, OperationStatus, OrderPriority, OrderStatus } from "@/generated/prisma/enums";
import type { TenantDb } from "@/lib/db";
import { addDays, toDateOnly } from "@/lib/dates";
import {
  KPI_LIST_HREFS,
  OPEN_STATUSES,
  whereActiveDowntime,
  whereBelowReorder,
  whereDueWithin,
  whereInProgress,
  whereOpen,
  whereOverdue,
} from "@/lib/orders/kpis";
import { toPlain, type Plain } from "@/lib/serialize";

/** Delivery risks that put an order on the "Delivery risk" tile (docs/M2_SPEC.md §6). */
export const AT_RISK_DELIVERY_RISKS = ["AT_RISK", "DELAYED", "LATE"] as const satisfies readonly DeliveryRisk[];

/** Rows shown on the "Today on the floor" mini-list. */
export const TODAY_FLOOR_LIMIT = 8;

export const DASHBOARD_LIST_LIMIT = 10;

export type DashboardKpis = {
  orders: { open: number; overdue: number; dueSoon: number; inProgress: number };
  machines: { total: number; active: number; maintenance: number; inactive: number; downNow: number };
  materialsBelowReorder: number;
  /** Open orders with deliveryRisk in AT_RISK / DELAYED / LATE. */
  deliveryRisk: number;
  /** Open (unresolved) schedule conflicts, CRITICAL or WARNING. */
  scheduleConflicts: number;
};

export type DashboardTotals = {
  orders: number;
  products: number;
  workCenters: number;
  calendars: number;
  machines: number;
  materials: number;
};

export type DashboardOrderRow = {
  id: string;
  orderNumber: string;
  customerName: string;
  productSku: string;
  productName: string;
  unit: string;
  quantity: number;
  priority: OrderPriority;
  status: OrderStatus;
  /** `YYYY-MM-DD` */
  dueDate: string;
  deliveryRisk: DeliveryRisk;
};

export type TodayFloorRow = {
  id: string;
  orderId: string;
  orderNumber: string;
  productSku: string;
  machineCode: string;
  sequence: number;
  status: OperationStatus;
  plannedStartAt: Date;
};

export type DashboardMachineRow = {
  id: string;
  code: string;
  name: string;
  workCenterCode: string;
  workCenterName: string;
  status: MachineStatus;
  /** The window covering `now` with the latest end, if any. */
  activeDowntime: { type: DowntimeType; endsAt: Date; reason: string | null } | null;
};

export type DashboardAuditRow = Plain<{
  id: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "STATUS_CHANGE" | "IMPORT" | "LOGIN";
  entityType: string;
  entityId: string;
  entityLabel: string | null;
  actorName: string | null;
  actorEmail: string | null;
  changedFields: string[];
  summary: string;
  createdAt: Date;
}>;

export type DashboardData = {
  today: string;
  kpis: DashboardKpis;
  totals: DashboardTotals;
  /** Tile links, identically filtered lists (spec §5 URL contract). */
  hrefs: {
    open: string;
    overdue: string;
    dueSoon: string;
    inProgress: string;
    machines: string;
    materialsBelowReorder: string;
    deliveryRisk: string;
    scheduleConflicts: string;
    floor: string;
  };
  ordersByDue: DashboardOrderRow[];
  machines: DashboardMachineRow[];
  activity: DashboardAuditRow[];
  /** Today's scheduled operations, machine order then start time (docs/M2_SPEC.md §6 "Today on the floor"). */
  todayFloor: TodayFloorRow[];
  /** `Tenant.lastScheduleRunAt !== null` — drives setup checklist step 7. */
  scheduleHasRun: boolean;
};

export type LoadDashboardOptions = {
  /** `todayInTz(tenant.timezone)` — the ONLY source of "today". */
  today: string;
  /** The instant used for "active downtime"; defaults to the wall clock. */
  now?: Date;
  /** `can(role, "audit:read-all")` — without it User/Tenant rows are hidden from the activity feed. */
  includeSensitiveAudit: boolean;
};

/** Audit rows hidden from roles without `audit:read-all` (spec §4 "Audit contract"). */
export const SENSITIVE_AUDIT_ENTITY_TYPES = ["User", "Tenant"] as const;

const ORDERS_BY_DUE_SELECT = {
  id: true,
  orderNumber: true,
  quantity: true,
  priority: true,
  status: true,
  dueDate: true,
  deliveryRisk: true,
  customer: { select: { name: true } },
  product: { select: { sku: true, name: true, unit: true } },
} as const;

const TODAY_FLOOR_SELECT = {
  id: true,
  orderId: true,
  sequence: true,
  status: true,
  plannedStartAt: true,
  machine: { select: { code: true } },
  order: { select: { orderNumber: true, product: { select: { sku: true } } } },
} as const;

const MACHINE_SELECT = {
  id: true,
  code: true,
  name: true,
  status: true,
  workCenter: { select: { code: true, name: true } },
} as const;

const AUDIT_SELECT = {
  id: true,
  action: true,
  entityType: true,
  entityId: true,
  entityLabel: true,
  actorName: true,
  actorEmail: true,
  changedFields: true,
  summary: true,
  createdAt: true,
} as const;

type ActiveWindow = { machineId: string; type: DowntimeType; endsAt: Date; reason: string | null; machine: { status: MachineStatus } };

function countByStatus<K extends string>(groups: ReadonlyArray<{ status: K; _count: { _all: number } }>): Map<K, number> {
  return new Map(groups.map((g) => [g.status, g._count._all]));
}

/** Per machine, the covering window with the latest end. */
export function activeWindowsByMachine(windows: readonly ActiveWindow[]): Map<string, ActiveWindow> {
  const out = new Map<string, ActiveWindow>();
  for (const w of windows) {
    const current = out.get(w.machineId);
    if (!current || w.endsAt.getTime() > current.endsAt.getTime()) out.set(w.machineId, w);
  }
  return out;
}

/**
 * KPI counts only (used by the page through `loadDashboard()` and directly by tests).
 * 7 statements: 2 groupBy + 3 count + 1 findMany (active windows) + 1 count (below reorder).
 */
export async function getDashboardKpis(
  db: TenantDb,
  opts: Pick<LoadDashboardOptions, "today" | "now">,
): Promise<{ kpis: DashboardKpis; ordersTotal: number; activeWindows: ActiveWindow[] }> {
  const now = opts.now ?? new Date();
  const [orderGroups, overdue, dueSoon, inProgress, machineGroups, activeWindows, materialsBelowReorder, deliveryRisk, scheduleConflicts] =
    await Promise.all([
      db.order.groupBy({ by: ["status"], _count: { _all: true } }),
      db.order.count({ where: whereOverdue(opts.today) }),
      db.order.count({ where: whereDueWithin(opts.today) }),
      db.order.count({ where: whereInProgress() }),
      db.machine.groupBy({ by: ["status"], _count: { _all: true } }),
      db.downtimeWindow.findMany({
        where: whereActiveDowntime(now),
        select: { machineId: true, type: true, endsAt: true, reason: true, machine: { select: { status: true } } },
      }),
      db.material.count({ where: whereBelowReorder(db.material.fields.reorderThreshold) }),
      db.order.count({ where: { status: { in: [...OPEN_STATUSES] }, deliveryRisk: { in: [...AT_RISK_DELIVERY_RISKS] } } }),
      db.scheduleConflict.count({ where: { resolvedAt: null, severity: { in: ["CRITICAL", "WARNING"] } } }),
    ]);

  const byOrderStatus = countByStatus(orderGroups);
  const ordersTotal = orderGroups.reduce((sum, g) => sum + g._count._all, 0);
  const open = OPEN_STATUSES.reduce((sum, s) => sum + (byOrderStatus.get(s) ?? 0), 0);

  const byMachineStatus = countByStatus(machineGroups);
  const activeTotal = byMachineStatus.get("ACTIVE") ?? 0;
  const maintenance = byMachineStatus.get("MAINTENANCE") ?? 0;
  const inactive = byMachineStatus.get("INACTIVE") ?? 0;
  // "down now" = ACTIVE machines with a window covering now; "active" = ACTIVE machines without one.
  const downNow = new Set(activeWindows.filter((w) => w.machine.status === "ACTIVE").map((w) => w.machineId)).size;

  return {
    kpis: {
      orders: { open, overdue, dueSoon, inProgress },
      machines: {
        total: activeTotal + maintenance + inactive,
        active: Math.max(0, activeTotal - downNow),
        maintenance,
        inactive,
        downNow,
      },
      materialsBelowReorder,
      deliveryRisk,
      scheduleConflicts,
    },
    ordersTotal,
    activeWindows,
  };
}

/** Everything the dashboard page renders, in one round trip of parallel aggregate queries. */
export async function loadDashboard(db: TenantDb, opts: LoadDashboardOptions): Promise<DashboardData> {
  const now = opts.now ?? new Date();
  const today = opts.today;

  const dayEnd = new Date(`${addDays(today, 1)}T00:00:00.000Z`);
  const dayStart = new Date(`${today}T00:00:00.000Z`);

  const [{ kpis, ordersTotal, activeWindows }, orders, machines, machineTotal, audit, todayFloorRows, tenant] = await Promise.all([
    getDashboardKpis(db, { today, now }),
    db.order.findMany({
      where: whereOpen(),
      orderBy: [{ dueDate: "asc" }, { priority: "desc" }, { orderNumber: "asc" }],
      take: DASHBOARD_LIST_LIMIT,
      select: ORDERS_BY_DUE_SELECT,
    }),
    db.machine.findMany({
      orderBy: [{ workCenter: { code: "asc" } }, { code: "asc" }],
      take: DASHBOARD_LIST_LIMIT,
      select: MACHINE_SELECT,
    }),
    db.machine.count(),
    db.auditLog.findMany({
      where: opts.includeSensitiveAudit ? {} : { entityType: { notIn: [...SENSITIVE_AUDIT_ENTITY_TYPES] } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: DASHBOARD_LIST_LIMIT,
      select: AUDIT_SELECT,
    }),
    db.scheduleEntry.findMany({
      where: { plannedStartAt: { gte: dayStart, lt: dayEnd } },
      orderBy: [{ machine: { code: "asc" } }, { plannedStartAt: "asc" }],
      take: TODAY_FLOOR_LIMIT,
      select: TODAY_FLOOR_SELECT,
    }),
    db.tenant.findFirst({ select: { lastScheduleRunAt: true } }),
  ]);

  // First-run checklist counts are only needed while the plant has no orders.
  let totals: DashboardTotals = {
    orders: ordersTotal,
    products: -1,
    workCenters: -1,
    calendars: -1,
    machines: machineTotal,
    materials: -1,
  };
  if (ordersTotal === 0) {
    const [products, workCenters, calendars, materials] = await Promise.all([
      db.product.count(),
      db.workCenter.count(),
      db.shiftCalendar.count(),
      db.material.count(),
    ]);
    totals = { ...totals, products, workCenters, calendars, materials };
  }

  const windowsByMachine = activeWindowsByMachine(activeWindows);

  return {
    today,
    kpis,
    totals,
    hrefs: {
      open: KPI_LIST_HREFS.open(),
      overdue: KPI_LIST_HREFS.overdue(today),
      dueSoon: KPI_LIST_HREFS.dueWithin(today),
      inProgress: KPI_LIST_HREFS.inProgress(),
      machines: "/machines",
      materialsBelowReorder: "/materials?belowThreshold=1",
      deliveryRisk: `/orders?risk=${AT_RISK_DELIVERY_RISKS.join(",")}`,
      scheduleConflicts: "/schedule/conflicts",
      floor: "/floor",
    },
    ordersByDue: orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      customerName: o.customer.name,
      productSku: o.product.sku,
      productName: o.product.name,
      unit: o.product.unit,
      quantity: Number(String(o.quantity)),
      priority: o.priority,
      status: o.status,
      dueDate: toDateOnly(o.dueDate),
      deliveryRisk: o.deliveryRisk,
    })),
    machines: machines.map((m) => {
      const w = windowsByMachine.get(m.id);
      return {
        id: m.id,
        code: m.code,
        name: m.name,
        workCenterCode: m.workCenter.code,
        workCenterName: m.workCenter.name,
        status: m.status,
        activeDowntime: w ? { type: w.type, endsAt: w.endsAt, reason: w.reason } : null,
      };
    }),
    activity: audit.map((row) => toPlain(row)),
    todayFloor: todayFloorRows.map((e) => ({
      id: e.id,
      orderId: e.orderId,
      orderNumber: e.order.orderNumber,
      productSku: e.order.product.sku,
      machineCode: e.machine.code,
      sequence: e.sequence,
      status: e.status,
      plannedStartAt: e.plannedStartAt,
    })),
    scheduleHasRun: tenant?.lastScheduleRunAt != null,
  };
}

/** The seven first-run steps (docs/M2_SPEC.md §6), with their done checks from the totals. */
export type SetupStep = {
  key: "workCenters" | "calendar" | "machines" | "materials" | "products" | "orders" | "schedule";
  title: string;
  description: string;
  done: boolean;
};

export function setupSteps(totals: DashboardTotals, scheduleHasRun: boolean = false): SetupStep[] {
  return [
    { key: "workCenters", title: "Add work centers", description: "Group machines by the stage they serve — CNC, assembly, paint.", done: totals.workCenters > 0 },
    { key: "calendar", title: "Review shift calendar", description: "Check the default shifts and add holidays so capacity is right.", done: totals.calendars > 0 },
    { key: "machines", title: "Add machines", description: "Capacity, efficiency and the calendar each machine follows.", done: totals.machines > 0 },
    { key: "materials", title: "Add materials", description: "Raw materials and parts with reorder thresholds and stock on hand.", done: totals.materials > 0 },
    { key: "products", title: "Add products & BOM", description: "What you make, what it consumes, and the routing it follows.", done: totals.products > 0 },
    { key: "orders", title: "Create your first order", description: "Or import a CSV of open orders from your ERP.", done: totals.orders > 0 },
    { key: "schedule", title: "Run the schedule", description: "Build the plan, spot conflicts and see delivery risk across open orders.", done: scheduleHasRun },
  ];
}
