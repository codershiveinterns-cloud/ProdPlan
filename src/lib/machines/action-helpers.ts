/**
 * `withAction()` plus the module-specific error mappings for machines / work centers / calendars:
 *  - `FieldRuleError`        → field-level error on its field
 *  - `DowntimeOverlapError`  → non-blocking warning: `{ ok: false, error: "Overlaps with …", fieldErrors:
 *                              { confirmOverlap: [...] } }` so the dialog can offer "Save anyway"
 *  - `ShiftValidationError`  → every message under `fieldErrors.shifts` (first one as the summary)
 * Everything else falls through to `withAction()` (ZodError → fieldErrors, DomainError → message, …).
 */
import { fieldError, withAction, type ActionState, type ServerAction } from "@/lib/action";
import { DowntimeOverlapError, FieldRuleError, ShiftValidationError } from "./errors";
import { CONFIRM_OVERLAP_FIELD, SHIFTS_FIELD } from "./form-fields";

export { CONFIRM_OVERLAP_FIELD, SHIFTS_FIELD } from "./form-fields";

export function mapModuleError(err: unknown): ActionState | null {
  if (err instanceof FieldRuleError) return fieldError(err.field, err.message);
  if (err instanceof DowntimeOverlapError) {
    return { ok: false, error: err.message, fieldErrors: { [CONFIRM_OVERLAP_FIELD]: [...err.overlaps] } };
  }
  if (err instanceof ShiftValidationError) {
    return { ok: false, error: err.message, fieldErrors: { [SHIFTS_FIELD]: [...err.messages] } };
  }
  return null;
}

/** `withAction()` with the module error mappings applied first. */
export function moduleAction(fn: (formData: FormData) => Promise<ActionState>): ServerAction {
  return withAction(async (formData) => {
    try {
      return await fn(formData);
    } catch (err) {
      const mapped = mapModuleError(err);
      if (mapped) return mapped;
      throw err;
    }
  });
}

/** Runs a module action once (for `.bind(null, id)` style actions that are not driven by `useActionState`). */
export function runModuleAction(formData: FormData, fn: (formData: FormData) => Promise<ActionState>): Promise<ActionState> {
  return moduleAction(fn)(null, formData);
}

/** `"1"`, `"true"`, `"on"` → true (hidden confirm inputs / submit-button values). */
export function formFlag(formData: FormData, key: string): boolean {
  const v = formData.get(key);
  return v === "1" || v === "true" || v === "on";
}

/** A string form value, trimmed; `""` when absent. */
export function formString(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}
