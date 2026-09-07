"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
import { cn } from "@/lib/utils";

import { useFormAction, type FormActionFn, type FormValues } from "./use-form-action";

export type FormDialogRenderProps = FormValues & {
  state: ActionState;
  pending: boolean;
};

export type FormDialogProps = {
  /** A single focusable element (Button, or a DropdownMenuItem with `onSelect={(e) => e.preventDefault()}`). */
  trigger: ReactNode;
  title: string;
  description?: ReactNode;
  /** Server Action with the `useActionState` signature (a `.bind(null, id)` of one is fine). */
  action: FormActionFn;
  submitLabel: string;
  pendingLabel?: string;
  successMessage?: string;
  /** The fields. `value()`/`values()` give the last submitted values for `defaultValue`s. */
  children: (props: FormDialogRenderProps) => ReactNode;
  /** Extra footer content before the primary button (e.g. a "Save anyway" submit). */
  footerExtra?: (props: FormDialogRenderProps) => ReactNode;
  /** Return true when `children` already present this error state, to suppress the generic alert. */
  handlesError?: (state: ActionState) => boolean;
  contentClassName?: string;
  onSuccess?: () => void;
};

function DialogForm({
  action,
  submitLabel,
  pendingLabel,
  successMessage,
  children,
  footerExtra,
  handlesError,
  onSuccess,
  close,
}: Pick<
  FormDialogProps,
  "action" | "submitLabel" | "pendingLabel" | "successMessage" | "children" | "footerExtra" | "handlesError" | "onSuccess"
> & { close: () => void }) {
  const { state, formAction, pending, formKey, value, values } = useFormAction(action);

  // Handle each result exactly once, even if the closing dialog re-renders during its exit animation.
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
  const showAlert = failed && !(handlesError?.(failed) ?? false);
  const render: FormDialogRenderProps = { state, pending, value, values };

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div key={formKey} className="flex flex-col gap-4">
        {children(render)}
      </div>
      {showAlert ? (
        <Alert variant="destructive">
          <AlertDescription>
            <p>{actionErrorMessage(failed.error)}</p>
          </AlertDescription>
        </Alert>
      ) : null}
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" disabled={pending}>
            Cancel
          </Button>
        </DialogClose>
        {footerExtra?.(render)}
        <SubmitButton pendingText={pendingLabel ?? "Saving…"}>{submitLabel}</SubmitButton>
      </DialogFooter>
    </form>
  );
}

/**
 * Dialog + `useActionState` form for the richer module dialogs (WorkCenterDialog, ShiftDialog, DowntimeDialog…),
 * following the ConfirmDialog pattern: the form remounts on every open, field errors render inline via
 * `fieldErrorsFor(state, …)`, a generic error Alert shows form-level failures, success closes with a toast.
 */
export function FormDialog({
  trigger,
  title,
  description,
  action,
  submitLabel,
  pendingLabel,
  successMessage,
  children,
  footerExtra,
  handlesError,
  contentClassName,
  onSuccess,
}: FormDialogProps) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className={cn("max-h-[92dvh] overflow-y-auto sm:max-w-lg", contentClassName)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <DialogForm
          action={action}
          submitLabel={submitLabel}
          pendingLabel={pendingLabel}
          successMessage={successMessage}
          footerExtra={footerExtra}
          handlesError={handlesError}
          onSuccess={onSuccess}
          close={close}
        >
          {children}
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}
