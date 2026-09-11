/**
 * `runSchedule()` — loads the engine inputs through the tenant-scoped client, calls the pure engine and persists the
 * result in ONE transaction (docs/M2_SPEC.md §2 "run.ts"):
 *
 *   1. a ScheduleRun row is created (RUNNING) BEFORE the transaction so a failure can be recorded as FAILED;
 *   2. inside the transaction: delete the unlocked, not-started entries of the considered orders; insert the new
 *      entries (with runId); resolve the open conflicts of those orders (+ machine-level ones) and insert the new
 *      conflicts; update each considered order's planned window / risk / scheduledAt / scheduleDirty=false;
 *      Tenant.lastScheduleRunAt; the ScheduleRun row (COMPLETED + stats); one audit row; then the notifier hook.
 *
 * Notifications (docs/M2_SPEC.md §5) are fanned out directly, inside the same transaction, via
 * `notify()`/the event builders in `@/lib/notifications`: "schedule updated" (ADMIN+PLANNER), each new CRITICAL
 * conflict and each MATERIAL_SHORTAGE (any severity), and each order whose delivery risk changed (builder returns
 * null — skipped — for ON_TRACK). `setScheduleNotifier()` / `opts.notifier` remain available as an extra hook (also
 * given the same `ScheduleRunEvent`) for callers that want to react to a run beyond the built-in notifications.
 */
import type { Prisma } from "@/generated/prisma/client";
import type { ConflictSeverity, ConflictType, DeliveryRisk, OperationStatus } from "@/generated/prisma/enums";
import { audit, type AuditCtx } from "@/lib/audit";
import type { Session } from "@/lib/auth/guards";
import type { Calendar, Downtime } from "@/lib/calendar";
import { addDays, startOfDayInTz, toDateOnly, todayInTz } from "@/lib/dates";
import type { TenantDb, TenantTx } from "@/lib/db";
import { logger } from "@/lib/logger";
import { conflictDetected, deliveryRiskChanged, scheduleRunFinished, type ConflictSubject } from "@/lib/notifications/events";
import { notify } from "@/lib/notifications/service";
import { OPEN_ORDER_STATUSES } from "./dirty";
import { MAX_HORIZON_DAYS, scheduleOrders } from "./engine";
import type { EngineEntry, EngineInput, EngineMachine, EngineOrder, EngineStats, ScheduleTrigger } from "./types";

// ---------------------------------------------------------------------------------------------------------------
// Notifier hook (implemented by src/lib/notifications — never imported from here)
// ---------------------------------------------------------------------------------------------------------------

export type PersistedConflict = {
  id: string;
  type: ConflictType;
  severity: ConflictSeverity;
  orderId: string | null;
  orderNumber: string | null;
  machineId: string | null;
  machineCode: string | null;
  materialId: string | null;
  materialCode: string | null;
  entryId: string | null;
  message: string;
};

export type RiskChange = {
  orderId: string;
  orderNumber: string;
  from: DeliveryRisk;
  to: DeliveryRisk;
  reason: string | null;
};

/**
 * Payload handed to the notifier INSIDE the run transaction (docs/M2_SPEC.md §5):
 *  - "Schedule updated — 18 orders, 3 conflicts" → ADMIN + PLANNER, href /schedule (`stats`);
 *  - each new CRITICAL conflict and each MATERIAL_SHORTAGE (`conflicts`, dedupe `conflict:<type>:<orderId|machineId|materialId>`);
 *  - each order whose risk changed to AT_RISK / DELAYED / LATE (`changedRisks`, dedupe `risk:<orderId>:<risk>`).
 * `actorUserId` is the user who triggered the run (null for seed/system) — the actor never notifies themself.
 */
export type ScheduleRunEvent = {
  tenantId: string;
  runId: string;
  trigger: ScheduleTrigger;
  actorUserId: string | null;
  stats: EngineStats;
  /** Conflicts inserted by THIS run (open). */
  conflicts: PersistedConflict[];
  changedRisks: RiskChange[];
};

export type ScheduleNotifier = (tx: TenantTx, event: ScheduleRunEvent) => Promise<void>;

let globalNotifier: ScheduleNotifier | null = null;

/** Registers the notification fan-out used by every `runSchedule()` call that does not pass its own `notifier`. */
export function setScheduleNotifier(fn: ScheduleNotifier | null): void {
  globalNotifier = fn;
}

export function getScheduleNotifier(): ScheduleNotifier | null {
  return globalNotifier;
}

// ---------------------------------------------------------------------------------------------------------------
// Options / result
// ---------------------------------------------------------------------------------------------------------------

export type RunScheduleOptions = {
  trigger: ScheduleTrigger;
  /** Defaults to Tenant.scheduleHorizonDays. */
  horizonDays?: number;
  /** Injectable clock (tests, seed). */
  now?: Date;
  notifier?: ScheduleNotifier | null;
};

export type ScheduleRunResult = {
  runId: string;
  status: "COMPLETED";
  stats: EngineStats;
  horizonDays: number;
  entriesCreated: number;
  conflicts: PersistedConflict[];
  changedRisks: RiskChange[];
  durationMs: number;
};

const TX_OPTIONS = { timeout: 60_000, maxWait: 10_000 } as const;

const STARTED_STATUSES: readonly OperationStatus[] = ["IN_PROGRESS", "COMPLETED"];

/** An entry the engine must not move: locked, started (IN_PROGRESS/COMPLETED) or paused after it started. */
export function isFixedEntry(e: { locked: boolean; status: OperationStatus; actualStartAt: Date | null }): boolean {
  return e.locked || STARTED_STATUSES.includes(e.status) || (e.status === "ON_HOLD" && e.actualStartAt !== null);
}

export function runSummary(stats: Pick<EngineStats, "ordersScheduled">, conflictCount: number): string {
  const orders = `${stats.ordersScheduled} ${stats.ordersScheduled === 1 ? "order" : "orders"}`;
  const conflicts = `${conflictCount} ${conflictCount === 1 ? "conflict" : "conflicts"}`;
  return `Scheduled ${orders}, ${conflicts}`;
}

const num = (v: { toString(): string } | number | null | undefined): number => (v == null ? 0 : Number(String(v)));

// ---------------------------------------------------------------------------------------------------------------
// Input loading
// ---------------------------------------------------------------------------------------------------------------

type LoadedInput = {
  input: EngineInput;
  orders: { id: string; orderNumber: string; deliveryRisk: DeliveryRisk; riskReason: string | null; plannedStartAt: Date | null; plannedEndAt: Date | null; scheduleDirty: boolean }[];
  machinesById: Map<string, EngineMachine>;
  materialsById: Map<string, { code: string }>;
  tenant: { timezone: string; scheduleHorizonDays: number; defaultCalendarId: string | null };
};

async function loadEngineInput(db: TenantDb | TenantTx, now: Date, horizonEndHint: Date): Promise<LoadedInput> {
  const tenant = await db.tenant.findFirstOrThrow({
    select: { timezone: true, scheduleHorizonDays: true, defaultCalendarId: true },
  });

  const [machineRows, downtimeRows, orderRows, materialRows, entryRows] = await Promise.all([
    db.machine.findMany({
      select: { id: true, code: true, name: true, workCenterId: true, calendarId: true, status: true, efficiencyPercent: true, workCenter: { select: { code: true } } },
      orderBy: { code: "asc" },
    }),
    db.downtimeWindow.findMany({
      where: { endsAt: { gt: now }, startsAt: { lt: horizonEndHint } },
      select: { id: true, machineId: true, startsAt: true, endsAt: true, type: true, reason: true },
    }),
    db.order.findMany({
      where: { status: { in: ["QUEUED", "IN_PROGRESS"] } },
      select: {
        id: true,
        orderNumber: true,
        priority: true,
        dueDate: true,
        earliestStartDate: true,
        quantity: true,
        status: true,
        createdAt: true,
        deliveryRisk: true,
        riskReason: true,
        plannedStartAt: true,
        plannedEndAt: true,
        scheduleDirty: true,
        product: {
          select: {
            id: true,
            sku: true,
            name: true,
            unit: true,
            operations: { select: { id: true, sequence: true, workCenterId: true, machineId: true, setupMinutes: true, runMinutesPerUnit: true }, orderBy: { sequence: "asc" } },
            bomItems: { select: { materialId: true, quantityPerUnit: true, scrapPercent: true } },
          },
        },
      },
    }),
    db.material.findMany({ select: { id: true, code: true, name: true, unit: true, stockOnHand: true } }),
    db.scheduleEntry.findMany({
      where: { order: { status: { in: [...OPEN_ORDER_STATUSES] } } },
      select: {
        id: true,
        orderId: true,
        operationId: true,
        sequence: true,
        workCenterId: true,
        machineId: true,
        plannedStartAt: true,
        plannedEndAt: true,
        plannedMinutes: true,
        actualStartAt: true,
        actualEndAt: true,
        status: true,
        locked: true,
      },
    }),
  ]);

  const calendarIds = [...new Set(machineRows.map((m) => m.calendarId))];
  const calendarRows = calendarIds.length
    ? await db.shiftCalendar.findMany({ where: { id: { in: calendarIds } }, include: { shifts: true, exceptions: true } })
    : [];
  const calendars: Record<string, Calendar> = {};
  for (const c of calendarRows) {
    calendars[c.id] = {
      id: c.id,
      name: c.name,
      shifts: c.shifts.map((s) => ({ id: s.id, name: s.name, startTime: s.startTime, endTime: s.endTime, daysOfWeek: s.daysOfWeek, breakMinutes: s.breakMinutes })),
      exceptions: c.exceptions.map((e) => ({ date: toDateOnly(e.date), isWorking: e.isWorking, note: e.note })),
    };
  }

  const machines: EngineMachine[] = machineRows.map((m) => ({
    id: m.id,
    code: m.code,
    name: m.name,
    workCenterId: m.workCenterId,
    workCenterCode: m.workCenter.code,
    calendarId: m.calendarId,
    status: m.status,
    efficiencyPercent: m.efficiencyPercent,
  }));
  const machinesById = new Map(machines.map((m) => [m.id, m]));

  const downtime: Record<string, Downtime[]> = {};
  for (const d of downtimeRows) (downtime[d.machineId] ??= []).push({ id: d.id, startsAt: d.startsAt, endsAt: d.endsAt, type: d.type, reason: d.reason });

  const orders: EngineOrder[] = orderRows.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    priority: o.priority,
    dueDate: toDateOnly(o.dueDate),
    earliestStartDate: o.earliestStartDate ? toDateOnly(o.earliestStartDate) : null,
    quantity: num(o.quantity),
    status: o.status,
    createdAt: o.createdAt,
    product: { id: o.product.id, sku: o.product.sku, name: o.product.name, unit: o.product.unit },
    routing: o.product.operations.map((op) => ({
      operationId: op.id,
      sequence: op.sequence,
      workCenterId: op.workCenterId,
      machineId: op.machineId,
      setupMinutes: op.setupMinutes,
      runMinutesPerUnit: num(op.runMinutesPerUnit),
    })),
    bom: o.product.bomItems.map((b) => ({ materialId: b.materialId, quantityPerUnit: num(b.quantityPerUnit), scrapPercent: num(b.scrapPercent) })),
    completedSequences: [],
  }));
  const ordersById = new Map(orders.map((o) => [o.id, o]));

  const materials: EngineInput["materials"] = {};
  for (const m of materialRows) materials[m.id] = { stockOnHand: num(m.stockOnHand), unit: m.unit, code: m.code, name: m.name };

  const lockedEntries: EngineEntry[] = [];
  const inProgressEntries: EngineEntry[] = [];
  for (const e of entryRows) {
    if (!isFixedEntry(e)) continue;
    const engineEntry: EngineEntry = { ...e };
    if (STARTED_STATUSES.includes(e.status) || e.status === "ON_HOLD") inProgressEntries.push(engineEntry);
    else lockedEntries.push(engineEntry);
    if (e.status === "COMPLETED" || e.status === "SKIPPED") ordersById.get(e.orderId)?.completedSequences.push(e.sequence);
  }

  return {
    input: { orders, machines, calendars, downtime, materials, lockedEntries, inProgressEntries },
    orders: orderRows.map((o) => ({ id: o.id, orderNumber: o.orderNumber, deliveryRisk: o.deliveryRisk, riskReason: o.riskReason, plannedStartAt: o.plannedStartAt, plannedEndAt: o.plannedEndAt, scheduleDirty: o.scheduleDirty })),
    machinesById,
    materialsById: new Map(materialRows.map((m) => [m.id, { code: m.code }])),
    tenant,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// runSchedule
// ---------------------------------------------------------------------------------------------------------------

export async function runSchedule(db: TenantDb, session: Session, ctx: AuditCtx, opts: RunScheduleOptions): Promise<ScheduleRunResult> {
  const startedAt = opts.now ?? new Date();
  const wallStart = Date.now();
  const tz = session.tenant.timezone;

  const settings = await db.tenant.findFirstOrThrow({ select: { scheduleHorizonDays: true } });
  const horizonDays = Math.max(1, Math.min(MAX_HORIZON_DAYS, Math.floor(opts.horizonDays ?? settings.scheduleHorizonDays)));
  const horizonEnd = startOfDayInTz(addDays(todayInTz(tz, startedAt), horizonDays), tz);

  const run = await db.scheduleRun.create({
    data: {
      tenantId: session.tenant.id,
      status: "RUNNING",
      trigger: opts.trigger,
      triggeredById: session.user.id,
      horizonDays,
      startedAt,
    },
    select: { id: true },
  });

  const notifier = opts.notifier === undefined ? globalNotifier : opts.notifier;

  try {
    return await db.$transaction(async (tx) => {
      const loaded = await loadEngineInput(tx, startedAt, horizonEnd);
      const result = scheduleOrders(loaded.input, { now: startedAt, horizonDays, tz, defaultCalendarId: loaded.tenant.defaultCalendarId });
      const consideredIds = loaded.input.orders.map((o) => o.id);

      // 1. Replace the movable entries of the considered orders.
      if (consideredIds.length > 0) {
        await tx.scheduleEntry.deleteMany({
          where: { orderId: { in: consideredIds }, locked: false, actualStartAt: null, status: { in: ["QUEUED", "ON_HOLD"] } },
        });
      }
      const created = result.entries.length
        ? await tx.scheduleEntry.createManyAndReturn({
            data: result.entries.map((e) => ({
              tenantId: session.tenant.id,
              orderId: e.orderId,
              operationId: e.operationId,
              sequence: e.sequence,
              workCenterId: e.workCenterId,
              machineId: e.machineId,
              plannedStartAt: e.plannedStartAt,
              plannedEndAt: e.plannedEndAt,
              plannedMinutes: e.plannedMinutes,
              setupMinutes: e.setupMinutes,
              runMinutes: e.runMinutes,
              status: "QUEUED",
              runId: run.id,
            })),
            select: { id: true, orderId: true, sequence: true },
          })
        : [];
      const entryIdByRef = new Map(created.map((e) => [`${e.orderId}:${e.sequence}`, e.id]));

      // 2. Conflicts: resolve the open ones of the considered orders and the machine-level ones, insert the new ones.
      await tx.scheduleConflict.updateMany({
        where: {
          resolvedAt: null,
          OR: [{ orderId: { in: consideredIds } }, { orderId: null }],
        },
        data: { resolvedAt: startedAt },
      });
      const orderNumberById = new Map(loaded.orders.map((o) => [o.id, o.orderNumber]));
      const conflictRows = result.conflicts.map((c): Prisma.ScheduleConflictCreateManyInput => ({
        tenantId: session.tenant.id,
        runId: run.id,
        type: c.type,
        severity: c.severity,
        orderId: c.orderId ?? null,
        machineId: c.machineId ?? null,
        materialId: c.materialId ?? null,
        entryId: c.entryId ?? (c.entryRef ? (entryIdByRef.get(`${c.entryRef.orderId}:${c.entryRef.sequence}`) ?? null) : null),
        message: c.message,
        details: c.details === undefined ? undefined : (c.details as Prisma.InputJsonValue),
      }));
      const insertedConflicts = conflictRows.length
        ? await tx.scheduleConflict.createManyAndReturn({
            data: conflictRows,
            select: { id: true, type: true, severity: true, orderId: true, machineId: true, materialId: true, entryId: true, message: true },
          })
        : [];
      const conflicts: PersistedConflict[] = insertedConflicts.map((c) => ({
        ...c,
        orderNumber: c.orderId ? (orderNumberById.get(c.orderId) ?? null) : null,
        machineCode: c.machineId ? (loaded.machinesById.get(c.machineId)?.code ?? null) : null,
        materialCode: c.materialId ? (loaded.materialsById.get(c.materialId)?.code ?? null) : null,
      }));

      // 3. Orders: planned window, risk, scheduledAt, scheduleDirty = false (skipped when nothing changed).
      const changedRisks: RiskChange[] = [];
      for (const o of loaded.orders) {
        const r = result.orders[o.id];
        if (!r) continue;
        const plannedStartAt = r.plannedStartAt ?? null;
        const plannedEndAt = r.plannedEndAt ?? null;
        const riskReason = r.riskReason ?? null;
        const same =
          !o.scheduleDirty &&
          o.deliveryRisk === r.deliveryRisk &&
          o.riskReason === riskReason &&
          (o.plannedStartAt?.getTime() ?? null) === (plannedStartAt?.getTime() ?? null) &&
          (o.plannedEndAt?.getTime() ?? null) === (plannedEndAt?.getTime() ?? null);
        if (o.deliveryRisk !== r.deliveryRisk) {
          changedRisks.push({ orderId: o.id, orderNumber: o.orderNumber, from: o.deliveryRisk, to: r.deliveryRisk, reason: riskReason });
        }
        if (same) continue;
        await tx.order.update({
          where: { id: o.id },
          data: { plannedStartAt, plannedEndAt, deliveryRisk: r.deliveryRisk, riskReason, scheduledAt: startedAt, scheduleDirty: false },
        });
      }

      // 4. Tenant, run row, audit.
      const finishedAt = new Date();
      await tx.tenant.update({ where: { id: session.tenant.id }, data: { lastScheduleRunAt: startedAt } });
      const summary = runSummary(result.stats, conflicts.length);
      await tx.scheduleRun.update({
        where: { id: run.id },
        data: {
          status: "COMPLETED",
          finishedAt,
          ordersConsidered: result.stats.ordersConsidered,
          ordersScheduled: result.stats.ordersScheduled,
          conflictCount: conflicts.length,
          summary: {
            text: summary,
            horizonEnd: result.stats.horizonEnd.toISOString(),
            machinesUsed: result.stats.machinesUsed,
            entries: created.length,
            loads: result.loads,
            byType: countBy(conflicts.map((c) => c.type)),
            bySeverity: countBy(conflicts.map((c) => c.severity)),
          } satisfies Prisma.InputJsonValue,
        },
      });
      await audit(tx, ctx, {
        entityType: "ScheduleRun",
        entityId: run.id,
        entityLabel: opts.trigger,
        action: "UPDATE",
        after: { trigger: opts.trigger, horizonDays, ordersConsidered: result.stats.ordersConsidered, ordersScheduled: result.stats.ordersScheduled, conflicts: conflicts.length },
        summary,
      });

      const actorUserId = ctx.actor?.id ?? session.user.id ?? null;

      // ---- notifications (docs/M2_SPEC.md §5) --------------------------------------------------------------------
      await notify(
        tx,
        scheduleRunFinished({
          tenantId: session.tenant.id,
          actorUserId,
          runId: run.id,
          orderCount: result.stats.ordersScheduled,
          conflictCount: conflicts.length,
        }),
      );
      for (const c of conflicts) {
        if (c.severity !== "CRITICAL" && c.type !== "MATERIAL_SHORTAGE") continue;
        const subject: ConflictSubject | null = c.orderId
          ? { orderId: c.orderId, orderNumber: c.orderNumber ?? c.orderId }
          : c.machineId
            ? { machineId: c.machineId, machineCode: c.machineCode ?? c.machineId }
            : c.materialId
              ? { materialId: c.materialId, materialCode: c.materialCode ?? c.materialId }
              : null;
        if (!subject) continue;
        await notify(
          tx,
          conflictDetected({ tenantId: session.tenant.id, actorUserId, conflictId: c.id, conflictType: c.type, subject, message: c.message }),
        );
      }
      for (const r of changedRisks) {
        const input = deliveryRiskChanged({ tenantId: session.tenant.id, actorUserId, orderId: r.orderId, orderNumber: r.orderNumber, risk: r.to });
        if (input) await notify(tx, input);
      }

      const event: ScheduleRunEvent = {
        tenantId: session.tenant.id,
        runId: run.id,
        trigger: opts.trigger,
        actorUserId,
        stats: result.stats,
        conflicts,
        changedRisks,
      };
      if (notifier) await notifier(tx, event);

      return {
        runId: run.id,
        status: "COMPLETED",
        stats: result.stats,
        horizonDays,
        entriesCreated: created.length,
        conflicts,
        changedRisks,
        durationMs: Date.now() - wallStart,
      };
    }, TX_OPTIONS);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Schedule run failed", err);
    try {
      await db.scheduleRun.update({ where: { id: run.id }, data: { status: "FAILED", finishedAt: new Date(), error: message.slice(0, 2000) } });
    } catch (updateErr) {
      logger.error("Could not mark schedule run as failed", updateErr);
    }
    throw err;
  }
}

function countBy(values: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return out;
}
