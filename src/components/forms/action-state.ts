/**
 * Result shape returned by every Server Action wrapped with `withAction()` (src/lib/action.ts, owner: auth-core).
 * Re-declared here so the UI kit compiles before that module lands; it MUST stay structurally identical to
 * `ActionState` in src/lib/action.ts. Pages may import either — TypeScript treats them as the same type.
 */
export type ActionState<T = unknown> =
  | null
  | { ok: true; message?: string; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/** Field errors for one input from an ActionState (undefined when none). */
export function fieldErrorsFor(state: ActionState, name: string): string[] | undefined {
  if (!state || state.ok) return undefined;
  const errors = state.fieldErrors?.[name];
  return errors && errors.length > 0 ? errors : undefined;
}

/** User-facing text for an error result (`forbidden` gets a friendlier sentence). */
export function actionErrorMessage(error: string): string {
  return error === "forbidden" ? "You don't have permission to do that." : error;
}
