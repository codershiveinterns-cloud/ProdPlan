"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PackagePlus } from "lucide-react";
import { toast } from "sonner";

import type { StockMovementType } from "@/generated/prisma/enums";
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
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/forms/FormField";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { actionErrorMessage, fieldErrorsFor, type ActionState } from "@/components/forms/action-state";
import { MOVEMENT_TYPE_META, MOVEMENT_TYPES } from "@/lib/materials/movement-types";

import { recordMovementAction } from "../actions";
import { SuffixInput } from "./SuffixInput";

export type MovementDialogProps = {
  materialId: string;
  materialCode: string;
  unit: string;
  /** Pre-formatted "120 kg" (formatting happens in the Server Component). */
  onHandLabel: string;
  /** Whether the actor may record ADJUSTMENT (`stock:adjust`); the option is hidden otherwise. */
  canAdjust: boolean;
  /** Open on mount (e.g. `/materials/[id]?move=1` from the list row menu). */
  defaultOpen?: boolean;
  triggerVariant?: "default" | "outline";
};

function MovementForm({
  materialId,
  unit,
  onHandLabel,
  canAdjust,
  close,
}: Pick<MovementDialogProps, "materialId" | "unit" | "onHandLabel" | "canAdjust"> & { close: () => void }) {
  const [state, formAction] = useActionState(recordMovementAction, null);
  const [type, setType] = useState<StockMovementType>("RECEIPT");
  const meta = MOVEMENT_TYPE_META[type];
  const types = MOVEMENT_TYPES.filter((t) => t !== "ADJUSTMENT" || canAdjust);

  // Each result is handled once, even if the closing dialog re-renders during its exit animation.
  const handled = useRef<ActionState>(null);
  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.ok) {
      toast.success(state.message ?? "Movement recorded");
      close();
    }
  }, [state, close]);

  const failed = state && !state.ok ? state : null;
  const typeErrors = fieldErrorsFor(state, "type");

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="materialId" value={materialId} />

      <FormField label="Type" htmlFor="type" required errors={typeErrors} description={meta.description}>
        <Select name="type" value={type} onValueChange={(value) => setType(value as StockMovementType)}>
          <SelectTrigger
            id="type"
            className="w-full"
            aria-invalid={typeErrors ? true : undefined}
            aria-describedby={typeErrors ? "type-description type-error" : "type-description"}
          >
            <SelectValue placeholder="Select a movement type" />
          </SelectTrigger>
          <SelectContent>
            {types.map((t) => (
              <SelectItem key={t} value={t}>
                {MOVEMENT_TYPE_META[t].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      {type === "ADJUSTMENT" ? (
        <FormField
          label="New stock on hand"
          htmlFor="newStock"
          required
          errors={fieldErrorsFor(state, "newStock")}
          description={`Currently ${onHandLabel}. The difference is recorded as the adjustment.`}
        >
          <SuffixInput
            key="newStock"
            name="newStock"
            type="number"
            inputMode="decimal"
            step="0.001"
            min="0"
            autoFocus
            suffix={unit}
          />
        </FormField>
      ) : (
        <FormField
          label="Quantity"
          htmlFor="quantity"
          required
          errors={fieldErrorsFor(state, "quantity")}
          description={`Currently ${onHandLabel}. Enter a quantity greater than 0 (up to 3 decimals).`}
        >
          <SuffixInput
            key="quantity"
            name="quantity"
            type="number"
            inputMode="decimal"
            step="0.001"
            min="0.001"
            autoFocus
            suffix={unit}
          />
        </FormField>
      )}

      <FormField
        label="Reference"
        htmlFor="reference"
        hint="Optional"
        errors={fieldErrorsFor(state, "reference")}
        description="GRN, work order, batch or invoice number."
      >
        <Input name="reference" maxLength={64} autoComplete="off" />
      </FormField>

      <FormField label="Note" htmlFor="note" hint="Optional" errors={fieldErrorsFor(state, "note")}>
        <Textarea name="note" rows={2} maxLength={500} className="min-h-20" />
      </FormField>

      {failed && !failed.fieldErrors ? (
        <Alert variant="destructive">
          <AlertDescription>{actionErrorMessage(failed.error)}</AlertDescription>
        </Alert>
      ) : null}

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <SubmitButton pendingText="Recording…">Record {meta.label.toLowerCase()}</SubmitButton>
      </DialogFooter>
    </form>
  );
}

/**
 * "Record movement" dialog (docs/M1_SPEC.md §6.4): Type, Quantity (or "New stock on hand" for ADJUSTMENT),
 * Reference, Note. The form remounts every time the dialog opens so stale results never show.
 */
export function MovementDialog({
  materialId,
  materialCode,
  unit,
  onHandLabel,
  canAdjust,
  defaultOpen = false,
  triggerVariant = "default",
}: MovementDialogProps) {
  const [open, setOpen] = useState(defaultOpen);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const onOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      // Drop a `?move=1` deep link once the dialog closes so a reload does not reopen it.
      if (!next && searchParams.has("move")) {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("move");
        const query = params.toString();
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
      }
    },
    [pathname, router, searchParams],
  );
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant}>
          <PackagePlus data-icon="inline-start" />
          Record movement
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record movement · {materialCode}</DialogTitle>
          <DialogDescription>
            Receipts and returns add to stock on hand, issues remove from it. Stock can never go below zero.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <MovementForm
            materialId={materialId}
            unit={unit}
            onHandLabel={onHandLabel}
            canAdjust={canAdjust}
            close={close}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
