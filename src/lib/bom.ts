/**
 * Bill-of-materials maths (docs/M1_SPEC.md §4 "BOM maths"). No page computes these inline.
 *
 * `quantityPerUnit` is in the material's unit per ONE product unit (no unit conversion in M1).
 *   requiredPerUnit = quantityPerUnit × (1 + scrapPercent / 100)          (3 dp)
 *   gross requirement for an order = orderQty × requiredPerUnit             (3 dp)
 *   buildable from stock = floor(min over BOM items of stockOnHand / requiredPerUnit)
 * All inputs accept numbers, numeric strings and Prisma Decimal values.
 */

export type NumericInput = number | string | { toString(): string };

/** NumericInput → finite number. Throws RangeError for anything unparsable. */
export function toNumber(v: NumericInput): number {
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (!Number.isFinite(n)) throw new RangeError(`Invalid number: ${String(v)}`);
  return n;
}

/** Rounds half away from zero to `dp` decimals, stripping binary noise first (1.0005 → 1.001, 0.1×3 → 0.3). */
export function roundTo(n: number, dp: number): number {
  if (!Number.isFinite(n)) throw new RangeError(`Invalid number: ${String(n)}`);
  const factor = 10 ** dp;
  const shifted = Number((n * factor).toPrecision(15));
  return Math.round(shifted) / factor;
}

export const round3 = (n: number): number => roundTo(n, 3);

/** Material needed per ONE product unit including scrap allowance, 3 dp. */
export function requiredPerUnit(qtyPerUnit: NumericInput, scrapPercent: NumericInput = 0): number {
  const qty = toNumber(qtyPerUnit);
  const scrap = toNumber(scrapPercent);
  return round3(qty * (1 + scrap / 100));
}

export type BomLineInput = {
  materialId: string;
  quantityPerUnit: NumericInput;
  scrapPercent?: NumericInput | null;
  stockOnHand: NumericInput;
};

export type BomRequirement = {
  materialId: string;
  requiredPerUnit: number;
  /** Gross requirement for the order (3 dp). */
  required: number;
  onHand: number;
  /** max(0, required − onHand), 3 dp. */
  shortBy: number;
  isShort: boolean;
};

/** Gross requirement of every BOM line for an order of `orderQty` product units. */
export function requirementFor(orderQty: NumericInput, items: readonly BomLineInput[]): BomRequirement[] {
  const qty = toNumber(orderQty);
  return items.map((item) => {
    const perUnit = requiredPerUnit(item.quantityPerUnit, item.scrapPercent ?? 0);
    const required = round3(qty * perUnit);
    const onHand = round3(toNumber(item.stockOnHand));
    const shortBy = Math.max(0, round3(required - onHand));
    return { materialId: item.materialId, requiredPerUnit: perUnit, required, onHand, shortBy, isShort: shortBy > 0 };
  });
}

export type BomCoverageLine = {
  materialId: string;
  requiredPerUnit: number;
  onHand: number;
  /** Units buildable from this line alone; null when the line needs nothing (requiredPerUnit = 0). */
  buildable: number | null;
};

export type BomCoverage = {
  /** floor(min over lines of onHand / requiredPerUnit); null when no line constrains (empty BOM or all zero). */
  buildable: number | null;
  /** The (first) line that determines `buildable`. */
  limitingMaterialId: string | null;
  lines: BomCoverageLine[];
};

/** "Buildable from stock" — vs unallocated stock on hand (does not net other open orders; allocation is M2). */
export function coverageFor(items: readonly BomLineInput[]): BomCoverage {
  let buildable: number | null = null;
  let limitingMaterialId: string | null = null;
  const lines: BomCoverageLine[] = items.map((item) => {
    const perUnit = requiredPerUnit(item.quantityPerUnit, item.scrapPercent ?? 0);
    const onHand = toNumber(item.stockOnHand);
    let lineBuildable: number | null = null;
    if (perUnit > 0) {
      // toPrecision strips float noise so 2.75 / 0.275 counts as 10, not 9.
      lineBuildable = Math.max(0, Math.floor(Number((onHand / perUnit).toPrecision(12))));
      if (buildable === null || lineBuildable < buildable) {
        buildable = lineBuildable;
        limitingMaterialId = item.materialId;
      }
    }
    return { materialId: item.materialId, requiredPerUnit: perUnit, onHand: round3(onHand), buildable: lineBuildable };
  });
  return { buildable, limitingMaterialId, lines };
}
