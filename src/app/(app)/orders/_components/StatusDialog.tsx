"use client";

import { useActionState, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import type { OrderStatus } from "@/generated/prisma/enums";
import { ConfirmDialog } from "@/components/data/ConfirmDialog";
import { ORDER_STATUS_META } from "@/components/data/StatusBadge";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  transitionAcceptsReason,
  transitionNeedsConfirmation,
  transitionRequiresReason,
} from "@/lib/orders/status";
import { changeStatusAction } from "@/app/(app)/orders/actions";

export type StatusDialogProps = {
  orderId: string;
  orderNumber: string;
  currentStatus: OrderStatus;
  /** Legal targets for the current user (`allowedTargets(status, role)` on the server). */
  targets: OrderStatus[];
  /** Uncontrolled: a trigger element opens the dialog. */
  trigger?: ReactNode;
  /** Controlled (e.g. from a row kebab). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

const CONFIRM_COPY: Partial<Record<OrderStatus, { button: string; title: (n: string) => string; description: string; success: string }>> = {
  COMPLETED: {
    button: "Mark as completed…",
    title: (n) => `Mark ${n} as completed?`,
    description: "The order leaves the open lists and its completion time is recorded. An admin can reopen it later.",
    success: "Order completed",
  },
  CANCELLED: {
    button: "Cancel order…",
    title: (n) => `Cancel order ${n}?`,
    description: "The order is closed without being produced. An admin can reopen it later.",
    success: "Order cancelled",
  },
};

function StatusForm({
  orderId,
  orderNumber,
  targets,
  close,
}: Pick<StatusDialogProps, "orderId" | "orderNumber" | "targets"> & { close: () => void }) {
  const [target, setTarget] = useState<OrderStatus>(targets[0]!);
  const [reason, setReason] = useState("");
  const [state, formAction] = useActionState(changeStatusAction, null);

  const handled = useRef<ActionState>(null);
  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.ok) {
      toast.success(state.message ?? "Status updated");
      close();
    }
  }, [state, close]);

  const acceptsReason = transitionAcceptsReason(target);
  const reasonRequired = transitionRequiresReason(target);
  const confirm = transitionNeedsConfirmation(target) ? CONFIRM_COPY[target] : undefined;
  const failed = state && !state.ok ? state : null;

  const hiddenFields = (
    <>
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="status" value={target} />
      <input type="hidden" name="reason" value={reason} />
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      <FormField label="New status" htmlFor="status-target" required errors={fieldErrorsFor(state, "status")}>
        <div id="status-target-field">
          <Select value={target} onValueChange={(value) => setTarget(value as OrderStatus)}>
            <SelectTrigger id="status-target" className="w-full" aria-label="New status">
              <SelectValue placeholder="Choose a status" />
            </SelectTrigger>
            <SelectContent>
              {targets.map((status) => (
                <SelectItem key={status} value={status}>
                  {ORDER_STATUS_META[status].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </FormField>
      {acceptsReason ? (
        <FormField
          label="Reason"
          htmlFor="status-reason"
          required={reasonRequired}
          hint={reasonRequired ? undefined : "Optional"}
          errors={fieldErrorsFor(state, "reason")}
        >
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            maxLength={500}
            placeholder={target === "ON_HOLD" ? "Why is this order on hold?" : "Why is this order cancelled?"}
          />
        </FormField>
      ) : null}
      {failed && !failed.fieldErrors ? <FieldErrors errors={[actionErrorMessage(failed.error)]} /> : null}
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        {confirm ? (
          <ConfirmDialog
            trigger={<Button variant={target === "CANCELLED" ? "destructive" : "default"}>{confirm.button}</Button>}
            title={confirm.title(orderNumber)}
            description={confirm.description}
            confirmLabel={target === "CANCELLED" ? "Cancel order" : "Mark as completed"}
            cancelLabel="Go back"
            destructive={target === "CANCELLED"}
            action={(formData) => changeStatusAction(null, formData)}
            successMessage={confirm.success}
            onSuccess={close}
          >
            {hiddenFields}
          </ConfirmDialog>
        ) : (
          <form action={formAction}>
            {hiddenFields}
            <SubmitButton pendingText="Saving…">Change status</SubmitButton>
          </form>
        )}
      </DialogFooter>
    </div>
  );
}

/**
 * Status change dialog (docs/M1_SPEC.md §6.1): Select limited to the legal targets, reason field (required for
 * ON_HOLD, optional for CANCELLED) and a `ConfirmDialog` step for the terminal targets COMPLETED / CANCELLED.
 * The inner form remounts on every open, so stale state never shows.
 */
export function StatusDialog({ orderId, orderNumber, currentStatus, targets, trigger, open, onOpenChange }: StatusDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isOpen = open ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const close = useCallback(() => setOpen(false), [setOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change status of {orderNumber}</DialogTitle>
          <DialogDescription>
            Currently <span className="font-medium text-foreground">{ORDER_STATUS_META[currentStatus].label}</span>. Pick
            the new status.
          </DialogDescription>
        </DialogHeader>
        {targets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No status change is available for this order.</p>
        ) : (
          <StatusForm orderId={orderId} orderNumber={orderNumber} targets={targets} close={close} />
        )}
      </DialogContent>
    </Dialog>
  );
}
