"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { OperationStatus } from "@/generated/prisma/enums";
import { FieldErrors } from "@/components/forms/FieldErrors";
import { FormField } from "@/components/forms/FormField";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { actionErrorMessage, fieldErrorsFor, type ActionState } from "@/components/forms/action-state";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { completeOperationAction, pauseOperationAction, resumeOperationAction, startOperationAction } from "../actions";

export type OperationActionsProps = {
  entryId: string;
  orderNumber: string;
  sequence: number;
  status: OperationStatus;
  /** `allowedOperationTargets(status, role)` computed on the server. */
  targets: OperationStatus[];
  /** Order quantity — the Complete dialog's default "quantity done". */
  quantity: number;
};

/** Plain button whose form posts one of `startOperationAction` / `resumeOperationAction` (no extra fields). */
function SimpleActionButton({
  entryId,
  action,
  label,
  pendingLabel,
  variant,
}: {
  entryId: string;
  action: typeof startOperationAction;
  label: string;
  pendingLabel: string;
  variant?: "default" | "outline";
}) {
  const [state, formAction] = useActionState(action, null);
  const handled = useRef<ActionState>(null);
  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.ok) toast.success(state.message ?? "Updated");
    else toast.error(actionErrorMessage(state.error));
  }, [state]);

  return (
    <form action={formAction}>
      <input type="hidden" name="entryId" value={entryId} />
      <SubmitButton pendingText={pendingLabel} variant={variant} size="lg" className="min-w-28">
        {label}
      </SubmitButton>
    </form>
  );
}

function PauseForm({
  entryId,
  close,
}: {
  entryId: string;
  close: () => void;
}) {
  const [state, formAction] = useActionState(pauseOperationAction, null);
  const handled = useRef<ActionState>(null);
  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.ok) {
      toast.success(state.message ?? "Operation paused");
      close();
    }
  }, [state, close]);
  const failed = state && !state.ok ? state : null;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="entryId" value={entryId} />
      <FormField label="Reason" htmlFor="pause-reason" required errors={fieldErrorsFor(state, "reason")}>
        <Textarea name="reason" rows={3} maxLength={500} placeholder="Why is this operation paused?" />
      </FormField>
      {failed && !failed.fieldErrors ? <FieldErrors errors={[actionErrorMessage(failed.error)]} /> : null}
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <SubmitButton pendingText="Pausing…">Pause operation</SubmitButton>
      </DialogFooter>
    </form>
  );
}

function PauseDialog({ entryId, orderNumber, sequence }: { entryId: string; orderNumber: string; sequence: number }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="lg" className="min-w-28">
          Pause
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pause {orderNumber} op {sequence}</DialogTitle>
          <DialogDescription>Give a reason so the floor and planning know why work stopped.</DialogDescription>
        </DialogHeader>
        <PauseForm entryId={entryId} close={close} />
      </DialogContent>
    </Dialog>
  );
}

function CompleteForm({
  entryId,
  quantity,
  close,
}: {
  entryId: string;
  quantity: number;
  close: () => void;
}) {
  const [state, formAction] = useActionState(completeOperationAction, null);
  const handled = useRef<ActionState>(null);
  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.ok) {
      toast.success(state.message ?? "Operation completed");
      close();
    }
  }, [state, close]);
  const failed = state && !state.ok ? state : null;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="entryId" value={entryId} />
      <FormField label="Quantity done" htmlFor="complete-quantity" required errors={fieldErrorsFor(state, "quantityDone")}>
        <Input name="quantityDone" type="number" inputMode="decimal" step="0.001" min="0" defaultValue={quantity} />
      </FormField>
      <FormField
        label="Note"
        htmlFor="complete-note"
        hint="Required for a partial completion"
        errors={fieldErrorsFor(state, "note")}
      >
        <Textarea name="note" rows={3} maxLength={500} placeholder="Optional note" />
      </FormField>
      {failed && !failed.fieldErrors ? <FieldErrors errors={[actionErrorMessage(failed.error)]} /> : null}
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <SubmitButton pendingText="Completing…">Complete operation</SubmitButton>
      </DialogFooter>
    </form>
  );
}

function CompleteDialog({
  entryId,
  orderNumber,
  sequence,
  quantity,
}: {
  entryId: string;
  orderNumber: string;
  sequence: number;
  quantity: number;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="lg" className="min-w-28">
          Complete
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Complete {orderNumber} op {sequence}</DialogTitle>
          <DialogDescription>Quantity done defaults to the order quantity; add a note for a partial completion.</DialogDescription>
        </DialogHeader>
        <CompleteForm entryId={entryId} quantity={quantity} close={close} />
      </DialogContent>
    </Dialog>
  );
}

/**
 * Floor action buttons for one operation (docs/M2_SPEC.md §4): Start (QUEUED→IN_PROGRESS), Pause
 * (IN_PROGRESS→ON_HOLD, reason dialog), Resume (ON_HOLD→IN_PROGRESS), Complete (IN_PROGRESS→COMPLETED, quantity +
 * note dialog). Which buttons show is driven entirely by `allowedOperationTargets(status, role)` computed on the
 * server — never hardcoded here. Buttons are 44 px+ (`size="lg"`, h-12) per the tablet-first density rule.
 */
export function OperationActions({ entryId, orderNumber, sequence, status, targets, quantity }: OperationActionsProps) {
  const canStart = status === "QUEUED" && targets.includes("IN_PROGRESS");
  const canPause = status === "IN_PROGRESS" && targets.includes("ON_HOLD");
  const canResume = status === "ON_HOLD" && targets.includes("IN_PROGRESS");
  const canComplete = status === "IN_PROGRESS" && targets.includes("COMPLETED");

  if (!canStart && !canPause && !canResume && !canComplete) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canStart ? (
        <SimpleActionButton entryId={entryId} action={startOperationAction} label="Start" pendingLabel="Starting…" />
      ) : null}
      {canPause ? <PauseDialog entryId={entryId} orderNumber={orderNumber} sequence={sequence} /> : null}
      {canResume ? (
        <SimpleActionButton
          entryId={entryId}
          action={resumeOperationAction}
          label="Resume"
          pendingLabel="Resuming…"
          variant="outline"
        />
      ) : null}
      {canComplete ? (
        <CompleteDialog entryId={entryId} orderNumber={orderNumber} sequence={sequence} quantity={quantity} />
      ) : null}
    </div>
  );
}
