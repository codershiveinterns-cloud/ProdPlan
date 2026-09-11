"use client";

/**
 * Entry detail drawer (docs/M2_SPEC.md §3.3): order link, product, sequence, planned window, machine, status,
 * any open conflicts, "Unlock" when locked (`schedule:move`), and the keyboard-accessible "Move to…" fallback
 * form — mandatory (not decorative) since drag is not universally accessible.
 */
import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Lock, Unlock } from "lucide-react";
import { toast } from "sonner";

import { moveEntryAction, unlockEntryAction } from "@/app/(app)/schedule/actions";
import type { EntryVM } from "@/app/(app)/schedule/view-model";
import { OPERATION_STATUS_META } from "./status-meta";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateTimeInput } from "@/components/forms/DateTimeInput";
import { FieldErrors } from "@/components/forms/FieldErrors";
import { FormField } from "@/components/forms/FormField";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { actionErrorMessage, fieldErrorsFor, type ActionState } from "@/components/forms/action-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export type SiblingMachine = { id: string; code: string; name: string };

export type EntryDrawerProps = {
  entry: EntryVM | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Other machines in the same work center — eligible "Move to…" targets. */
  siblingMachines: SiblingMachine[];
  canMove: boolean;
  tz: string;
  /** Called after a successful move/unlock so the parent can refresh its data. */
  onChanged: () => void;
};

function MoveToForm({ entry, siblingMachines, tz, onDone }: { entry: EntryVM; siblingMachines: SiblingMachine[]; tz: string; onDone: () => void }) {
  const [state, formAction] = useActionState(moveEntryAction, null);
  const [machineId, setMachineId] = useState(entry.machineId);
  const handled = useRef<ActionState>(null);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.ok) {
      toast.success(state.message ?? "Operation moved");
      onDone();
    }
  }, [state, onDone]);

  const failed = state && !state.ok ? state : null;

  return (
    <form action={formAction} className="flex flex-col gap-4 border-t pt-4">
      <h3 className="text-sm font-semibold">Move to…</h3>
      <input type="hidden" name="entryId" value={entry.id} />
      <FormField label="Machine" htmlFor="move-machine" errors={fieldErrorsFor(state, "machineId")}>
        <input type="hidden" name="machineId" value={machineId} />
        <Select value={machineId} onValueChange={setMachineId}>
          <SelectTrigger id="move-machine" className="w-full" aria-label="Machine">
            <SelectValue placeholder="Choose a machine" />
          </SelectTrigger>
          <SelectContent>
            {siblingMachines.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.code} · {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <FormField label="Planned start" htmlFor="move-start" errors={fieldErrorsFor(state, "plannedStartAt")}>
        <DateTimeInput name="plannedStartAt" tz={tz} defaultValue={entry.plannedStartAt} required />
      </FormField>
      {failed && !failed.fieldErrors ? <FieldErrors errors={[actionErrorMessage(failed.error)]} /> : null}
      <SubmitButton pendingText="Moving…">Move operation</SubmitButton>
    </form>
  );
}

function UnlockButton({ entryId, onDone }: { entryId: string; onDone: () => void }) {
  const [state, formAction] = useActionState(unlockEntryAction, null);
  const handled = useRef<ActionState>(null);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.ok) {
      toast.success(state.message ?? "Operation unlocked");
      onDone();
    } else {
      toast.error(actionErrorMessage(state.error));
    }
  }, [state, onDone]);

  return (
    <form action={formAction}>
      <input type="hidden" name="entryId" value={entryId} />
      <SubmitButton pendingText="Unlocking…" variant="outline">
        <Unlock data-icon="inline-start" />
        Unlock
      </SubmitButton>
    </form>
  );
}

export function EntryDrawer({ entry, open, onOpenChange, siblingMachines, canMove, tz, onChanged }: EntryDrawerProps) {
  const statusMeta = entry ? OPERATION_STATUS_META[entry.status] : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
        {entry ? (
          <>
            <SheetHeader className="border-b">
              <SheetTitle className="flex items-center gap-2">
                <Link href={`/orders/${entry.orderId}`} className="font-mono underline-offset-4 hover:underline">
                  {entry.orderNumber}
                </Link>
                <span className="text-muted-foreground">op {entry.sequence}</span>
                {entry.locked ? <Lock className="size-4 text-muted-foreground" aria-label="Locked" /> : null}
              </SheetTitle>
              <SheetDescription>
                {entry.productSku} · {entry.productName}
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-col gap-4 p-4">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Status</dt>
                <dd>{statusMeta ? <Badge variant="outline" className={statusMeta.className}>{statusMeta.label}</Badge> : entry.status}</dd>
                <dt className="text-muted-foreground">Machine</dt>
                <dd>
                  <span className="font-mono">{entry.machineCode}</span>
                  <span className="text-muted-foreground"> · {entry.machineName}</span>
                </dd>
                <dt className="text-muted-foreground">Planned window</dt>
                <dd>{entry.windowLabel}</dd>
                <dt className="text-muted-foreground">Order</dt>
                <dd>
                  <Link href={`/orders/${entry.orderId}`} className="underline-offset-4 hover:underline">
                    Open order
                  </Link>
                </dd>
              </dl>

              {entry.conflicts.length > 0 ? (
                <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <h3 className="text-sm font-semibold text-amber-900">Conflicts</h3>
                  <ul className="flex flex-col gap-1.5">
                    {entry.conflicts.map((c) => (
                      <li key={c.id} className="text-sm text-amber-900">
                        <Badge
                          variant="outline"
                          className={
                            c.severity === "CRITICAL"
                              ? "mr-1.5 border-red-300 bg-red-100 text-red-800"
                              : "mr-1.5 border-amber-300 bg-amber-100 text-amber-800"
                          }
                        >
                          {c.severity === "CRITICAL" ? "Critical" : "Warning"}
                        </Badge>
                        {c.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {canMove && entry.locked ? <UnlockButton entryId={entry.id} onDone={onChanged} /> : null}

              {canMove && entry.status !== "IN_PROGRESS" && entry.status !== "COMPLETED" ? (
                <MoveToForm entry={entry} siblingMachines={siblingMachines} tz={tz} onDone={onChanged} />
              ) : null}
            </div>

            <SheetFooter className="mt-auto border-t">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
