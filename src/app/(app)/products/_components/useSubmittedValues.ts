"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ActionState } from "@/components/forms/action-state";

/**
 * React 19 resets every uncontrolled field of a `<form action>` once the action settles — including when the
 * server answered with validation errors, which would wipe what the user typed. This hook captures the submitted
 * values on submit and, after a failed result, bumps `attempt` so the fields can be remounted (`key={attempt}`)
 * with `get(name, fallback)` as their new `defaultValue`.
 *
 *   const { attempt, capture, get } = useSubmittedValues(state);
 *   <form action={formAction} onSubmit={(e) => capture(e.currentTarget)}>
 *     <div key={attempt}> <Input name="sku" defaultValue={get("sku", product?.sku ?? "")} /> … </div>
 */
export function useSubmittedValues(state: ActionState) {
  const values = useRef<Record<string, string>>({});
  const lastFailure = useRef<ActionState>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (state && !state.ok && lastFailure.current !== state) {
      lastFailure.current = state;
      setAttempt((n) => n + 1);
    }
  }, [state]);

  const capture = useCallback((form: HTMLFormElement) => {
    const out: Record<string, string> = {};
    for (const [key, value] of new FormData(form).entries()) {
      // Repeated keys (hidden "false" + checkbox "on") resolve to the last value, like the server's parseForm.
      if (typeof value === "string") out[key] = value;
    }
    values.current = out;
  }, []);

  const get = useCallback(
    (name: string, fallback: string): string => (attempt > 0 ? (values.current[name] ?? fallback) : fallback),
    [attempt],
  );

  return { attempt, capture, get };
}
