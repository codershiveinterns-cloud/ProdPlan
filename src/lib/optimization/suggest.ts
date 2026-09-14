/**
 * AI-assisted schedule optimization (docs/M3_SPEC.md §3): pure, deterministic, in-memory. `generateSuggestions()`
 * re-runs the existing `scheduleOrders()` engine (docs/M2_SPEC.md §2, `src/lib/scheduling/engine.ts`) against
 * cheaply perturbed copies of the same `EngineInput` a normal run would use — it never mutates the database, so it
 * is safe to call from a page render. Two kinds of perturbation, tried for up to `MAX_CANDIDATES` open orders that
 * are not `ON_TRACK` in the `baseline` result:
 *
 *   REASSIGN_MACHINE — pin an order's first free-choice routing step to each other ACTIVE machine in its work
 *                       center in turn, keep the best strictly-improving choice.
 *   REPRIORITIZE      — bump the order one priority tier (capped at URGENT), keep it if it improves without
 *                        making any order that was ON_TRACK in the baseline stop being ON_TRACK.
 *
 * A candidate is kept only when it reduces the WHOLE PLAN's total late-minutes (sum over LATE/DELAYED orders of
 * `max(0, plannedEnd − dueEnd)`) by at least `MIN_IMPROVEMENT_MINUTES`, and never at the cost of regressing an
 * order that was on track. The final list is capped at `MAX_SUGGESTIONS`, sorted by late-minutes saved (desc).
 */
import type { OrderPriority } from "@/generated/prisma/enums";
import { endOfDayInTz } from "@/lib/dates";
import { humanDuration } from "@/lib/scheduling/risk";
import { sortCandidates, scheduleOrders } from "@/lib/scheduling/engine";
import type { EngineInput, EngineMachine, EngineOptions, EngineOrder, EngineResult } from "@/lib/scheduling/types";
import { PRIORITY_LABELS } from "@/lib/orders/status";
import type { Suggestion } from "./types";

/** Up to this many not-ON_TRACK candidate orders are tried (docs/M3_SPEC.md §3). */
export const MAX_CANDIDATES = 20;
/** Minimum reduction in total late-minutes for a perturbation to be kept. */
export const MIN_IMPROVEMENT_MINUTES = 15;
/** Suggestions returned, sorted by projected minutes saved (desc). */
export const MAX_SUGGESTIONS = 8;

export type GenerateSuggestionsOptions = EngineOptions;

const PRIORITY_UP: Record<OrderPriority, OrderPriority> = { LOW: "NORMAL", NORMAL: "HIGH", HIGH: "URGENT", URGENT: "URGENT" };

/** Total minutes of lateness across LATE/DELAYED orders, `max(0, plannedEnd − dueEnd)` each (docs/M3_SPEC.md §3). */
export function totalLateMinutes(result: EngineResult, orders: readonly EngineOrder[], tz: string): number {
  const byId = new Map(orders.map((o) => [o.id, o]));
  let total = 0;
  for (const [orderId, r] of Object.entries(result.orders)) {
    if (r.deliveryRisk !== "LATE" && r.deliveryRisk !== "DELAYED") continue;
    if (!r.plannedEndAt) continue;
    const order = byId.get(orderId);
    if (!order) continue;
    const dueEnd = endOfDayInTz(order.dueDate, tz);
    total += Math.max(0, Math.round((r.plannedEndAt.getTime() - dueEnd.getTime()) / 60_000));
  }
  return total;
}

/** True when some order that was ON_TRACK in `baseline` is no longer ON_TRACK in `perturbed` (spec's "reject if it breaks another order" rule), ignoring `excludeOrderId` (the order the suggestion is FOR). */
export function breaksAnotherOrder(baseline: EngineResult, perturbed: EngineResult, excludeOrderId: string): boolean {
  for (const [orderId, before] of Object.entries(baseline.orders)) {
    if (orderId === excludeOrderId || before.deliveryRisk !== "ON_TRACK") continue;
    const after = perturbed.orders[orderId];
    if (after && after.deliveryRisk !== "ON_TRACK") return true;
  }
  return false;
}

function pinStepMachine(input: EngineInput, orderId: string, sequence: number, machineId: string): EngineInput {
  return {
    ...input,
    orders: input.orders.map((o) =>
      o.id === orderId ? { ...o, routing: o.routing.map((s) => (s.sequence === sequence ? { ...s, machineId } : s)) } : o,
    ),
  };
}

function bumpPriority(input: EngineInput, orderId: string, to: OrderPriority): EngineInput {
  return { ...input, orders: input.orders.map((o) => (o.id === orderId ? { ...o, priority: to } : o)) };
}

function savedLabel(minutes: number): string {
  return humanDuration(minutes * 60_000);
}

function conflictsClause(baselineConflicts: number, projectedConflicts: number): string {
  const fewer = baselineConflicts - projectedConflicts;
  if (fewer <= 0) return "";
  return `, ${fewer} fewer conflict${fewer === 1 ? "" : "s"}`;
}

function tryReassignMachine(
  order: EngineOrder,
  input: EngineInput,
  baseline: EngineResult,
  opts: GenerateSuggestionsOptions,
  machinesByWorkCenter: ReadonlyMap<string, readonly EngineMachine[]>,
  baselineLateMinutes: number,
): Suggestion | null {
  const fixedSequences = new Set(
    [...input.lockedEntries, ...input.inProgressEntries].filter((e) => e.orderId === order.id).map((e) => e.sequence),
  );
  const completed = new Set(order.completedSequences);
  const step = order.routing
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .find((s) => !s.machineId && !completed.has(s.sequence) && !fixedSequences.has(s.sequence));
  if (!step) return null;

  const candidateMachines = machinesByWorkCenter.get(step.workCenterId) ?? [];
  if (candidateMachines.length < 2) return null;

  const currentEntry = baseline.entries.find((e) => e.orderId === order.id && e.sequence === step.sequence);
  const currentMachine = currentEntry ? candidateMachines.find((m) => m.id === currentEntry.machineId) : undefined;

  let best: { machine: EngineMachine; result: EngineResult; lateMinutes: number } | null = null;
  for (const machine of candidateMachines) {
    if (machine.id === currentEntry?.machineId) continue;
    const perturbed = scheduleOrders(pinStepMachine(input, order.id, step.sequence, machine.id), opts);
    if (breaksAnotherOrder(baseline, perturbed, order.id)) continue;
    const lateMinutes = totalLateMinutes(perturbed, input.orders, opts.tz);
    if (baselineLateMinutes - lateMinutes < MIN_IMPROVEMENT_MINUTES) continue;
    const better =
      !best ||
      lateMinutes < best.lateMinutes ||
      (lateMinutes === best.lateMinutes && perturbed.conflicts.length < best.result.conflicts.length) ||
      (lateMinutes === best.lateMinutes && perturbed.conflicts.length === best.result.conflicts.length && machine.code < best.machine.code);
    if (better) best = { machine, result: perturbed, lateMinutes };
  }
  if (!best) return null;

  const savedMinutes = baselineLateMinutes - best.lateMinutes;
  const fromLabel = currentMachine ? currentMachine.code : "its current machine";
  return {
    kind: "REASSIGN_MACHINE",
    orderId: order.id,
    orderNumber: order.orderNumber,
    sequence: step.sequence,
    fromMachineId: currentMachine?.id ?? null,
    fromMachineCode: currentMachine?.code ?? null,
    toMachineId: best.machine.id,
    toMachineCode: best.machine.code,
    fromPriority: null,
    toPriority: null,
    currentConflicts: baseline.conflicts.length,
    projectedConflicts: best.result.conflicts.length,
    currentLateMinutes: baselineLateMinutes,
    projectedLateMinutes: best.lateMinutes,
    summary: `Reassign ${order.orderNumber} op ${step.sequence} to ${best.machine.code}`,
    rationale: `Moving op ${step.sequence} from ${fromLabel} to ${best.machine.code} saves ${savedLabel(savedMinutes)} of lateness${conflictsClause(baseline.conflicts.length, best.result.conflicts.length)}.`,
  };
}

function tryReprioritize(
  order: EngineOrder,
  input: EngineInput,
  baseline: EngineResult,
  opts: GenerateSuggestionsOptions,
  baselineLateMinutes: number,
): Suggestion | null {
  const to = PRIORITY_UP[order.priority];
  if (to === order.priority) return null;

  const perturbed = scheduleOrders(bumpPriority(input, order.id, to), opts);
  if (breaksAnotherOrder(baseline, perturbed, order.id)) return null;
  const lateMinutes = totalLateMinutes(perturbed, input.orders, opts.tz);
  const savedMinutes = baselineLateMinutes - lateMinutes;
  if (savedMinutes < MIN_IMPROVEMENT_MINUTES) return null;

  return {
    kind: "REPRIORITIZE",
    orderId: order.id,
    orderNumber: order.orderNumber,
    sequence: null,
    fromMachineId: null,
    fromMachineCode: null,
    toMachineId: null,
    toMachineCode: null,
    fromPriority: order.priority,
    toPriority: to,
    currentConflicts: baseline.conflicts.length,
    projectedConflicts: perturbed.conflicts.length,
    currentLateMinutes: baselineLateMinutes,
    projectedLateMinutes: lateMinutes,
    summary: `Raise ${order.orderNumber} priority to ${PRIORITY_LABELS[to]}`,
    rationale: `Raising priority from ${PRIORITY_LABELS[order.priority]} to ${PRIORITY_LABELS[to]} lets it schedule sooner, saving ${savedLabel(savedMinutes)} of lateness${conflictsClause(baseline.conflicts.length, perturbed.conflicts.length)}.`,
  };
}

/**
 * Generates up to `MAX_SUGGESTIONS` deterministic, explainable optimization suggestions for `input`, given its
 * already-computed `baseline` result. Pure and read-only — never touches the database.
 */
export function generateSuggestions(input: EngineInput, baseline: EngineResult, opts: GenerateSuggestionsOptions): Suggestion[] {
  const machinesByWorkCenter = new Map<string, EngineMachine[]>();
  for (const m of input.machines) {
    if (m.status !== "ACTIVE") continue;
    const list = machinesByWorkCenter.get(m.workCenterId) ?? [];
    list.push(m);
    machinesByWorkCenter.set(m.workCenterId, list);
  }
  for (const list of machinesByWorkCenter.values()) list.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));

  const baselineLateMinutes = totalLateMinutes(baseline, input.orders, opts.tz);

  const candidates = sortCandidates(input.orders)
    .filter((o) => baseline.orders[o.id] && baseline.orders[o.id]!.deliveryRisk !== "ON_TRACK")
    .slice(0, MAX_CANDIDATES);

  const suggestions: Suggestion[] = [];
  for (const order of candidates) {
    const reassign = tryReassignMachine(order, input, baseline, opts, machinesByWorkCenter, baselineLateMinutes);
    if (reassign) suggestions.push(reassign);
    const reprioritize = tryReprioritize(order, input, baseline, opts, baselineLateMinutes);
    if (reprioritize) suggestions.push(reprioritize);
  }

  suggestions.sort(
    (a, b) =>
      (b.currentLateMinutes - b.projectedLateMinutes) - (a.currentLateMinutes - a.projectedLateMinutes) ||
      a.projectedConflicts - b.projectedConflicts,
  );
  return suggestions.slice(0, MAX_SUGGESTIONS);
}
