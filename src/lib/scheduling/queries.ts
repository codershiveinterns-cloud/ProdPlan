/**
 * Read-only DTOs for the scheduling UI (docs/M2_SPEC.md §3 "board — you provide queries.ts and move.ts for it").
 * Every export returns plain, JSON-safe data via `toPlain()` (Decimal → number, Date → ISO string) so it can be
 * handed straight to Client Components. Pure reads: no mutation, no audit.
 */
import type { ConflictSeverity, ConflictType, DeliveryRisk, OperationStatus } from "@/generated/prisma/enums";
import { shiftsOn, type Calendar } from "@/lib/calendar";
import { addDays } from "@/lib/dates";
import type { TenantDb } from "@/lib/db";
import { toPlain } from "@/lib/serialize";

const num = (v: { toString(): string } | number | null | undefined): number => (v == null ? 0 : Number(String(v)));

// ---------------------------------------------------------------------------------------------------------------
// loadBoardWindow
// ---------------------------------------------------------------------------------------------------------------

export type BoardWindowInput = { from: string; days: number; workCenterId?: string; tz: string };

export type BoardEntryDTO = {
  id: string;
  orderId: string;
  orderNumber: string;
  productSku: string;
  productName: string;
  sequence: number;
  machineId: string;
  plannedStartAt: string;
  plannedEndAt: string;
  status: OperationStatus;
  locked: boolean;
  /** Worst OPEN conflict severity referencing this entry (directly, or via its order), if any. */
  conflictSeverity: ConflictSeverity | null;
};

export type BoardDowntimeDTO = { id: string; startsAt: string; endsAt: string; type: string; reason: string | null };

export type BoardShiftInstanceDTO = { date: string; name: string; startsAt: string; endsAt: string };

export type BoardMachineDTO = {
  id: string;
  code: string;
  name: string;
  workCenterId: string;
  status: string;
  calendarId: string;
  /** Utilisation over the window: occupied / available working minutes, 0–100 (0 when the machine has no working time). */
  utilisationPercent: number;
  entries: BoardEntryDTO[];
  downtime: BoardDowntimeDTO[];
  /** Working shift instances starting inside the window, on this machine's calendar. */
  shifts: BoardShiftInstanceDTO[];
};

export type BoardWorkCenterDTO = { id: string; code: string; name: string; machines: BoardMachineDTO[] };

export type BoardWindowDTO = {
  from: string;
  days: number;
  workCenters: BoardWorkCenterDTO[];
  /** True when any open order is dirty or the plant has never been scheduled — shows the "Run schedule" banner. */
  dirty: boolean;
  lastRunAt: string | null;
};

/**
 * Machines (ACTIVE + MAINTENANCE) grouped by work center, their entries/downtime/shifts inside `[from, from+days)`,
 * per-machine utilisation for the window, and whether the board should show the "out of date" banner.
 */
export async function loadBoardWindow(db: TenantDb, input: BoardWindowInput): Promise<BoardWindowDTO> {
  const { from, tz } = input;
  const days = input.days > 0 ? input.days : 14;
  const toIso = addDays(from, days);
  const windowStart = new Date(`${from}T00:00:00.000Z`);
  const windowEnd = new Date(`${toIso}T00:00:00.000Z`);

  const [machines, entries, downtimeRows, calendarRows, dirtyCount, tenant] = await Promise.all([
    db.machine.findMany({
      where: { status: { in: ["ACTIVE", "MAINTENANCE"] }, ...(input.workCenterId ? { workCenterId: input.workCenterId } : {}) },
      select: { id: true, code: true, name: true, workCenterId: true, status: true, calendarId: true, workCenter: { select: { id: true, code: true, name: true } } },
      orderBy: [{ workCenter: { code: "asc" } }, { code: "asc" }],
    }),
    db.scheduleEntry.findMany({
      where: {
        plannedStartAt: { lt: windowEnd },
        plannedEndAt: { gt: windowStart },
        ...(input.workCenterId ? { workCenterId: input.workCenterId } : {}),
      },
      select: {
        id: true,
        orderId: true,
        sequence: true,
        machineId: true,
        plannedStartAt: true,
        plannedEndAt: true,
        status: true,
        locked: true,
        order: { select: { orderNumber: true, product: { select: { sku: true, name: true } } } },
        conflicts: { where: { resolvedAt: null }, select: { severity: true } },
      },
      orderBy: { plannedStartAt: "asc" },
    }),
    db.downtimeWindow.findMany({
      where: { startsAt: { lt: windowEnd }, endsAt: { gt: windowStart }, ...(input.workCenterId ? { machine: { workCenterId: input.workCenterId } } : {}) },
      select: { id: true, machineId: true, startsAt: true, endsAt: true, type: true, reason: true },
    }),
    db.shiftCalendar.findMany({ select: { id: true, shifts: true, exceptions: true } }),
    db.order.count({ where: { status: { in: ["QUEUED", "IN_PROGRESS", "ON_HOLD"] }, scheduleDirty: true } }),
    db.tenant.findFirst({ select: { lastScheduleRunAt: true } }),
  ]);

  // Order-level open conflicts (DEADLINE_*, MATERIAL_SHORTAGE, UNSCHEDULED …) also colour the entry bar.
  const orderIds = [...new Set(entries.map((e) => e.orderId))];
  const orderConflicts = orderIds.length
    ? await db.scheduleConflict.findMany({ where: { orderId: { in: orderIds }, resolvedAt: null }, select: { orderId: true, severity: true } })
    : [];
  const worstByOrder = new Map<string, ConflictSeverity>();
  for (const c of orderConflicts) {
    if (!c.orderId) continue;
    const prev = worstByOrder.get(c.orderId);
    if (!prev || (prev === "WARNING" && c.severity === "CRITICAL")) worstByOrder.set(c.orderId, c.severity);
  }

  const calendarsById = new Map(calendarRows.map((c) => [c.id, c]));
  const entriesByMachine = new Map<string, typeof entries>();
  for (const e of entries) {
    const list = entriesByMachine.get(e.machineId) ?? [];
    list.push(e);
    entriesByMachine.set(e.machineId, list);
  }
  const downtimeByMachine = new Map<string, typeof downtimeRows>();
  for (const d of downtimeRows) {
    const list = downtimeByMachine.get(d.machineId) ?? [];
    list.push(d);
    downtimeByMachine.set(d.machineId, list);
  }

  const workCenters = new Map<string, BoardWorkCenterDTO>();
  for (const m of machines) {
    const calendarRow = calendarsById.get(m.calendarId);
    const calendar: Calendar = calendarRow
      ? { shifts: calendarRow.shifts.map((s) => ({ id: s.id, name: s.name, startTime: s.startTime, endTime: s.endTime, daysOfWeek: s.daysOfWeek, breakMinutes: s.breakMinutes })), exceptions: calendarRow.exceptions.map((e) => ({ date: e.date, isWorking: e.isWorking, note: e.note })) }
      : { shifts: [], exceptions: [] };

    const shiftInstances: BoardShiftInstanceDTO[] = [];
    let availableMinutes = 0;
    for (let i = 0; i < days; i++) {
      const iso = addDays(from, i);
      for (const inst of shiftsOn(calendar, iso, tz)) {
        shiftInstances.push({ date: iso, name: inst.name, startsAt: inst.startsAt.toISOString(), endsAt: inst.endsAt.toISOString() });
        availableMinutes += Math.max(0, inst.grossMinutes - inst.breakMinutes);
      }
    }

    const machineEntries = entriesByMachine.get(m.id) ?? [];
    let occupiedMinutes = 0;
    for (const e of machineEntries) {
      const s = Math.max(e.plannedStartAt.getTime(), windowStart.getTime());
      const en = Math.min(e.plannedEndAt.getTime(), windowEnd.getTime());
      if (en > s) occupiedMinutes += Math.round((en - s) / 60_000);
    }
    const utilisationPercent = availableMinutes > 0 ? Math.round((occupiedMinutes / availableMinutes) * 100) : 0;

    const entryDTOs: BoardEntryDTO[] = machineEntries.map((e) => ({
      id: e.id,
      orderId: e.orderId,
      orderNumber: e.order.orderNumber,
      productSku: e.order.product.sku,
      productName: e.order.product.name,
      sequence: e.sequence,
      machineId: e.machineId,
      plannedStartAt: e.plannedStartAt.toISOString(),
      plannedEndAt: e.plannedEndAt.toISOString(),
      status: e.status,
      locked: e.locked,
      conflictSeverity: e.conflicts.some((c) => c.severity === "CRITICAL")
        ? "CRITICAL"
        : e.conflicts.length > 0
          ? "WARNING"
          : (worstByOrder.get(e.orderId) ?? null),
    }));

    const machineDto: BoardMachineDTO = {
      id: m.id,
      code: m.code,
      name: m.name,
      workCenterId: m.workCenterId,
      status: m.status,
      calendarId: m.calendarId,
      utilisationPercent,
      entries: entryDTOs,
      downtime: (downtimeByMachine.get(m.id) ?? []).map((d) => ({ id: d.id, startsAt: d.startsAt.toISOString(), endsAt: d.endsAt.toISOString(), type: d.type, reason: d.reason })),
      shifts: shiftInstances,
    };

    const wc = workCenters.get(m.workCenterId) ?? { id: m.workCenter.id, code: m.workCenter.code, name: m.workCenter.name, machines: [] };
    wc.machines.push(machineDto);
    workCenters.set(m.workCenterId, wc);
  }

  return {
    from,
    days,
    workCenters: [...workCenters.values()].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)),
    dirty: dirtyCount > 0 || !tenant?.lastScheduleRunAt,
    lastRunAt: tenant?.lastScheduleRunAt ? tenant.lastScheduleRunAt.toISOString() : null,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// listConflicts
// ---------------------------------------------------------------------------------------------------------------

export const CONFLICTS_PAGE_SIZE = 25;

export type ConflictFilters = { type?: ConflictType; severity?: ConflictSeverity; resolved?: boolean };

export type ConflictRowDTO = {
  id: string;
  type: ConflictType;
  severity: ConflictSeverity;
  message: string;
  details: unknown;
  createdAt: string;
  resolvedAt: string | null;
  order: { id: string; orderNumber: string } | null;
  machine: { id: string; code: string } | null;
  material: { id: string; code: string; name: string } | null;
  entryId: string | null;
};

export async function listConflicts(
  db: TenantDb,
  filters: ConflictFilters,
  page: number,
): Promise<{ rows: ConflictRowDTO[]; total: number; page: number; pageSize: number }> {
  const where = {
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.severity ? { severity: filters.severity } : {}),
    ...(filters.resolved === undefined ? {} : filters.resolved ? { resolvedAt: { not: null } } : { resolvedAt: null }),
  };
  const safePage = Number.isInteger(page) && page >= 1 ? page : 1;
  const [rows, total] = await Promise.all([
    db.scheduleConflict.findMany({
      where,
      select: {
        id: true,
        type: true,
        severity: true,
        message: true,
        details: true,
        createdAt: true,
        resolvedAt: true,
        entryId: true,
        order: { select: { id: true, orderNumber: true } },
        machine: { select: { id: true, code: true } },
        material: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
      skip: (safePage - 1) * CONFLICTS_PAGE_SIZE,
      take: CONFLICTS_PAGE_SIZE,
    }),
    db.scheduleConflict.count({ where }),
  ]);
  return {
    rows: rows.map((r) => ({ ...toPlain(r) })),
    total,
    page: safePage,
    pageSize: CONFLICTS_PAGE_SIZE,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// orderSchedule
// ---------------------------------------------------------------------------------------------------------------

export type OrderScheduleStepDTO = {
  id: string;
  sequence: number;
  workCenterId: string;
  workCenterName: string;
  machineId: string;
  machineCode: string;
  machineName: string;
  plannedStartAt: string;
  plannedEndAt: string;
  status: OperationStatus;
  locked: boolean;
  quantityDone: number;
  actualStartAt: string | null;
  actualEndAt: string | null;
};

export type OrderScheduleDTO = {
  orderId: string;
  deliveryRisk: DeliveryRisk;
  riskReason: string | null;
  plannedStartAt: string | null;
  plannedEndAt: string | null;
  steps: OrderScheduleStepDTO[];
} | null;

export async function orderSchedule(db: TenantDb, orderId: string): Promise<OrderScheduleDTO> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      deliveryRisk: true,
      riskReason: true,
      plannedStartAt: true,
      plannedEndAt: true,
      scheduleEntries: {
        select: {
          id: true,
          sequence: true,
          workCenterId: true,
          machineId: true,
          plannedStartAt: true,
          plannedEndAt: true,
          status: true,
          locked: true,
          quantityDone: true,
          actualStartAt: true,
          actualEndAt: true,
          workCenter: { select: { name: true } },
          machine: { select: { code: true, name: true } },
        },
        orderBy: { sequence: "asc" },
      },
    },
  });
  if (!order) return null;
  return {
    orderId: order.id,
    deliveryRisk: order.deliveryRisk,
    riskReason: order.riskReason,
    plannedStartAt: order.plannedStartAt ? order.plannedStartAt.toISOString() : null,
    plannedEndAt: order.plannedEndAt ? order.plannedEndAt.toISOString() : null,
    steps: order.scheduleEntries.map((e) => ({
      id: e.id,
      sequence: e.sequence,
      workCenterId: e.workCenterId,
      workCenterName: e.workCenter.name,
      machineId: e.machineId,
      machineCode: e.machine.code,
      machineName: e.machine.name,
      plannedStartAt: e.plannedStartAt.toISOString(),
      plannedEndAt: e.plannedEndAt.toISOString(),
      status: e.status,
      locked: e.locked,
      quantityDone: num(e.quantityDone),
      actualStartAt: e.actualStartAt ? e.actualStartAt.toISOString() : null,
      actualEndAt: e.actualEndAt ? e.actualEndAt.toISOString() : null,
    })),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// floorOperations
// ---------------------------------------------------------------------------------------------------------------

export type FloorOperationDTO = {
  id: string;
  orderId: string;
  orderNumber: string;
  productSku: string;
  productName: string;
  quantity: number;
  sequence: number;
  plannedStartAt: string;
  plannedEndAt: string;
  status: OperationStatus;
  overdue: boolean;
};

export type FloorMachineDTO = {
  id: string;
  code: string;
  name: string;
  workCenterId: string;
  downtimeNow: boolean;
  operations: FloorOperationDTO[];
  upNext: FloorOperationDTO[];
};

export type FloorOperationsInput = { date: string; tz: string; workCenterId?: string; machineId?: string };

/** Today's + overdue QUEUED/IN_PROGRESS operations, grouped by machine in planned order, plus "up next" (next 3). */
export async function floorOperations(db: TenantDb, input: FloorOperationsInput): Promise<FloorMachineDTO[]> {
  const dayEnd = new Date(`${addDays(input.date, 1)}T00:00:00.000Z`);
  const now = new Date();

  const [machines, entries, downtimeNowRows] = await Promise.all([
    db.machine.findMany({
      where: { ...(input.workCenterId ? { workCenterId: input.workCenterId } : {}), ...(input.machineId ? { id: input.machineId } : {}) },
      select: { id: true, code: true, name: true, workCenterId: true },
      orderBy: { code: "asc" },
    }),
    db.scheduleEntry.findMany({
      where: {
        // Today's operations (planned to start before tomorrow) plus anything still QUEUED/IN_PROGRESS from an
        // earlier day (overdue) — both are captured by "starts before the end of today".
        status: { in: ["QUEUED", "IN_PROGRESS"] },
        plannedStartAt: { lt: dayEnd },
        ...(input.workCenterId ? { workCenterId: input.workCenterId } : {}),
        ...(input.machineId ? { machineId: input.machineId } : {}),
      },
      select: {
        id: true,
        orderId: true,
        sequence: true,
        machineId: true,
        plannedStartAt: true,
        plannedEndAt: true,
        status: true,
        order: { select: { orderNumber: true, quantity: true, product: { select: { sku: true, name: true } } } },
      },
      orderBy: { plannedStartAt: "asc" },
    }),
    db.downtimeWindow.findMany({ where: { startsAt: { lte: now }, endsAt: { gt: now } }, select: { machineId: true } }),
  ]);

  const downtimeNow = new Set(downtimeNowRows.map((d) => d.machineId));
  const byMachine = new Map<string, typeof entries>();
  for (const e of entries) {
    const list = byMachine.get(e.machineId) ?? [];
    list.push(e);
    byMachine.set(e.machineId, list);
  }

  return machines.map((m) => {
    const rows = (byMachine.get(m.id) ?? []).map((e) => ({
      id: e.id,
      orderId: e.orderId,
      orderNumber: e.order.orderNumber,
      productSku: e.order.product.sku,
      productName: e.order.product.name,
      quantity: num(e.order.quantity),
      sequence: e.sequence,
      plannedStartAt: e.plannedStartAt.toISOString(),
      plannedEndAt: e.plannedEndAt.toISOString(),
      status: e.status,
      overdue: e.plannedStartAt.getTime() < now.getTime() && e.status === "QUEUED",
    }));
    return {
      id: m.id,
      code: m.code,
      name: m.name,
      workCenterId: m.workCenterId,
      downtimeNow: downtimeNow.has(m.id),
      operations: rows,
      upNext: rows.slice(0, 3),
    };
  });
}

