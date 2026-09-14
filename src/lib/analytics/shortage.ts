/**
 * Forward-looking material shortage prediction (docs/M3_SPEC.md §4). Extends the M2 engine's point-in-time
 * shortage check (which only looks at SCHEDULED orders' BOM draw) to every OPEN, non-cancelled order: walks them
 * earliest-due-first, netting each order's `requirementFor()` (docs/M1_SPEC.md §4, `src/lib/bom.ts` — reused, not
 * recomputed) against a running material balance that starts at `stockOnHand`, exactly the same running-balance
 * pattern the scheduling engine's own material walk uses (`src/lib/scheduling/engine.ts`). Read-only: never writes
 * `ScheduleConflict` rows (those stay engine-run-triggered per M2) and is recomputed on every call, never stored.
 */
import { requirementFor, round3, roundTo } from "@/lib/bom";
import { compareDateOnly, diffDays, toDateOnly, todayInTz } from "@/lib/dates";
import type { TenantDb } from "@/lib/db";
import { OPEN_ORDER_STATUSES } from "@/lib/scheduling/dirty";

export type ShortageSeverity = "OK" | "WATCH" | "SHORT";

export type ShortagePrediction = {
  materialId: string;
  code: string;
  name: string;
  unit: string;
  stockOnHand: number;
  reorderThreshold: number;
  /** Sum of BOM requirement across all open orders (earliest-due-first walk order does not change this total). */
  committedDemand: number;
  /** `stockOnHand - committedDemand` — can go negative. */
  projectedBalance: number;
  /** The earliest-due order at which the running balance first goes negative, or null when it never does. */
  firstShortfallOrderId: string | null;
  firstShortfallDate: string | null;
  /** `stockOnHand / (trailing-30-day average daily ISSUE consumption)`; null when there is no recent consumption. */
  daysOfCoverAtCurrentRate: number | null;
  /** SHORT = already short today; WATCH = short within the material's reorderLeadTimeDays; OK otherwise. */
  severity: ShortageSeverity;
};

const num = (v: { toString(): string } | number | null | undefined): number => (v == null ? 0 : Number(String(v)));

const CONSUMPTION_LOOKBACK_DAYS = 30;

export async function predictShortages(db: TenantDb, opts: { asOf?: Date } = {}): Promise<ShortagePrediction[]> {
  const asOf = opts.asOf ?? new Date();
  const tenant = await db.tenant.findFirstOrThrow({ select: { timezone: true } });
  const tz = tenant.timezone;
  const asOfIso = todayInTz(tz, asOf);
  const lookbackStart = new Date(asOf.getTime() - CONSUMPTION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const [materials, orders, issueMovements] = await Promise.all([
    db.material.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true, unit: true, stockOnHand: true, reorderThreshold: true, reorderLeadTimeDays: true },
      orderBy: { code: "asc" },
    }),
    db.order.findMany({
      where: { status: { in: [...OPEN_ORDER_STATUSES] } },
      select: {
        id: true,
        dueDate: true,
        quantity: true,
        product: { select: { bomItems: { select: { materialId: true, quantityPerUnit: true, scrapPercent: true } } } },
      },
      orderBy: { dueDate: "asc" },
    }),
    db.stockMovement.findMany({
      where: { type: "ISSUE", createdAt: { gte: lookbackStart, lte: asOf } },
      select: { materialId: true, quantity: true },
    }),
  ]);

  const consumptionByMaterial = new Map<string, number>();
  for (const m of issueMovements) {
    consumptionByMaterial.set(m.materialId, (consumptionByMaterial.get(m.materialId) ?? 0) + Math.abs(num(m.quantity)));
  }

  // Running balance per material, netted in due-date order — mirrors the engine's own material walk
  // (src/lib/scheduling/engine.ts "materials" section): consume `requirementFor()` from a balance seeded at
  // stockOnHand, order by order.
  const balances = new Map<string, number>(materials.map((m) => [m.id, num(m.stockOnHand)]));
  const committedByMaterial = new Map<string, number>();
  const firstShortfallByMaterial = new Map<string, { orderId: string; date: string }>();

  for (const order of orders) {
    const bom = order.product.bomItems;
    if (bom.length === 0) continue;
    const dueIso = toDateOnly(order.dueDate);
    const lines = requirementFor(
      num(order.quantity),
      bom.map((b) => ({
        materialId: b.materialId,
        quantityPerUnit: num(b.quantityPerUnit),
        scrapPercent: num(b.scrapPercent),
        stockOnHand: Math.max(0, balances.get(b.materialId) ?? 0),
      })),
    );
    for (const line of lines) {
      if (line.required <= 0) continue;
      committedByMaterial.set(line.materialId, round3((committedByMaterial.get(line.materialId) ?? 0) + line.required));
      const before = balances.get(line.materialId) ?? 0;
      const after = round3(before - line.required);
      balances.set(line.materialId, after);
      if (after < 0 && !firstShortfallByMaterial.has(line.materialId)) {
        firstShortfallByMaterial.set(line.materialId, { orderId: order.id, date: dueIso });
      }
    }
  }

  return materials.map((m): ShortagePrediction => {
    const stockOnHand = num(m.stockOnHand);
    const committedDemand = committedByMaterial.get(m.id) ?? 0;
    const projectedBalance = round3(stockOnHand - committedDemand);
    const shortfall = firstShortfallByMaterial.get(m.id) ?? null;
    const consumption = consumptionByMaterial.get(m.id) ?? 0;
    const daysOfCoverAtCurrentRate = consumption > 0 ? roundTo(stockOnHand / (consumption / CONSUMPTION_LOOKBACK_DAYS), 1) : null;

    let severity: ShortageSeverity = "OK";
    if (shortfall) {
      if (compareDateOnly(asOfIso, shortfall.date) >= 0) severity = "SHORT";
      else if (diffDays(asOfIso, shortfall.date) <= m.reorderLeadTimeDays) severity = "WATCH";
    }

    return {
      materialId: m.id,
      code: m.code,
      name: m.name,
      unit: m.unit,
      stockOnHand,
      reorderThreshold: num(m.reorderThreshold),
      committedDemand,
      projectedBalance,
      firstShortfallOrderId: shortfall?.orderId ?? null,
      firstShortfallDate: shortfall?.date ?? null,
      daysOfCoverAtCurrentRate,
      severity,
    };
  });
}
