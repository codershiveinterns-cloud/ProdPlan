"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/(auth)/actions";
import { FormError } from "@/app/(auth)/_components/form-error";
import { TextField } from "@/app/(auth)/_components/text-field";
import { fieldErrorsFor } from "@/components/forms/action-state";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { FieldGroup } from "@/components/ui/field";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction] = useActionState(loginAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="next" value={next} />
      <FormError message={state && !state.ok ? state.error : undefined} />
      <FieldGroup>
        <TextField
          id="login-email"
          name="email"
          type="email"
          label="Email"
          autoComplete="username"
          inputMode="email"
          placeholder="you@company.com"
          required
          autoFocus
          errors={fieldErrorsFor(state, "email")}
        />
        <TextField
          id="login-password"
          name="password"
          type="password"
          label="Password"
          autoComplete="current-password"
          required
          errors={fieldErrorsFor(state, "password")}
        />
      </FieldGroup>
      <SubmitButton className="w-full" pendingText="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
