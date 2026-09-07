"use client";

import { useActionState } from "react";
import Link from "next/link";

import { FieldErrors } from "@/components/forms/FieldErrors";
import { FormField } from "@/components/forms/FormField";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { ToastOnResult } from "@/components/forms/ToastOnResult";
import { actionErrorMessage, fieldErrorsFor } from "@/components/forms/action-state";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createCustomerAction, updateCustomerAction } from "@/app/(app)/customers/actions";
import { useFormDraft } from "@/app/(app)/orders/_components/use-form-draft";

export type CustomerFormValues = {
  id: string;
  name: string;
  code: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  isActive: boolean;
};

export type CustomerFormProps = {
  mode: "create" | "edit";
  customer?: CustomerFormValues;
  cancelHref: string;
};

/** Create / edit customer (docs/M1_SPEC.md §6.7): name required, code, email, phone, notes (+ Active on edit). */
export function CustomerForm({ mode, customer, cancelHref }: CustomerFormProps) {
  const [state, formAction] = useActionState(mode === "create" ? createCustomerAction : updateCustomerAction, null);
  const { formKey, onSubmit, value } = useFormDraft(state);
  const formError = state && !state.ok && !state.fieldErrors ? actionErrorMessage(state.error) : null;

  return (
    <form key={formKey} action={formAction} onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <ToastOnResult state={state} successMessage={mode === "create" ? "Customer created" : "Customer saved"} />
      {customer ? <input type="hidden" name="customerId" value={customer.id} /> : null}
      {formError ? <FieldErrors errors={[formError]} /> : null}
      <div className="grid gap-5 md:grid-cols-2">
        <FormField label="Name" htmlFor="name" required errors={fieldErrorsFor(state, "name")} className="md:col-span-2">
          <Input name="name" maxLength={120} defaultValue={value("name", customer?.name)} autoComplete="organization" autoFocus={mode === "create"} />
        </FormField>
        <FormField label="Code" htmlFor="code" hint="Optional" errors={fieldErrorsFor(state, "code")}>
          <Input name="code" maxLength={32} defaultValue={value("code", customer?.code)} autoComplete="off" className="font-mono" />
        </FormField>
        <FormField label="Email" htmlFor="email" hint="Optional" errors={fieldErrorsFor(state, "email")}>
          <Input name="email" type="email" inputMode="email" maxLength={254} defaultValue={value("email", customer?.email)} autoComplete="email" />
        </FormField>
        <FormField label="Phone" htmlFor="phone" hint="Optional" errors={fieldErrorsFor(state, "phone")}>
          <Input name="phone" type="tel" inputMode="tel" maxLength={32} defaultValue={value("phone", customer?.phone)} autoComplete="tel" />
        </FormField>
        {mode === "edit" ? (
          <FormField label="Status" htmlFor="isActive" description="Inactive customers are hidden from the order form and the import matcher.">
            <label className="flex h-11 items-center gap-3 text-sm">
              <input type="hidden" name="isActive" value="false" />
              <Checkbox name="isActive" value="true" defaultChecked={value("isActive", customer?.isActive ? "true" : "false") === "true"} />
              Active
            </label>
          </FormField>
        ) : null}
        <FormField label="Notes" htmlFor="notes" hint="Optional" errors={fieldErrorsFor(state, "notes")} className="md:col-span-2">
          <Textarea name="notes" rows={4} maxLength={2000} defaultValue={value("notes", customer?.notes)} />
        </FormField>
      </div>
      <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <Button variant="outline" asChild>
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        <SubmitButton pendingText="Saving…">{mode === "create" ? "Create customer" : "Save customer"}</SubmitButton>
      </div>
    </form>
  );
}
