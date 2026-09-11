/**
 * Pure scheduling engine (docs/M2_SPEC.md §2). No I/O, no randomness: the same input always yields the same output.
 *
 * Algorithm
 *  1. Candidates = QUEUED / IN_PROGRESS orders sorted by priority, due date, createdAt, order number.
 *  2. Fixed entries (locked, in progress, completed, paused-after-start) occupy their machines and are never moved.
 *     An IN_PROGRESS entry that has overrun its planned end occupies the machine until `now`.
 *  3. Each routing step is placed on the candidate machine that FINISHES earliest (tie → lower machine code) in the
 *     machine's free working time (calendar shifts − downtime − occupied intervals), spanning shifts and days when
 *     needed. Earliest start = max(now rounded up to 5 min, earliestStartDate 00:00, previous step end). An order is
 *     committed only when every remaining step fits inside the horizon; otherwise it stays unscheduled.
 *  4. Materials are consumed from a running balance in planned-start order → MATERIAL_SHORTAGE conflicts.
 *  5. Delivery risk per order (risk.ts) → DEADLINE_* conflicts. Machine load → MACHINE_OVERLOAD.
 */
import type { ConflictSeverity, OrderPriority } from "@/generated/prisma/enums";
import { requirementFor } from "@/lib/bom";
import { isWorkingDay, type Calendar } from "@/lib/calendar";
import { addDays, startOfDayInTz, todayInTz, zonedToUtc } from "@/lib/dates";
import { operationMinutes } from "@/lib/routing";
import { classifyRisk, riskReason, type ShortageSummary } from "./risk";
import type {
  EngineEntry,
  EngineInput,
  EngineMachine,
  EngineOptions,
  EngineOrder,
  EngineOrderResult,
  EngineResult,
  MachineLoad,
  PlannedConflict,
  PlannedEntry,
} from "./types";
import {
  ceilToMinutes,
  coveredMinutes,
  downtimeIntervals,
  normalizeIntervals,
  placeWork,
  subtractInterval,
  subtractIntervals,
  totalMinutes,
  workingWindows,
  type Interval,
} from "./windows";

export const NOW_ROUNDING_MINUTES = 5;
export const MAX_HORIZON_DAYS = 365;

const PRIORITY_RANK: Record<OrderPriority, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };

const CANDIDATE_STATUSES = new Set<EngineOrder["status"]>(["QUEUED", "IN_PROGRESS"]);

/** Deterministic candidate order: priority, due date, createdAt, order number. Exported for tests. */
export function sortCandidates(orders: readonly EngineOrder[]): EngineOrder[] {
  const key = (o: EngineOrder) => {
    const c = o.createdAt instanceof Date ? o.createdAt.toISOString() : (o.createdAt ?? "");
    return c;
  };
  return orders
    .filter((o) => CANDIDATE_STATUSES.has(o.status))
    .slice()
    .sort(
      (a, b) =>
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0) ||
        (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0) ||
        (a.orderNumber < b.orderNumber ? -1 : a.orderNumber > b.orderNumber ? 1 : 0),
    );
}

/** Wall minutes for a step on a machine: ceil((setup + qty × run) × 100 / efficiency). */
export function stepMinutes(
  step: { setupMinutes: number; runMinutesPerUnit: number },
  quantity: number,
  efficiencyPercent: number,
): { plannedMinutes: number; setupMinutes: number; runMinutes: number } {
  const eff = efficiencyPercent > 0 ? efficiencyPercent : 100;
  const plannedMinutes = Math.ceil(operationMinutes(step.setupMinutes, quantity, step.runMinutesPerUnit, eff));
  const setupMinutes = Math.min(plannedMinutes, Math.ceil(operationMinutes(step.setupMinutes, 0, 0, eff)));
  return { plannedMinutes, setupMinutes, runMinutes: plannedMinutes - setupMinutes };
}

type MachineState = {
  machine: EngineMachine;
  /** Gross shift windows (breaks included) — used for the "locked entry outside working time" check. */
  gross: Interval[];
  /** Working windows minus downtime (before occupation) — the capacity denominator. */
  capacity: Interval[];
  /** Capacity minus fixed + placed entries. */
  free: Interval[];
  downtime: Interval[];
  occupied: Interval[];
};

type FixedByOrder = Map<string, Map<number, EngineEntry>>;

function busyInterval(entry: EngineEntry, nowMs: number): Interval {
  const s = (entry.actualStartAt ?? entry.plannedStartAt).getTime();
  let e = (entry.actualEndAt ?? entry.plannedEndAt).getTime();
  if (entry.status === "IN_PROGRESS" && e < nowMs) e = nowMs;
  return { s: Math.min(s, e), e: Math.max(s, e) };
}

function fixedEnd(entry: EngineEntry, nowMs: number): number {
  return busyInterval(entry, nowMs).e;
}

export function scheduleOrders(input: EngineInput, opts: EngineOptions): EngineResult {
  const { tz } = opts;
  const horizonDays = Math.max(1, Math.min(MAX_HORIZON_DAYS, Math.floor(opts.horizonDays)));
  const now = ceilToMinutes(opts.now, NOW_ROUNDING_MINUTES);
  const nowMs = now.getTime();
  const today = todayInTz(tz, opts.now);
  const horizonEndIso = addDays(today, horizonDays);
  const horizonEnd = startOfDayInTz(horizonEndIso, tz);
  const horizonEndMs = horizonEnd.getTime();

  const conflicts: PlannedConflict[] = [];
  const entries: PlannedEntry[] = [];
  const orderResults: Record<string, EngineOrderResult> = {};

  // ---- machines ------------------------------------------------------------------------------------------------
  const machinesById = new Map<string, EngineMachine>();
  for (const m of input.machines) machinesById.set(m.id, m);
  const activeByWorkCenter = new Map<string, EngineMachine[]>();
  for (const m of input.machines) {
    if (m.status !== "ACTIVE") continue;
    const list = activeByWorkCenter.get(m.workCenterId) ?? [];
    list.push(m);
    activeByWorkCenter.set(m.workCenterId, list);
  }
  for (const list of activeByWorkCenter.values()) list.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));

  const fixedEntries: EngineEntry[] = [...input.inProgressEntries, ...input.lockedEntries];
  const fixedByOrder: FixedByOrder = new Map();
  for (const e of fixedEntries) {
    const m = fixedByOrder.get(e.orderId) ?? new Map<number, EngineEntry>();
    m.set(e.sequence, e);
    fixedByOrder.set(e.orderId, m);
  }
  const fixedByMachine = new Map<string, EngineEntry[]>();
  for (const e of fixedEntries) {
    const list = fixedByMachine.get(e.machineId) ?? [];
    list.push(e);
    fixedByMachine.set(e.machineId, list);
  }

  const states = new Map<string, MachineState>();
  const emptyCalendar: Calendar = { shifts: [], exceptions: [] };
  const machineState = (m: EngineMachine): MachineState => {
    const existing = states.get(m.id);
    if (existing) return existing;
    const calendar = input.calendars[m.calendarId] ?? emptyCalendar;
    const clip = { clipStart: nowMs, clipEnd: horizonEndMs };
    const gross = workingWindows(calendar, tz, today, horizonEndIso, { withBreaks: false, ...clip });
    const working = workingWindows(calendar, tz, today, horizonEndIso, clip);
    const downtime = downtimeIntervals(input.downtime[m.id] ?? []);
    const capacity = subtractIntervals(working, downtime);
    const occupied = normalizeIntervals((fixedByMachine.get(m.id) ?? []).map((e) => busyInterval(e, nowMs)));
    const free = subtractIntervals(capacity, occupied);
    const state: MachineState = { machine: m, gross, capacity, free, downtime, occupied };
    states.set(m.id, state);
    return state;
  };
  for (const m of input.machines) machineState(m);

  // ---- locked-entry sanity (§2.7) --------------------------------------------------------------------------------
  for (const m of input.machines) {
    const list = (fixedByMachine.get(m.id) ?? []).slice().sort((a, b) => busyInterval(a, nowMs).s - busyInterval(b, nowMs).s || (a.id < b.id ? -1 : 1));
    const state = machineState(m);
    for (let i = 0; i < list.length; i++) {
      const a = list[i]!;
      const ia = busyInterval(a, nowMs);
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j]!;
        const ib = busyInterval(b, nowMs);
        if (ib.s >= ia.e) break;
        if (!a.locked && !b.locked) continue; // two started operations overlapping is reality, not a plan error
        conflicts.push({
          type: "MACHINE_OVERLOAD",
          severity: "CRITICAL",
          machineId: m.id,
          orderId: a.locked ? a.orderId : b.orderId,
          entryId: a.locked ? a.id : b.id,
          message: `${m.code}: locked operations overlap (${a.orderId === b.orderId ? "same order" : "two orders"})`,
          details: { entryIds: [a.id, b.id], orderIds: [a.orderId, b.orderId] },
        });
      }
      if (!a.locked || ia.e <= nowMs) continue;
      const span = { s: Math.max(ia.s, nowMs), e: Math.min(ia.e, horizonEndMs) };
      if (span.e <= span.s) continue;
      if (coveredMinutes(state.downtime, span.s, span.e) > 0) {
        conflicts.push({
          type: "MACHINE_OVERLOAD",
          severity: "CRITICAL",
          machineId: m.id,
          orderId: a.orderId,
          entryId: a.id,
          message: `${m.code}: locked operation falls inside a downtime window`,
          details: { entryIds: [a.id] },
        });
      } else if (subtractIntervals([span], state.gross).length > 0) {
        conflicts.push({
          type: "MACHINE_OVERLOAD",
          severity: "CRITICAL",
          machineId: m.id,
          orderId: a.orderId,
          entryId: a.id,
          message: `${m.code}: locked operation lies outside working time`,
          details: { entryIds: [a.id] },
        });
      }
    }
  }

  // ---- placement -----------------------------------------------------------------------------------------------
  const candidates = sortCandidates(input.orders);
  const machinesUsed = new Set<string>();
  type OrderPlan = { order: EngineOrder; planned: PlannedEntry[]; startMs: number; endMs: number; lastMachineCode: string | null };
  const plans: OrderPlan[] = [];
  const unscheduled: EngineOrder[] = [];

  const fail = (order: EngineOrder, cause: PlannedConflict | null): void => {
    if (cause) conflicts.push(cause);
    conflicts.push({
      type: "UNSCHEDULED",
      severity: "CRITICAL",
      orderId: order.id,
      message: `${order.orderNumber} could not be scheduled${cause ? `: ${cause.message}` : ""}`,
    });
    unscheduled.push(order);
  };

  for (const order of candidates) {
    const routing = order.routing.slice().sort((a, b) => a.sequence - b.sequence);
    const fixed = fixedByOrder.get(order.id) ?? new Map<number, EngineEntry>();
    const completed = new Set(order.completedSequences);
    const remaining = routing.filter((s) => !completed.has(s.sequence) && !fixed.has(s.sequence));

    if (routing.length === 0 && fixed.size === 0) {
      fail(order, {
        type: "NO_ROUTING",
        severity: "CRITICAL",
        orderId: order.id,
        message: `${order.orderNumber}: product ${order.product.sku} has no routing`,
        details: { productId: order.product.id },
      });
      continue;
    }

    let earliest = nowMs;
    if (order.earliestStartDate) earliest = Math.max(earliest, zonedToUtc(order.earliestStartDate, "00:00", tz).getTime());
    // Previous-step end from fixed entries (actual end when present).
    let prevEnd = 0;
    let startMs = Number.POSITIVE_INFINITY;
    let endMs = 0;
    let lastMachineCode: string | null = null;
    let lastSeq = -1;
    for (const e of fixed.values()) {
      const b = busyInterval(e, nowMs);
      startMs = Math.min(startMs, b.s);
      if (b.e > endMs) endMs = b.e;
      if (e.sequence > lastSeq) {
        lastSeq = e.sequence;
        lastMachineCode = machinesById.get(e.machineId)?.code ?? null;
      }
    }

    const planned: PlannedEntry[] = [];
    let cause: PlannedConflict | null = null;
    for (const step of remaining) {
      // Previous sequence end: fixed entry (actual/planned end) or the entry planned just before in this run.
      const prevFixed = [...fixed.values()].filter((e) => e.sequence < step.sequence);
      for (const e of prevFixed) prevEnd = Math.max(prevEnd, fixedEnd(e, nowMs));
      const stepEarliest = Math.max(earliest, prevEnd);

      let candidatesForStep: EngineMachine[];
      if (step.machineId) {
        const m = machinesById.get(step.machineId);
        if (!m || m.status !== "ACTIVE") {
          cause = {
            type: "MACHINE_UNAVAILABLE",
            severity: "CRITICAL",
            orderId: order.id,
            machineId: m?.id,
            message: `${order.orderNumber} op ${step.sequence}: machine ${m?.code ?? step.machineId} is not active`,
            details: { sequence: step.sequence, workCenterId: step.workCenterId },
          };
          break;
        }
        candidatesForStep = [m];
      } else {
        candidatesForStep = activeByWorkCenter.get(step.workCenterId) ?? [];
        if (candidatesForStep.length === 0) {
          cause = {
            type: "MACHINE_UNAVAILABLE",
            severity: "CRITICAL",
            orderId: order.id,
            message: `${order.orderNumber} op ${step.sequence}: no active machine in its work center`,
            details: { sequence: step.sequence, workCenterId: step.workCenterId },
          };
          break;
        }
      }

      let best: { machine: EngineMachine; start: number; end: number; minutes: ReturnType<typeof stepMinutes> } | null = null;
      for (const m of candidatesForStep) {
        const minutes = stepMinutes(step, order.quantity, m.efficiencyPercent);
        const state = machineState(m);
        // Steps of this order placed earlier in this loop cannot collide (they end before stepEarliest), so the
        // machine's free list is still valid without committing them first.
        const p = placeWork(state.free, stepEarliest, minutes.plannedMinutes);
        if (!p) continue;
        if (!best || p.end < best.end || (p.end === best.end && m.code < best.machine.code)) {
          best = { machine: m, start: p.start, end: p.end, minutes };
        }
      }
      if (!best) {
        cause = {
          type: "NO_MACHINE",
          severity: "CRITICAL",
          orderId: order.id,
          machineId: candidatesForStep.length === 1 ? candidatesForStep[0]!.id : undefined,
          message: `${order.orderNumber} op ${step.sequence}: no capacity within the ${horizonDays}-day horizon (${candidatesForStep.map((m) => m.code).join(", ")})`,
          details: { sequence: step.sequence, workCenterId: step.workCenterId, machineIds: candidatesForStep.map((m) => m.id) },
        };
        break;
      }
      planned.push({
        orderId: order.id,
        operationId: step.operationId,
        sequence: step.sequence,
        workCenterId: step.workCenterId,
        machineId: best.machine.id,
        plannedStartAt: new Date(best.start),
        plannedEndAt: new Date(best.end),
        plannedMinutes: best.minutes.plannedMinutes,
        setupMinutes: best.minutes.setupMinutes,
        runMinutes: best.minutes.runMinutes,
      });
      prevEnd = best.end;
      startMs = Math.min(startMs, best.start);
      if (best.end > endMs) endMs = best.end;
      if (step.sequence > lastSeq) {
        lastSeq = step.sequence;
        lastMachineCode = best.machine.code;
      }
    }

    if (cause) {
      fail(order, cause);
      continue;
    }
    // Commit: occupy the machines.
    for (const p of planned) {
      const state = machineState(machinesById.get(p.machineId)!);
      const busy = { s: p.plannedStartAt.getTime(), e: p.plannedEndAt.getTime() };
      state.free = subtractInterval(state.free, busy);
      state.occupied = normalizeIntervals([...state.occupied, busy]);
      machinesUsed.add(p.machineId);
      entries.push(p);
    }
    if (planned.length === 0 && fixed.size === 0) {
      // Every step already completed: nothing to plan, treat as scheduled with no window.
      plans.push({ order, planned, startMs: nowMs, endMs: nowMs, lastMachineCode });
      continue;
    }
    plans.push({ order, planned, startMs: Number.isFinite(startMs) ? startMs : nowMs, endMs, lastMachineCode });
  }

  // ---- materials (§2.5) ----------------------------------------------------------------------------------------
  const balances = new Map<string, number>();
  for (const [id, m] of Object.entries(input.materials)) balances.set(id, m.stockOnHand);
  const shortageByOrder = new Map<string, ShortageSummary>();
  const walk: EngineOrder[] = [
    ...plans
      .slice()
      .sort((a, b) => a.startMs - b.startMs || candidates.indexOf(a.order) - candidates.indexOf(b.order))
      .map((p) => p.order),
    ...unscheduled,
  ];
  for (const order of walk) {
    if (order.bom.length === 0) continue;
    const lines = requirementFor(
      order.quantity,
      order.bom.map((b) => ({
        materialId: b.materialId,
        quantityPerUnit: b.quantityPerUnit,
        scrapPercent: b.scrapPercent,
        stockOnHand: Math.max(0, balances.get(b.materialId) ?? 0),
      })),
    );
    for (const line of lines) {
      const material = input.materials[line.materialId];
      const available = Math.max(0, balances.get(line.materialId) ?? 0);
      balances.set(line.materialId, available - line.required);
      if (!line.isShort || line.required <= 0) continue;
      const severity: ConflictSeverity = available <= 0 ? "CRITICAL" : "WARNING";
      const summary: ShortageSummary = { code: material?.code ?? line.materialId, shortBy: line.shortBy, unit: material?.unit ?? "" };
      if (!shortageByOrder.has(order.id)) shortageByOrder.set(order.id, summary);
      conflicts.push({
        type: "MATERIAL_SHORTAGE",
        severity,
        orderId: order.id,
        materialId: line.materialId,
        message: `${order.orderNumber}: ${riskReason.shortage(summary)}`,
        details: {
          materialId: line.materialId,
          code: summary.code,
          name: material?.name ?? null,
          required: line.required,
          available,
          shortBy: line.shortBy,
          unit: summary.unit,
        },
      });
    }
  }

  // ---- delivery risk (§2.6) ------------------------------------------------------------------------------------
  const defaultCalendar = input.calendars[opts.defaultCalendarId ?? input.machines[0]?.calendarId ?? ""] ?? emptyCalendar;
  const workingDayPredicate = (iso: string) => (defaultCalendar.shifts.length ? isWorkingDay(defaultCalendar, iso) : true);
  const riskFor = (order: EngineOrder, plan: OrderPlan | null): EngineOrderResult => {
    const shortage = shortageByOrder.get(order.id) ?? null;
    const scheduled = plan !== null;
    const plannedEndAt = plan ? new Date(plan.endMs) : undefined;
    const { risk, reason } = classifyRisk({
      plannedEndAt,
      dueDate: order.dueDate,
      now,
      tz,
      hasShortage: shortage !== null,
      shortage,
      scheduled,
      horizonEnd,
      lastMachineCode: plan?.lastMachineCode ?? null,
      isWorkingDay: workingDayPredicate,
    });
    if (risk === "DELAYED" || risk === "LATE") {
      conflicts.push({ type: "DEADLINE_MISSED", severity: "CRITICAL", orderId: order.id, message: `${order.orderNumber}: ${reason}`, details: { risk } });
    } else if (risk === "AT_RISK") {
      conflicts.push({ type: "DEADLINE_AT_RISK", severity: "WARNING", orderId: order.id, message: `${order.orderNumber}: ${reason}`, details: { risk } });
    }
    return {
      plannedStartAt: plan ? new Date(plan.startMs) : undefined,
      plannedEndAt,
      deliveryRisk: risk,
      riskReason: reason ?? undefined,
      scheduled,
    };
  };
  for (const order of candidates) {
    const plan = plans.find((p) => p.order.id === order.id) ?? null;
    orderResults[order.id] = riskFor(order, plan);
  }

  // ---- machine load (§2.7) -------------------------------------------------------------------------------------
  const loads: MachineLoad[] = [];
  for (const m of input.machines.slice().sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))) {
    const state = machineState(m);
    const availableMinutes = totalMinutes(state.capacity);
    // Minutes inside working time (planned + fixed) plus the minutes fixed entries claim OUTSIDE working time
    // (a locked entry dragged into the night still needs the machine), both clipped to [now, horizonEnd).
    let occupiedMinutes = 0;
    for (const o of state.occupied) occupiedMinutes += coveredMinutes(state.capacity, o.s, o.e);
    for (const e of fixedByMachine.get(m.id) ?? []) {
      const b = busyInterval(e, nowMs);
      const span = { s: Math.max(b.s, nowMs), e: Math.min(b.e, horizonEndMs) };
      if (span.e <= span.s) continue;
      occupiedMinutes += Math.round((span.e - span.s) / 60_000) - coveredMinutes(state.capacity, span.s, span.e);
    }
    const utilisationPercent = availableMinutes > 0 ? Math.round((occupiedMinutes / availableMinutes) * 100) : occupiedMinutes > 0 ? 100 : 0;
    loads.push({ machineId: m.id, availableMinutes, occupiedMinutes, utilisationPercent });
    if (m.status === "ACTIVE" && occupiedMinutes > availableMinutes) {
      conflicts.push({
        type: "MACHINE_OVERLOAD",
        severity: "WARNING",
        machineId: m.id,
        message: `${m.code} is loaded at ${utilisationPercent} % of its available time over the ${horizonDays}-day horizon`,
        details: { utilisationPercent, occupiedMinutes, availableMinutes },
      });
    }
  }

  return {
    entries,
    conflicts,
    orders: orderResults,
    stats: {
      ordersConsidered: candidates.length,
      ordersScheduled: plans.length,
      machinesUsed: machinesUsed.size,
      horizonEnd,
    },
    loads,
  };
}
