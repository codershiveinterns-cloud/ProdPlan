"use client";

import { useActionState, useCallback, useState } from "react";

import type { ActionState } from "@/components/forms/action-state";

export type FormActionFn = (prev: ActionState, formData: FormData) => Promise<ActionState> | ActionState;

export type FormValues = {
  /** Last submitted value for `name` (the last one when the key was repeated), else `fallback`. */
  value: (name: string, fallback?: string) => string | undefined;
  /** Every submitted value for a repeated key (day chips), or `undefined` before the first submission. */
  values: (name: string) => string[] | undefined;
};

/**
 * `useActionState` plus the two things every ProdPlan form needs around it:
 *  - React 19 resets uncontrolled fields after every form action, so the last submitted `FormData` is kept and
 *    exposed as `value()` / `values()` to feed `defaultValue`s; `formKey` changes per submission so a keyed
 *    fieldset remounts with those defaults (validation errors no longer wipe what the user typed);
 *  - `pending` for disabling secondary buttons while the action runs.
 */
export function useFormAction(action: FormActionFn) {
  const [submitted, setSubmitted] = useState<FormData | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(async (prev, formData) => {
    setSubmitted(formData);
    setFormKey((n) => n + 1);
    return (await action(prev, formData)) ?? null;
  }, null);

  const value = useCallback(
    (name: string, fallback?: string): string | undefined => {
      if (!submitted) return fallback;
      const all = submitted.getAll(name);
      const last = all.length > 0 ? all[all.length - 1] : undefined;
      return typeof last === "string" ? last : fallback;
    },
    [submitted],
  );

  const values = useCallback(
    (name: string): string[] | undefined => {
      if (!submitted) return undefined;
      return submitted.getAll(name).filter((v): v is string => typeof v === "string");
    },
    [submitted],
  );

  return { state, formAction, pending, formKey, value, values };
}
