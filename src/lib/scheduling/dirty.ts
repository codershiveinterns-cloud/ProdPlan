/**
 * "Schedule is out of date" bookkeeping (docs/M2_SPEC.md §2 `scheduleDirty`).
 *
 * `markScheduleDirty(tx, …)` is called by every mutation that invalidates the plan (order create/edit/import/status,
 * machine/calendar/downtime/routing/stock edits, operation actuals deviating from plan). `runSchedule()` clears the
 * flag on the orders it considered. Both helpers only ever touch OPEN orders.
 */
import type { OrderStatus } from "@/generated/prisma/enums";
import type { TenantDb, TenantTx } from "@/lib/db";

export const OPEN_ORDER_STATUSES = ["QUEUED", "IN_PROGRESS", "ON_HOLD"] as const satisfies readonly OrderStatus[];

export type MarkDirtyScope = { orderIds: string[]; all?: undefined } | { all: true; orderIds?: undefined };

/** Flags open orders (all, or the given ids) so the board shows the "Run schedule" banner. Returns the row count. */
export async function markScheduleDirty(tx: TenantTx | TenantDb, scope: MarkDirtyScope): Promise<number> {
  if (scope.all !== true && scope.orderIds.length === 0) return 0;
  const result = await tx.order.updateMany({
    where: {
      status: { in: [...OPEN_ORDER_STATUSES] },
      scheduleDirty: false,
      ...(scope.all === true ? {} : { id: { in: scope.orderIds } }),
    },
    data: { scheduleDirty: true },
  });
  return result.count;
}

export type ScheduleDirtyState = {
  /** True when any open order is dirty or the plant has never been scheduled. */
  dirty: boolean;
  dirtyCount: number;
  lastRunAt: Date | null;
};

export async function isScheduleDirty(db: TenantDb | TenantTx): Promise<ScheduleDirtyState> {
  const [dirtyCount, tenant] = await Promise.all([
    db.order.count({ where: { status: { in: [...OPEN_ORDER_STATUSES] }, scheduleDirty: true } }),
    db.tenant.findFirst({ select: { lastScheduleRunAt: true } }),
  ]);
  const lastRunAt = tenant?.lastScheduleRunAt ?? null;
  return { dirty: dirtyCount > 0 || lastRunAt === null, dirtyCount, lastRunAt };
}

/** Resolves every open conflict of an order (call when an order is completed or cancelled). Returns the count. */
export async function resolveOrderConflicts(tx: TenantTx | TenantDb, orderId: string, now: Date = new Date()): Promise<number> {
  const result = await tx.scheduleConflict.updateMany({
    where: { orderId, resolvedAt: null },
    data: { resolvedAt: now },
  });
  return result.count;
}
