"use client";

import { useCallback, useState, type FormEvent } from "react";
import type { ActionState } from "@/components/forms/action-state";

/**
 * React 19 resets an uncontrolled `<form action>` after the action settles — including when the action returned a
 * validation error. This hook snapshots the submitted values in `onSubmit` and bumps a `key` when the action
 * failed, so the form remounts with `defaultValue`s taken from the draft and the user's input survives.
 */
export function useFormDraft(state: ActionState) {
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [lastFailure, setLastFailure] = useState<ActionState>(null);

  // "Adjust state on prop change" pattern (no effect): a new failed result remounts the form once.
  if (state && !state.ok && state !== lastFailure) {
    setLastFailure(state);
    setFormKey((k) => k + 1);
  }

  const onSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
    const next: Record<string, string> = {};
    new FormData(event.currentTarget).forEach((value, key) => {
      if (typeof value === "string") next[key] = value;
    });
    setDraft(next);
  }, []);

  /** Draft value when the user already submitted once, else the initial value. */
  const value = useCallback(
    (name: string, fallback: string | undefined | null): string => draft?.[name] ?? fallback ?? "",
    [draft],
  );

  return { formKey, onSubmit, value, hasDraft: draft !== null };
}
