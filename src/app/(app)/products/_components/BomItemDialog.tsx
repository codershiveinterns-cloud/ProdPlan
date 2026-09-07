"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Combobox } from "@/components/forms/Combobox";
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
import type { BomLineDTO, MaterialOption } from "@/lib/products/queries";

import { addBomItemAction, updateBomItemAction } from "../actions";
import { useSubmittedValues } from "./useSubmittedValues";

export type BomItemDialogProps = {
  productId: string;
  productUnit: string;
  /** Active materials (the Combobox shows code · name with the unit as hint). */
  materials: MaterialOption[];
  /** Present in edit mode: the material is fixed, quantity / scrap / note are editable. */
  item?: BomLineDTO;
  trigger: ReactNode;
};

function BomItemForm({
  productId,
  productUnit,
  materials,
  item,
  close,
}: Omit<BomItemDialogProps, "trigger"> & { close: () => void }) {
  const editing = Boolean(item);
  const [state, formAction] = useActionState(editing ? updateBomItemAction : addBomItemAction, null);
  const [materialUnit, setMaterialUnit] = useState<string | null>(item?.materialUnit ?? null);
  const { attempt, capture, get } = useSubmittedValues(state);

  const options = useMemo(
    () => materials.map((m) => ({ value: m.id, label: `${m.code} · ${m.name}`, hint: m.unit })),
    [materials],
  );
  const unitByMaterial = useMemo(() => new Map(materials.map((m) => [m.id, m.unit])), [materials]);

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
  const qtyHint = `${materialUnit ?? "material unit"} per ${productUnit}`;

  return (
    <form action={formAction} onSubmit={(e) => capture(e.currentTarget)} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="productId" value={productId} />
      {item ? <input type="hidden" name="bomItemId" value={item.id} /> : null}
      {failed && !failed.fieldErrors ? <FieldErrors errors={[actionErrorMessage(failed.error)]} /> : null}

      {item ? (
        <FormField label="Material" htmlFor="materialId" hint="Fixed for this line">
          <div className="flex h-11 items-center gap-2 rounded-lg border border-input bg-muted/60 px-3 text-sm">
            <input type="hidden" name="materialId" value={item.materialId} />
            <span className="font-mono">{item.materialCode}</span>
            <span className="truncate">{item.materialName}</span>
            <span className="ml-auto text-muted-foreground">{item.materialUnit}</span>
          </div>
        </FormField>
      ) : (
        <FormField label="Material" htmlFor="materialId" required errors={fieldErrorsFor(state, "materialId")}>
          <Combobox
            name="materialId"
            options={options}
            placeholder="Select a material"
            searchPlaceholder="Search code or name…"
            emptyText="No active material matches"
            required
            onValueChange={(value) => setMaterialUnit(unitByMaterial.get(value) ?? null)}
          />
        </FormField>
      )}

      <div key={attempt} className="contents">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Quantity per unit"
          htmlFor="quantityPerUnit"
          required
          hint={qtyHint}
          errors={fieldErrorsFor(state, "quantityPerUnit")}
          description={`Material needed for one ${productUnit}, before scrap.`}
        >
          <Input
            name="quantityPerUnit"
            type="number"
            inputMode="decimal"
            step="0.001"
            min="0"
            defaultValue={get("quantityPerUnit", item ? String(item.quantityPerUnit) : "")}
          />
        </FormField>
        <FormField
          label="Scrap %"
          htmlFor="scrapPercent"
          errors={fieldErrorsFor(state, "scrapPercent")}
          description="Allowance added on top: required = qty × (1 + scrap %)."
        >
          <Input
            name="scrapPercent"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            max="100"
            defaultValue={get("scrapPercent", item ? String(item.scrapPercent) : "0")}
          />
        </FormField>
      </div>

      <FormField label="Note" htmlFor="note" hint="Optional" errors={fieldErrorsFor(state, "note")}>
        <Input name="note" defaultValue={get("note", item?.note ?? "")} maxLength={500} placeholder="e.g. cut to 200 mm" />
      </FormField>
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <SubmitButton pendingText="Saving…">{editing ? "Save line" : "Add to BOM"}</SubmitButton>
      </DialogFooter>
    </form>
  );
}

/**
 * Add / edit one BOM line (spec §6.5 `BomItemDialog`). The form remounts on every open so stale errors never
 * show; a duplicate material comes back from the server as "Already in this BOM" under the Material field.
 */
export function BomItemDialog({ trigger, ...formProps }: BomItemDialogProps) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const close = useCallback(() => setOpen(false), []);
  const editing = Boolean(formProps.item);

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
          <DialogTitle>{editing ? `Edit ${formProps.item?.materialCode}` : "Add material to BOM"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Change the quantity, scrap allowance or note for this line."
              : "Quantities are in the material's unit per one product unit (no unit conversion in M1)."}
          </DialogDescription>
        </DialogHeader>
        <BomItemForm key={formKey} {...formProps} close={close} />
      </DialogContent>
    </Dialog>
  );
}
