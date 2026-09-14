"use server";

/**
 * Server Actions for `/schedule/optimize` (docs/M3_SPEC.md §3, §6): Apply / Dismiss one suggestion. Both need
 * `schedule:run` — applying changes the schedule (same permission as running it) and this page is an operational
 * scheduling tool, not the read-only `analytics:read` view.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ok, parseForm, withAction } from "@/lib/action";
import { auditContext } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/guards";
import { applySuggestion, dismissSuggestion } from "@/lib/optimization/apply";

const suggestionIdSchema = z.object({ suggestionId: z.string().min(1) });

function revalidateOptimize(): void {
  revalidatePath("/schedule/optimize");
  revalidatePath("/schedule");
  revalidatePath("/dashboard");
}

export const applySuggestionAction = withAction(async (formData) => {
  const { session, db } = await requirePermission("schedule:run");
  const input = parseForm(suggestionIdSchema, formData);
  const ctx = await auditContext(session);
  await applySuggestion(db, session, ctx, input.suggestionId);
  revalidateOptimize();
  return ok(undefined, "Suggestion applied — the schedule has been updated.");
});

export const dismissSuggestionAction = withAction(async (formData) => {
  const { session, db } = await requirePermission("schedule:run");
  const input = parseForm(suggestionIdSchema, formData);
  const ctx = await auditContext(session);
  await dismissSuggestion(db, session, ctx, input.suggestionId);
  revalidateOptimize();
  return ok(undefined, "Suggestion dismissed.");
});
