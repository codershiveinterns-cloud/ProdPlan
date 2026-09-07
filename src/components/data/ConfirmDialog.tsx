"use client";

import { useActionState, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { actionErrorMessage, type ActionState } from "@/components/forms/action-state";

export type ConfirmDialogProps = {
  /** A single focusable element (usually a Button or DropdownMenuItem with `onSelect={e => e.preventDefault()}`). */
  trigger: ReactNode;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Red confirm button for irreversible actions. */
  destructive?: boolean;
  /**
   * Server Action (or a closure calling one) that performs the change. Receives the dialog's FormData when
   * `children` render extra fields; a zero-argument action is also accepted. `null`/`undefined` results (e.g.
   * the action redirected) close the dialog silently.
   */
  action: (formData: FormData) => Promise<ActionState> | ActionState;
  /** Optional extra fields rendered inside the form (e.g. a reason textarea). */
  children?: ReactNode;
  /** Toast text when the action succeeds without its own `message`. */
  successMessage?: string;
  onSuccess?: () => void;
};

function ConfirmForm({
  action,
  children,
  confirmLabel,
  cancelLabel,
  destructive,
  successMessage,
  close,
  onSuccess,
}: Pick<ConfirmDialogProps, "action" | "children" | "confirmLabel" | "cancelLabel" | "destructive" | "successMessage" | "onSuccess"> & {
  close: () => void;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    async (_previous, formData) => (await action(formData)) ?? { ok: true },
    null,
  );

  // Each result is handled exactly once, even if the (closing) dialog re-renders during its exit animation.
  const handled = useRef<ActionState>(null);
  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.ok) {
      if (state.message || successMessage) toast.success(state.message ?? successMessage);
      onSuccess?.();
      close();
    }
  }, [state, successMessage, close, onSuccess]);

  const failed = state && !state.ok ? state : null;
  const fieldMessages = failed?.fieldErrors ? Object.values(failed.fieldErrors).flat() : [];

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {children ? <div className="flex flex-col gap-4">{children}</div> : null}
      {failed ? (
        <Alert variant="destructive">
          <AlertDescription>
            <p>{actionErrorMessage(failed.error)}</p>
            {fieldMessages.length > 0 ? (
              <ul className="mt-1 ml-4 list-disc">
                {fieldMessages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            {cancelLabel}
          </Button>
        </DialogClose>
        <SubmitButton variant={destructive ? "destructive" : "default"} pendingText="Working…">
          {confirmLabel}
        </SubmitButton>
      </DialogFooter>
    </form>
  );
}

/**
 * Confirmation dialog whose confirm button posts to a Server Action. The form (and its state) is remounted every
 * time the dialog opens, so stale errors never show. Shows a pending state while submitting and a toast on result.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  action,
  children,
  successMessage,
  onSuccess,
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <ConfirmForm
          action={action}
          confirmLabel={confirmLabel}
          cancelLabel={cancelLabel}
          destructive={destructive}
          successMessage={successMessage}
          onSuccess={onSuccess}
          close={close}
        >
          {children}
        </ConfirmForm>
      </DialogContent>
    </Dialog>
  );
}
