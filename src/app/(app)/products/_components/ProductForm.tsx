"use client";

import { useActionState } from "react";
import Link from "next/link";

import { FieldErrors } from "@/components/forms/FieldErrors";
import { FormField } from "@/components/forms/FormField";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { ToastOnResult } from "@/components/forms/ToastOnResult";
import { UnitInput } from "@/components/forms/UnitInput";
import { actionErrorMessage, fieldErrorsFor } from "@/components/forms/action-state";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ProductDTO } from "@/lib/products/queries";

import { createProductAction, updateProductAction } from "../actions";
import { useSubmittedValues } from "./useSubmittedValues";

export type ProductFormProps = {
  /** Present in edit mode. */
  product?: ProductDTO;
  /** Where Cancel goes (and, for create, where the action returns to when set). */
  cancelHref: string;
  returnTo?: string;
};

/** Create / edit form (spec §6.5: sku, name, description, unit, active). Two columns from md, sticky bar below md. */
export function ProductForm({ product, cancelHref, returnTo }: ProductFormProps) {
  const editing = Boolean(product);
  const [state, formAction] = useActionState(editing ? updateProductAction : createProductAction, null);
  const { attempt, capture, get } = useSubmittedValues(state);

  return (
    <form action={formAction} onSubmit={(e) => capture(e.currentTarget)} className="flex flex-col gap-6" noValidate>
      <ToastOnResult state={state} successMessage={editing ? "Product saved" : "Product created"} />
      {product ? <input type="hidden" name="productId" value={product.id} /> : null}
      {returnTo ? <input type="hidden" name="return" value={returnTo} /> : null}
      {state && !state.ok && !state.fieldErrors ? <FieldErrors errors={[actionErrorMessage(state.error)]} /> : null}

      <div key={attempt} className="grid gap-5 md:grid-cols-2">
        <FormField
          label="SKU"
          htmlFor="sku"
          required
          errors={fieldErrorsFor(state, "sku")}
          description="Unique product code, e.g. HB-200. Orders and CSV imports reference it."
        >
          <Input
            name="sku"
            defaultValue={get("sku", product?.sku ?? "")}
            maxLength={64}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="font-mono"
            autoFocus={!editing}
          />
        </FormField>
        <FormField label="Name" htmlFor="name" required errors={fieldErrorsFor(state, "name")}>
          <Input name="name" defaultValue={get("name", product?.name ?? "")} maxLength={120} autoComplete="off" />
        </FormField>
        <FormField
          label="Unit"
          htmlFor="unit"
          required
          errors={fieldErrorsFor(state, "unit")}
          description="Unit of one product (pcs, kg, m …). Shown after every quantity."
        >
          <UnitInput name="unit" defaultValue={get("unit", product?.unit ?? "pcs")} />
        </FormField>
        {editing ? (
          <FormField
            label="Active"
            htmlFor="isActive"
            errors={fieldErrorsFor(state, "isActive")}
            description="Inactive products are hidden from order forms and CSV imports."
          >
            <div id="isActive-control" className="flex h-11 items-center gap-3">
              <input type="hidden" name="isActive" value="false" />
              <Checkbox id="isActive" name="isActive" value="on" defaultChecked={get("isActive", product?.isActive === false ? "false" : "on") === "on"} />
              <label htmlFor="isActive" className="text-sm">
                Product is active
              </label>
            </div>
          </FormField>
        ) : null}
        <FormField
          label="Description"
          htmlFor="description"
          hint="Optional"
          errors={fieldErrorsFor(state, "description")}
          className="md:col-span-2"
        >
          <Textarea name="description" defaultValue={get("description", product?.description ?? "")} rows={3} maxLength={2000} />
        </FormField>
      </div>

      <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <Button variant="outline" asChild>
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        <SubmitButton pendingText="Saving…">{editing ? "Save product" : "Create product"}</SubmitButton>
      </div>
    </form>
  );
}
