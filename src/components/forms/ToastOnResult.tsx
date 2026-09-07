"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { actionErrorMessage, type ActionState } from "./action-state";

/**
 * Fires a sonner toast whenever an `ActionState` from `useActionState` changes to a result: success → green with
 * `state.message` (or `successMessage`), failure → red with `state.error`. Field-level errors alone (with a
 * generic `error`) still toast so the user notices them below the fold. Renders nothing.
 */
export function ToastOnResult({ state, successMessage = "Saved" }: { state: ActionState; successMessage?: string }) {
  const last = useRef<ActionState>(null);
  useEffect(() => {
    if (state === null || state === last.current) return;
    last.current = state;
    if (state.ok) toast.success(state.message ?? successMessage);
    else toast.error(actionErrorMessage(state.error));
  }, [state, successMessage]);
  return null;
}
