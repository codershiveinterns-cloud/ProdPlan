"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MachineOption, OperationDTO, WorkCenterOption } from "@/lib/products/queries";

import { addOperationAction, updateOperationAction } from "../actions";
import { useSubmittedValues } from "./useSubmittedValues";

export type OperationDialogProps = {
  productId: string;
  productUnit: string;
  workCenters: WorkCenterOption[];
  machines: MachineOption[];
  /** Present in edit mode. */
  operation?: OperationDTO;
  trigger: ReactNode;
};

/** Radix Select forbids an empty item value, so "any machine" travels as this sentinel and posts as "". */
const ANY_MACHINE = "__any__";

function OperationForm({
  productId,
  productUnit,
  workCenters,
  machines,
  operation,
  close,
}: Omit<OperationDialogProps, "trigger"> & { close: () => void }) {
  const editing = Boolean(operation);
  const [state, formAction] = useActionState(editing ? updateOperationAction : addOperationAction, null);
  const [workCenterId, setWorkCenterId] = useState(operation?.workCenterId ?? "");
  const [machineId, setMachineId] = useState(operation?.machineId ?? "");
  const { attempt, capture, get } = useSubmittedValues(state);

  const machinesInCenter = useMemo(
    () => machines.filter((m) => m.workCenterId === workCenterId),
    [machines, workCenterId],
  );

  const handled = useRef<ActionState>(null);
  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.ok) {
      toast.success(state.message ?? "Saved");
      close();
    }
  }, [state, close]);

  const failed = state && !state.ok ? state : null;
  const wcErrors = fieldErrorsFor(state, "workCenterId");
  const machineErrors = fieldErrorsFor(state, "machineId");

  return (
    <form action={formAction} onSubmit={(e) => capture(e.currentTarget)} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="productId" value={productId} />
      {operation ? <input type="hidden" name="operationId" value={operation.id} /> : null}
      <input type="hidden" name="workCenterId" value={workCenterId} />
      <input type="hidden" name="machineId" value={machineId} />
      {failed && !failed.fieldErrors ? <FieldErrors errors={[actionErrorMessage(failed.error)]} /> : null}

      <FormField label="Work center" htmlFor="workCenterId" required errors={wcErrors}>
        <Select
          value={workCenterId}
          onValueChange={(value) => {
            setWorkCenterId(value);
            setMachineId("");
          }}
        >
          <SelectTrigger
            id="workCenterId"
            className="w-full"
            aria-invalid={wcErrors ? true : undefined}
            aria-describedby={wcErrors ? "workCenterId-error" : undefined}
          >
            <SelectValue placeholder="Select a work center" />
          </SelectTrigger>
          <SelectContent>
            {workCenters.map((wc) => (
              <SelectItem key={wc.id} value={wc.id}>
                <span className="font-mono">{wc.code}</span>
                <span className="text-muted-foreground">{wc.name}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField
        label="Fixed machine"
        htmlFor="machineId"
        hint="Optional"
        errors={machineErrors}
        description="Blank = any machine in the work center."
      >
        <Select
          value={machineId === "" ? ANY_MACHINE : machineId}
          onValueChange={(value) => setMachineId(value === ANY_MACHINE ? "" : value)}
          disabled={!workCenterId}
        >
          <SelectTrigger
            id="machineId"
            className="w-full"
            aria-invalid={machineErrors ? true : undefined}
            aria-describedby={[machineErrors ? "machineId-error" : null, "machineId-description"].filter(Boolean).join(" ")}
          >
            <SelectValue placeholder={workCenterId ? "Any machine" : "Select a work center first"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY_MACHINE}>Any machine in the work center</SelectItem>
            {machinesInCenter.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                <span className="font-mono">{m.code}</span>
                <span className="text-muted-foreground">{m.name}</span>
                {m.status === "MAINTENANCE" ? <span className="text-xs text-amber-700">Maintenance</span> : null}
                {m.status === "INACTIVE" ? <span className="text-xs text-muted-foreground">Inactive</span> : null}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <div key={attempt} className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Setup minutes"
          htmlFor="setupMinutes"
          errors={fieldErrorsFor(state, "setupMinutes")}
          description="Once per order, before the first unit."
        >
          <Input
            name="setupMinutes"
            type="number"
            inputMode="numeric"
            step="1"
            min="0"
            defaultValue={get("setupMinutes", operation ? String(operation.setupMinutes) : "0")}
          />
        </FormField>
        <FormField
          label="Run minutes per unit"
          htmlFor="runMinutesPerUnit"
          required
          hint={`min per ${productUnit}`}
          errors={fieldErrorsFor(state, "runMinutesPerUnit")}
          description="At 100 % efficiency; machine efficiency is applied when scheduling."
        >
          <Input
            name="runMinutesPerUnit"
            type="number"
            inputMode="decimal"
            step="0.001"
            min="0"
            defaultValue={get("runMinutesPerUnit", operation ? String(operation.runMinutesPerUnit) : "")}
          />
        </FormField>
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <SubmitButton pendingText="Saving…">{editing ? "Save step" : "Add step"}</SubmitButton>
      </DialogFooter>
    </form>
  );
}

/**
 * Add / edit one routing step (spec §6.5 `OperationDialog`). Sequence numbers are assigned by the server
 * (10, 20, 30 …); the fixed-machine Select only offers machines of the chosen work center.
 */
export function OperationDialog({ trigger, ...formProps }: OperationDialogProps) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const close = useCallback(() => setOpen(false), []);
  const editing = Boolean(formProps.operation);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setFormKey((k) => k + 1);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editing ? `Edit step ${formProps.operation?.sequence} · ${formProps.operation?.workCenterCode}` : "Add routing step"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Change the work center, fixed machine or timings. Use the Up/Down buttons to reorder."
              : "New steps are appended to the end of the routing (sequence 10, 20, 30 …)."}
          </DialogDescription>
        </DialogHeader>
        <OperationForm key={formKey} {...formProps} close={close} />
      </DialogContent>
    </Dialog>
  );
}
