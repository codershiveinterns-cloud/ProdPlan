"use client";

import { useActionState } from "react";

import { updateProfileNameAction } from "@/app/(app)/settings/actions";
import { FieldErrors } from "@/components/forms/FieldErrors";
import { FormField } from "@/components/forms/FormField";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { ToastOnResult } from "@/components/forms/ToastOnResult";
import { actionErrorMessage, fieldErrorsFor } from "@/components/forms/action-state";
import { Input } from "@/components/ui/input";

export function ProfileNameForm({ name, email }: { name: string; email: string }) {
  const [state, formAction] = useActionState(updateProfileNameAction, null);
  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <ToastOnResult state={state} successMessage="Name updated" />
      {state && !state.ok && !state.fieldErrors ? <FieldErrors errors={[actionErrorMessage(state.error)]} /> : null}
      <FormField label="Name" htmlFor="profile-name" required errors={fieldErrorsFor(state, "name")}>
        <Input name="name" defaultValue={name} maxLength={120} autoComplete="name" required />
      </FormField>
      <FormField label="Email" htmlFor="profile-email" hint="Ask an admin to change it">
        <Input id="profile-email" value={email} readOnly disabled autoComplete="email" />
      </FormField>
      <div className="flex justify-end">
        <SubmitButton pendingText="Saving…">Save name</SubmitButton>
      </div>
    </form>
  );
}
