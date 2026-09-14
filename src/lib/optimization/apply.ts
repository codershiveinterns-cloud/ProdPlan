/**
 * Applying / dismissing an optimization suggestion (docs/M3_SPEC.md §3). Both mutate `OptimizationSuggestion` rows
 * PENDING → APPLIED | DISMISSED | STALE — never any other transition (append-only otherwise, per §1).
 *
 * `applySuggestion()` re-verifies the suggestion is still valid (re-runs `generateSuggestions()` against the LIVE
 * schedule) before applying, so a suggestion that has gone stale since it was generated (someone else moved an
 * entry, ran the schedule, or the order changed) is caught instead of silently applied. It then applies through
 * the SAME primitives the board already uses — `moveEntry()` (place + lock + `runSchedule`) for REASSIGN_MACHINE,
 * a plain `Order.priority` update + `runSchedule()` for REPRIORITIZE — rather than re-implementing either.
 */
import { addDays, startOfDayInTz, todayInTz } from "@/lib/dates";
import type { Session } from "@/lib/auth/guards";
import { audit, type AuditCtx } from "@/lib/audit";
import type { TenantDb } from "@/lib/db";
import { DomainError, NotFoundError } from "@/lib/errors";
import { optimizationApplied } from "@/lib/notifications/events";
import { notify } from "@/lib/notifications/service";
import { moveEntry } from "@/lib/scheduling/move";
import { loadEngineInput, runSchedule, type ScheduleRunResult } from "@/lib/scheduling/run";
import { scheduleOrders } from "@/lib/scheduling/engine";
import type { ScheduleTrigger } from "@/lib/scheduling/types";
import { generateSuggestions } from "./suggest";

// docs/M3_SPEC.md §3: "calls runSchedule(trigger:'optimization')". `ScheduleTrigger` (src/lib/scheduling/types.ts)
// is outside this module's owned paths (see M3_SPEC.md §13 "Engineer A"), so it still only lists
// "manual" | "move" | "status" | "seed" — the cast below is safe at runtime (ScheduleRun.trigger is a free-form
// string column, not an enum) but ideally `types.ts` gains an "optimization" member; flagged in the build report.
const OPTIMIZATION_TRIGGER = "optimization" as ScheduleTrigger;

async function reverify(db: TenantDb, session: Session, now: Date): Promise<ReturnType<typeof generateSuggestions>> {
  const tz = session.tenant.timezone;
  const tenant = await db.tenant.findFirstOrThrow({ select: { scheduleHorizonDays: true, defaultCalendarId: true } });
  const horizonDays = tenant.scheduleHorizonDays;
  const horizonEnd = startOfDayInTz(addDays(todayInTz(tz, now), horizonDays), tz);
  const loaded = await loadEngineInput(db, now, horizonEnd);
  const opts = { now, horizonDays, tz, defaultCalendarId: loaded.tenant.defaultCalendarId };
  const baseline = scheduleOrders(loaded.input, opts);
  return generateSuggestions(loaded.input, baseline, opts);
}

/** `true` iff this call actually claimed the transition (the suggestion was still PENDING) — guards concurrent callers. */
async function claimStatus(db: TenantDb, id: string, data: { status: "STALE" | "APPLIED" | "DISMISSED"; [k: string]: unknown }): Promise<boolean> {
  const result = await db.optimizationSuggestion.updateMany({ where: { id, status: "PENDING" }, data });
  return result.count === 1;
}

async function markStale(db: TenantDb, ctx: AuditCtx, suggestion: { id: string; summary: string }): Promise<void> {
  const claimed = await claimStatus(db, suggestion.id, { status: "STALE" });
  if (!claimed) return; // someone else already resolved it concurrently — nothing to record
  await db.$transaction(async (tx) => {
    await audit(tx, ctx, {
      entityType: "OptimizationSuggestion",
      entityId: suggestion.id,
      entityLabel: suggestion.summary,
      action: "STATUS_CHANGE",
      before: { status: "PENDING" },
      after: { status: "STALE" },
      summary: `${suggestion.summary} — no longer improves the schedule, marked stale`,
    });
  });
}

/**
 * Loads the `PENDING` suggestion, re-verifies it (or an equivalent suggestion for the same order/kind) still
 * improves the live schedule — marking it `STALE` and throwing a `DomainError` otherwise — then applies it and
 * marks it `APPLIED`. Returns the `ScheduleRunResult` of the `runSchedule()` call the application triggers.
 */
export async function applySuggestion(db: TenantDb, session: Session, ctx: AuditCtx, suggestionId: string): Promise<ScheduleRunResult> {
  const suggestion = await db.optimizationSuggestion.findUnique({
    where: { id: suggestionId },
    include: { order: { select: { orderNumber: true } } },
  });
  if (!suggestion) throw new NotFoundError("Suggestion not found.");
  if (suggestion.status !== "PENDING") {
    throw new DomainError("This suggestion is no longer pending.", "suggestion_not_pending", 409);
  }

  const now = new Date();
  const fresh = await reverify(db, session, now);
  const stillValid = fresh.some((s) => s.orderId === suggestion.orderId && s.kind === suggestion.kind);
  if (!stillValid) {
    await markStale(db, ctx, suggestion);
    throw new DomainError("This suggestion no longer improves the schedule and was marked stale.", "suggestion_stale", 409);
  }

  let entry: { plannedStartAt: Date } | null = null;
  if (suggestion.kind === "REASSIGN_MACHINE") {
    if (!suggestion.entryId || !suggestion.toMachineId) {
      await markStale(db, ctx, suggestion);
      throw new DomainError("This suggestion's operation is no longer scheduled and was marked stale.", "suggestion_stale", 409);
    }
    entry = await db.scheduleEntry.findUnique({ where: { id: suggestion.entryId }, select: { plannedStartAt: true } });
    if (!entry) {
      await markStale(db, ctx, suggestion);
      throw new DomainError("This suggestion's operation no longer exists and was marked stale.", "suggestion_stale", 409);
    }
  } else if (!suggestion.toPriority) {
    await markStale(db, ctx, suggestion);
    throw new DomainError("This suggestion is missing a target priority and was marked stale.", "suggestion_stale", 409);
  }

  // Atomically claim PENDING → APPLIED *right before* touching the schedule, now that every pre-check has passed:
  // a `where: { status: "PENDING" }` guarded update means only one concurrent caller (double-click, two admins) can
  // win this race. The loser sees count 0 and bails out without moving anything or running the schedule again.
  const claimed = await claimStatus(db, suggestion.id, { status: "APPLIED", appliedById: session.user.id, appliedAt: now });
  if (!claimed) {
    throw new DomainError("This suggestion is no longer pending.", "suggestion_not_pending", 409);
  }

  let runResult: ScheduleRunResult;
  if (suggestion.kind === "REASSIGN_MACHINE") {
    const move = await moveEntry(db, session, ctx, {
      entryId: suggestion.entryId!,
      machineId: suggestion.toMachineId!,
      plannedStartAt: entry!.plannedStartAt,
    });
    runResult = move.run;
  } else {
    await db.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: suggestion.orderId }, select: { priority: true, orderNumber: true } });
      if (!order) throw new NotFoundError("Order not found.");
      await tx.order.update({ where: { id: suggestion.orderId }, data: { priority: suggestion.toPriority! } });
      await audit(tx, ctx, {
        entityType: "Order",
        entityId: suggestion.orderId,
        entityLabel: order.orderNumber,
        action: "UPDATE",
        before: { priority: order.priority },
        after: { priority: suggestion.toPriority },
        summary: `Order ${order.orderNumber} priority raised to ${suggestion.toPriority} by an optimization suggestion`,
      });
    });
    runResult = await runSchedule(db, session, ctx, { trigger: OPTIMIZATION_TRIGGER });
  }

  await db.$transaction(async (tx) => {
    await audit(tx, ctx, {
      entityType: "OptimizationSuggestion",
      entityId: suggestion.id,
      entityLabel: suggestion.summary,
      action: "STATUS_CHANGE",
      before: { status: "PENDING" },
      after: { status: "APPLIED" },
      summary: `${suggestion.summary} applied`,
    });
    await notify(
      tx,
      optimizationApplied({
        tenantId: session.tenant.id,
        actorUserId: session.user.id,
        suggestionId: suggestion.id,
        orderId: suggestion.orderId,
        orderNumber: suggestion.order.orderNumber,
        summary: suggestion.summary,
      }),
    );
  });

  return runResult;
}

/** Sets the `PENDING` suggestion to `DISMISSED` (audited); no re-verification or schedule change. */
export async function dismissSuggestion(db: TenantDb, session: Session, ctx: AuditCtx, suggestionId: string): Promise<void> {
  const suggestion = await db.optimizationSuggestion.findUnique({ where: { id: suggestionId } });
  if (!suggestion) throw new NotFoundError("Suggestion not found.");
  if (suggestion.status !== "PENDING") {
    throw new DomainError("This suggestion is no longer pending.", "suggestion_not_pending", 409);
  }

  // Same atomic PENDING-guarded claim as applySuggestion: a plain `update({ where: { id } })` would re-apply
  // unconditionally after a concurrent apply/dismiss commits, double-writing the audit trail.
  const claimed = await claimStatus(db, suggestionId, { status: "DISMISSED", dismissedById: session.user.id, dismissedAt: new Date() });
  if (!claimed) {
    throw new DomainError("This suggestion is no longer pending.", "suggestion_not_pending", 409);
  }

  await db.$transaction(async (tx) => {
    await audit(tx, ctx, {
      entityType: "OptimizationSuggestion",
      entityId: suggestionId,
      entityLabel: suggestion.summary,
      action: "STATUS_CHANGE",
      before: { status: "PENDING" },
      after: { status: "DISMISSED" },
      summary: `${suggestion.summary} dismissed`,
    });
  });
}
