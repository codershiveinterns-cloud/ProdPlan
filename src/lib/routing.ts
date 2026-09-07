/**
 * Routing helpers (docs/M1_SPEC.md §4 "Routing").
 *
 * Operation `sequence` is stored as 10, 20, 30 …; add/reorder runs a renumber in one transaction that first sets the
 * affected rows to negative temporaries, then to their final values, so `@@unique([tenantId, productId, sequence])`
 * is never violated mid-way. `planRenumber` produces that two-phase plan; the caller executes it.
 */

export const SEQUENCE_STEP = 10;

export type SequenceRow = { id: string; sequence: number };
export type MoveDirection = "up" | "down";
export type RenumberStep = { id: string; tempSequence: number; finalSequence: number };

/** Stable sort by sequence (ties keep input order). */
export function sortBySequence<T extends SequenceRow>(rows: readonly T[]): T[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => a.row.sequence - b.row.sequence || a.index - b.index)
    .map((x) => x.row);
}

/** True when `id` can move one step in `direction` (i.e. it is not already first/last). */
export function canMove(rows: readonly SequenceRow[], id: string, direction: MoveDirection): boolean {
  const sorted = sortBySequence(rows);
  const idx = sorted.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  return direction === "up" ? idx > 0 : idx < sorted.length - 1;
}

/**
 * Plans a renumber of all rows to 10, 20, 30 … in their current order, optionally after moving one row up/down by a
 * single step. Moving the first row up (or the last row down) is a no-op on the order. Unknown `move.id` throws.
 *
 * Execute as: for each step `update({ where: { id }, data: { sequence: tempSequence } })`, then for each step
 * `update({ data: { sequence: finalSequence } })` — both phases inside the same transaction.
 */
export function planRenumber(
  currentSequences: readonly SequenceRow[],
  move?: { id: string; direction: MoveDirection },
): RenumberStep[] {
  const ordered = sortBySequence(currentSequences);
  if (move) {
    const idx = ordered.findIndex((r) => r.id === move.id);
    if (idx === -1) throw new RangeError(`planRenumber: unknown operation id ${move.id}`);
    const target = move.direction === "up" ? idx - 1 : idx + 1;
    if (target >= 0 && target < ordered.length) {
      const tmp = ordered[idx];
      ordered[idx] = ordered[target];
      ordered[target] = tmp;
    }
  }
  return ordered.map((row, i) => ({
    id: row.id,
    tempSequence: -(i + 1),
    finalSequence: (i + 1) * SEQUENCE_STEP,
  }));
}

/** Next free sequence for a new operation: max + 10 (10 for an empty routing). */
export function nextSequence(existing: ReadonlyArray<number | SequenceRow>): number {
  let max = 0;
  for (const e of existing) {
    const seq = typeof e === "number" ? e : e.sequence;
    if (Number.isFinite(seq) && seq > max) max = seq;
  }
  return Math.floor(max / SEQUENCE_STEP) * SEQUENCE_STEP + SEQUENCE_STEP;
}

type NumericInput = number | string | { toString(): string };
const num = (v: NumericInput) => (typeof v === "number" ? v : Number(String(v)));

/**
 * Operation duration on a machine: `(setupMinutes + quantity × runMinutesPerUnit) × 100 / efficiencyPercent`,
 * rounded to 1 decimal. `efficiencyPercent` defaults to 100 (the routing preview on order detail shows 100 %).
 */
export function operationMinutes(
  setupMinutes: NumericInput,
  quantity: NumericInput,
  runMinutesPerUnit: NumericInput,
  efficiencyPercent: NumericInput = 100,
): number {
  const setup = num(setupMinutes);
  const qty = num(quantity);
  const run = num(runMinutesPerUnit);
  const eff = num(efficiencyPercent);
  if (![setup, qty, run, eff].every(Number.isFinite) || eff <= 0) {
    throw new RangeError("operationMinutes: invalid input");
  }
  const raw = ((setup + qty * run) * 100) / eff;
  return Math.round(Number((raw * 10).toPrecision(15))) / 10;
}

/** Total minutes for a whole routing at the given efficiency (1 dp). */
export function routingMinutes(
  operations: ReadonlyArray<{ setupMinutes: NumericInput; runMinutesPerUnit: NumericInput }>,
  quantity: NumericInput,
  efficiencyPercent: NumericInput = 100,
): number {
  const total = operations.reduce(
    (sum, op) => sum + operationMinutes(op.setupMinutes, quantity, op.runMinutesPerUnit, efficiencyPercent),
    0,
  );
  return Math.round(Number((total * 10).toPrecision(15))) / 10;
}
