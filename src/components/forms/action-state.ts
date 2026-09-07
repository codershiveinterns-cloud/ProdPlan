/**
 * `ActionState` is owned by src/lib/action.ts (the `withAction()` result shape). It is re-exported here so form
 * components and pages can import it next to the two UI helpers below. Type-only, so client bundles never pull in
 * the server-side action plumbing.
 */
import type { ActionState } from "@/lib/action";

export type { ActionState } from "@/lib/action";

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
