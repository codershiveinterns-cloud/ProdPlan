"use client";

import { useActionState, useEffect, useRef } from "react";
import { CheckCheck } from "lucide-react";

import { SubmitButton } from "@/components/forms/SubmitButton";
import { ToastOnResult } from "@/components/forms/ToastOnResult";

import { markAllReadAction } from "../actions";
import { announceNotificationsChanged } from "./NotificationItem";

/** "Mark all as read" for the /notifications header. Disabled when nothing is unread. */
export function MarkAllReadButton({ unread }: { unread: number }) {
  const [state, formAction] = useActionState(markAllReadAction, null);
  const handled = useRef(state);

  useEffect(() => {
    if (state === null || handled.current === state) return;
    handled.current = state;
    if (state.ok) announceNotificationsChanged();
  }, [state]);

  return (
    <form action={formAction}>
      <ToastOnResult state={state} successMessage="Marked all as read" />
      <SubmitButton variant="outline" disabled={unread === 0} pendingText="Marking…">
        <CheckCheck data-icon="inline-start" />
        Mark all as read
      </SubmitButton>
    </form>
  );
}
