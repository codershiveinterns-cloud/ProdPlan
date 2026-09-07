"use client";

import { useActionState } from "react";

import { changePasswordAction } from "@/app/(app)/settings/actions";
import { FieldErrors } from "@/components/forms/FieldErrors";
import { FormField } from "@/components/forms/FormField";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { ToastOnResult } from "@/components/forms/ToastOnResult";
import { actionErrorMessage, fieldErrorsFor } from "@/components/forms/action-state";
import { Input } from "@/components/ui/input";

/** Current + new + confirm. The action re-issues the session cookie, so this device stays signed in. */
export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const [state, formAction] = useActionState(changePasswordAction, null);
  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <ToastOnResult state={state} successMessage="Password changed" />
      {state && !state.ok && !state.fieldErrors ? <FieldErrors errors={[actionErrorMessage(state.error)]} /> : null}
      <FormField
        label="Current password"
        htmlFor="currentPassword"
        required
        errors={fieldErrorsFor(state, "currentPassword")}
        description={forced ? "The temporary password you signed in with." : undefined}
      >
        <Input name="currentPassword" type="password" autoComplete="current-password" maxLength={72} required autoFocus={forced} />
      </FormField>
      <FormField
        label="New password"
        htmlFor="newPassword"
        required
        description="8–72 characters. It must not be the same as your email."
        errors={fieldErrorsFor(state, "newPassword")}
      >
        <Input name="newPassword" type="password" autoComplete="new-password" minLength={8} maxLength={72} required />
      </FormField>
      <FormField label="Confirm new password" htmlFor="confirmPassword" required errors={fieldErrorsFor(state, "confirmPassword")}>
        <Input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} maxLength={72} required />
      </FormField>
      <div className="flex justify-end">
        <SubmitButton pendingText="Updating…">{forced ? "Set new password" : "Change password"}</SubmitButton>
      </div>
    </form>
  );
}
