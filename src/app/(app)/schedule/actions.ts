"use server";

/**
 * Schedule Server Actions (docs/M2_SPEC.md §3.6): thin wrappers around `src/lib/scheduling/{run,move}.ts`. Every
 * action is tenant-scoped via `requirePermission()`, validated with the zod schemas from
 * `src/lib/validation/scheduling.ts`, and returns `ActionState` (`withAction` maps thrown errors).
 */
import { revalidatePath } from "next/cache";

import { ok, parseForm, withAction } from "@/lib/action";
import { auditContext } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/guards";
import { moveEntry, unlockEntry } from "@/lib/scheduling/move";
import { runSchedule, runSummary } from "@/lib/scheduling/run";
import { moveEntrySchema, runScheduleSchema, unlockEntrySchema } from "@/lib/validation/scheduling";

function revalidateSchedule(): void {
  revalidatePath("/schedule");
  revalidatePath("/schedule/conflicts");
  revalidatePath("/dashboard");
}

export type MoveEntryActionData = { entryId: string; machineId: string; machineCode: string; plannedStartAt: string; plannedEndAt: string };

/** `schedule:run` — "Run schedule" toolbar button (horizon 14/30/60, blank = tenant default). */
export const runScheduleAction = withAction(async (formData) => {
  const { session, db } = await requirePermission("schedule:run");
  const input = parseForm(runScheduleSchema, formData);
  const ctx = await auditContext(session);
  const result = await runSchedule(db, session, ctx, { trigger: "manual", horizonDays: input.horizonDays });
  revalidateSchedule();
  return ok({ runId: result.runId }, runSummary(result.stats, result.conflicts.length));
});

/** `schedule:move` — drag-to-reschedule drop AND the keyboard "Move to…" fallback form. */
export const moveEntryAction = withAction<MoveEntryActionData>(async (formData) => {
  const { session, db } = await requirePermission("schedule:move");
  const input = parseForm(moveEntrySchema, formData);
  const ctx = await auditContext(session);
  const result = await moveEntry(db, session, ctx, {
    entryId: input.entryId,
    machineId: input.machineId,
    plannedStartAt: input.plannedStartAt,
  });
  revalidateSchedule();
  return ok(
    {
      entryId: result.entryId,
      machineId: result.machineId,
      machineCode: result.machineCode,
      plannedStartAt: result.plannedStartAt.toISOString(),
      plannedEndAt: result.plannedEndAt.toISOString(),
    },
    result.summary,
  );
});

/** `schedule:move` — "Unlock" in the entry drawer. */
export const unlockEntryAction = withAction(async (formData) => {
  const { session, db } = await requirePermission("schedule:move");
  const input = parseForm(unlockEntrySchema, formData);
  const ctx = await auditContext(session);
  await unlockEntry(db, session, ctx, input.entryId);
  revalidateSchedule();
  return ok(undefined, "Operation unlocked");
});
