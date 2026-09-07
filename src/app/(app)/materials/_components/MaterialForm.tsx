"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { FieldErrors } from "@/components/forms/FieldErrors";
import { FormField } from "@/components/forms/FormField";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { ToastOnResult } from "@/components/forms/ToastOnResult";
import { UnitInput } from "@/components/forms/UnitInput";
import { actionErrorMessage, fieldErrorsFor } from "@/components/forms/action-state";
import type { MaterialDTO } from "@/lib/materials/dto";

import { createMaterialAction, updateMaterialAction } from "../actions";
import { SuffixInput } from "./SuffixInput";

export type MaterialFormProps = {
  /** Present when editing; absent when creating. */
  material?: MaterialDTO;
  /** Where Cancel goes (the detail page when editing, the list when creating). */
  cancelHref: string;
};

/** Create / edit form (docs/M1_SPEC.md §6.4 "Form"): code, name, unit, reorder threshold, lead time, unit cost, supplier, active. */
export function MaterialForm({ material, cancelHref }: MaterialFormProps) {
  const action = material ? updateMaterialAction.bind(null, material.id) : createMaterialAction;
  const [state, formAction] = useActionState(action, null);
  const [unit, setUnit] = useState(material?.unit ?? "pcs");
  const unitLabel = unit.trim().toLowerCase() || "pcs";

  return (
    <form action={formAction} noValidate className="flex flex-col gap-6">
      <ToastOnResult state={state} successMessage="Material saved" />
      {state && !state.ok && !state.fieldErrors ? <FieldErrors errors={[actionErrorMessage(state.error)]} /> : null}

      <div className="grid gap-5 md:grid-cols-2">
        <FormField label="Code" htmlFor="code" required errors={fieldErrorsFor(state, "code")} description="Unique within your plant, e.g. RM-AL6061-BAR.">
          <Input
            name="code"
            defaultValue={material?.code}
            maxLength={64}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="font-mono"
            autoFocus={!material}
          />
        </FormField>

        <FormField label="Name" htmlFor="name" required errors={fieldErrorsFor(state, "name")}>
          <Input name="name" defaultValue={material?.name} maxLength={120} autoComplete="off" />
        </FormField>

        <FormField
          label="Unit"
          htmlFor="unit"
          required
          errors={fieldErrorsFor(state, "unit")}
          description="Quantities are shown with this suffix everywhere."
        >
          <UnitInput name="unit" defaultValue={material?.unit ?? "pcs"} onChange={(event) => setUnit(event.target.value)} />
        </FormField>

        <FormField
          label="Reorder threshold"
          htmlFor="reorderThreshold"
          errors={fieldErrorsFor(state, "reorderThreshold")}
          description="Flagged “Below reorder” once stock on hand is at or below this level."
        >
          <SuffixInput
            name="reorderThreshold"
            type="number"
            inputMode="decimal"
            step="0.001"
            min="0"
            defaultValue={material?.reorderThreshold ?? 0}
            suffix={unitLabel}
          />
        </FormField>

        <FormField
          label="Reorder lead time"
          htmlFor="reorderLeadTimeDays"
          errors={fieldErrorsFor(state, "reorderLeadTimeDays")}
          description="Days from order to delivery with the usual supplier."
        >
          <SuffixInput
            name="reorderLeadTimeDays"
            type="number"
            inputMode="numeric"
            step="1"
            min="0"
            max="3650"
            defaultValue={material?.reorderLeadTimeDays ?? 0}
            suffix="days"
          />
        </FormField>

        <FormField label="Unit cost" htmlFor="unitCost" hint="Optional" errors={fieldErrorsFor(state, "unitCost")}>
          <SuffixInput
            name="unitCost"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            defaultValue={material?.unitCost ?? ""}
            suffix={`per ${unitLabel}`}
          />
        </FormField>

        <FormField label="Supplier" htmlFor="supplier" hint="Optional" errors={fieldErrorsFor(state, "supplier")}>
          <Input name="supplier" defaultValue={material?.supplier ?? ""} maxLength={120} autoComplete="organization" />
        </FormField>

        <FormField
          label="Status"
          htmlFor="isActive"
          errors={fieldErrorsFor(state, "isActive")}
          description="Inactive materials are hidden from pickers and from the list unless “Include inactive” is on."
        >
          {/* Explicit id so FormField's injected id lands here, not on the checkbox (which keeps `isActive` for the label). */}
          <div id="isActive-field" className="flex h-11 items-center">
            <input type="hidden" name="isActive" value="false" />
            <label htmlFor="isActive" className="flex items-center gap-3 text-sm">
              <Checkbox
                id="isActive"
                name="isActive"
                value="true"
                defaultChecked={material?.isActive ?? true}
                aria-describedby="isActive-description"
              />
              Active
            </label>
          </div>
        </FormField>
      </div>

      <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <Button variant="outline" asChild>
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        <SubmitButton pendingText="Saving…">{material ? "Save changes" : "Create material"}</SubmitButton>
      </div>
    </form>
  );
}
