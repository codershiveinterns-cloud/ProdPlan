/**
 * Generate-and-persist orchestration for `/schedule/optimize` (docs/M3_SPEC.md §3 "Suggestions are generated on
 * page load"). Rate-limited server-side to once per `RATE_LIMIT_WINDOW_SEC` per tenant (reusing
 * `src/lib/rate-limit.ts`, same fixed-window pattern as login); on a limited hit the previous `PENDING` batch is
 * returned unchanged instead of regenerating.
 */
import type { SuggestionKind } from "@/generated/prisma/enums";
import type { Session } from "@/lib/auth/guards";
import { addDays, startOfDayInTz, todayInTz } from "@/lib/dates";
import type { TenantDb } from "@/lib/db";
import { hit } from "@/lib/rate-limit";
import { scheduleOrders } from "@/lib/scheduling/engine";
import { loadEngineInput } from "@/lib/scheduling/run";
import { generateSuggestions } from "./suggest";
import type { Suggestion } from "./types";

/** Regeneration is rate-limited to once per this many seconds, per tenant (docs/M3_SPEC.md §3). */
export const RATE_LIMIT_WINDOW_SEC = 20;

function rateLimitKey(tenantId: string): string {
  return `optimize:generate:${tenantId}`;
}

export type SuggestionCardDTO = {
  id: string;
  kind: SuggestionKind;
  orderId: string;
  orderNumber: string;
  fromMachineCode: string | null;
  toMachineCode: string | null;
  fromPriority: string | null;
  toPriority: string | null;
  currentConflicts: number;
  projectedConflicts: number;
  currentLateMinutes: number;
  projectedLateMinutes: number;
  summary: string;
  rationale: string;
  createdAt: string;
};

async function listPendingSuggestions(db: TenantDb): Promise<SuggestionCardDTO[]> {
  const rows = await db.optimizationSuggestion.findMany({
    where: { status: "PENDING" },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      kind: true,
      orderId: true,
      fromPriority: true,
      toPriority: true,
      currentConflicts: true,
      projectedConflicts: true,
      currentLateMinutes: true,
      projectedLateMinutes: true,
      summary: true,
      rationale: true,
      createdAt: true,
      order: { select: { orderNumber: true } },
      fromMachine: { select: { code: true } },
      toMachine: { select: { code: true } },
    },
  });
  const dtos = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    orderId: r.orderId,
    orderNumber: r.order.orderNumber,
    fromMachineCode: r.fromMachine?.code ?? null,
    toMachineCode: r.toMachine?.code ?? null,
    fromPriority: r.fromPriority,
    toPriority: r.toPriority,
    currentConflicts: r.currentConflicts,
    projectedConflicts: r.projectedConflicts,
    currentLateMinutes: r.currentLateMinutes,
    projectedLateMinutes: r.projectedLateMinutes,
    summary: r.summary,
    rationale: r.rationale,
    createdAt: r.createdAt.toISOString(),
  }));
  // Preserve the generation order (projected minutes saved, desc) — createdAt alone does not distinguish rows
  // written in the same batch.
  dtos.sort((a, b) => b.currentLateMinutes - b.projectedLateMinutes - (a.currentLateMinutes - a.projectedLateMinutes));
  return dtos;
}

export type GenerateAndPersistResult = {
  suggestions: SuggestionCardDTO[];
  /** True when this call actually re-ran `generateSuggestions()`; false when it was rate-limited. */
  regenerated: boolean;
  rateLimited: boolean;
};

/**
 * Marks any still-`PENDING` suggestions `STALE` (superseded) and persists a fresh batch, unless the tenant hit the
 * per-tenant regeneration rate limit — in that case the current `PENDING` batch is returned unchanged.
 */
export async function generateAndPersistSuggestions(db: TenantDb, session: Session): Promise<GenerateAndPersistResult> {
  const result = await hit(rateLimitKey(session.tenant.id), 1, RATE_LIMIT_WINDOW_SEC);
  if (result.limited) {
    return { suggestions: await listPendingSuggestions(db), regenerated: false, rateLimited: true };
  }

  const tz = session.tenant.timezone;
  const now = new Date();
  const tenant = await db.tenant.findFirstOrThrow({ select: { scheduleHorizonDays: true, defaultCalendarId: true } });
  const horizonDays = tenant.scheduleHorizonDays;
  const horizonEnd = startOfDayInTz(addDays(todayInTz(tz, now), horizonDays), tz);
  const loaded = await loadEngineInput(db, now, horizonEnd);
  const opts = { now, horizonDays, tz, defaultCalendarId: loaded.tenant.defaultCalendarId };
  const baseline = scheduleOrders(loaded.input, opts);
  const fresh: Suggestion[] = generateSuggestions(loaded.input, baseline, opts);

  const reassignPairs = fresh.filter((s): s is Suggestion & { sequence: number } => s.kind === "REASSIGN_MACHINE" && s.sequence != null);
  const entries = reassignPairs.length
    ? await db.scheduleEntry.findMany({
        where: { OR: reassignPairs.map((s) => ({ orderId: s.orderId, sequence: s.sequence })) },
        select: { id: true, orderId: true, sequence: true },
      })
    : [];
  const entryIdByKey = new Map(entries.map((e) => [`${e.orderId}:${e.sequence}`, e.id]));

  await db.$transaction(async (tx) => {
    await tx.optimizationSuggestion.updateMany({ where: { status: "PENDING" }, data: { status: "STALE" } });
    if (fresh.length === 0) return;
    await tx.optimizationSuggestion.createMany({
      data: fresh.map((s) => ({
        tenantId: session.tenant.id,
        kind: s.kind,
        status: "PENDING",
        orderId: s.orderId,
        entryId: s.kind === "REASSIGN_MACHINE" && s.sequence != null ? (entryIdByKey.get(`${s.orderId}:${s.sequence}`) ?? null) : null,
        fromMachineId: s.fromMachineId,
        toMachineId: s.toMachineId,
        fromPriority: s.fromPriority,
        toPriority: s.toPriority,
        currentConflicts: s.currentConflicts,
        projectedConflicts: s.projectedConflicts,
        currentLateMinutes: s.currentLateMinutes,
        projectedLateMinutes: s.projectedLateMinutes,
        summary: s.summary,
        rationale: s.rationale,
      })),
    });
  });

  return { suggestions: await listPendingSuggestions(db), regenerated: true, rateLimited: false };
}
