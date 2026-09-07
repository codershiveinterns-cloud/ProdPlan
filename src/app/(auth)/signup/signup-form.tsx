"use client";

import { useActionState } from "react";
import { signupAction } from "@/app/(auth)/actions";
import { FormError } from "@/app/(auth)/_components/form-error";
import { TextField } from "@/app/(auth)/_components/text-field";
import { fieldErrorsFor } from "@/components/forms/action-state";
import { Combobox, type ComboboxOption } from "@/components/forms/Combobox";
import { FormField } from "@/components/forms/FormField";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { FieldGroup, FieldSeparator } from "@/components/ui/field";

export function SignupForm({ timezones, defaultTimezone }: { timezones: ComboboxOption[]; defaultTimezone: string }) {
  const [state, formAction] = useActionState(signupAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <FormError message={state && !state.ok ? state.error : undefined} />
      <FieldGroup>
        <TextField
          id="signup-company"
          name="company"
          label="Company name"
          autoComplete="organization"
          placeholder="Acme Precision Works"
          required
          autoFocus
          maxLength={120}
          errors={fieldErrorsFor(state, "company")}
        />
        <FormField
          label="Plant timezone"
          htmlFor="signup-timezone"
          required
          description="Shift calendars, due dates and “today” are calculated in this timezone."
          errors={fieldErrorsFor(state, "timezone")}
        >
          <Combobox
            name="timezone"
            options={timezones}
            defaultValue={defaultTimezone}
            placeholder="Choose a timezone"
            searchPlaceholder="Search timezone…"
            emptyText="No timezone found"
            required
          />
        </FormField>
        <FieldSeparator />
        <TextField
          id="signup-name"
          name="name"
          label="Your name"
          autoComplete="name"
          placeholder="Priya Sharma"
          required
          maxLength={120}
          errors={fieldErrorsFor(state, "name")}
        />
        <TextField
          id="signup-email"
          name="email"
          type="email"
          label="Email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@company.com"
          required
          errors={fieldErrorsFor(state, "email")}
        />
        <TextField
          id="signup-password"
          name="password"
          type="password"
          label="Password"
          autoComplete="new-password"
          description="8–72 characters. It must not be the same as your email."
          required
          minLength={8}
          maxLength={72}
          errors={fieldErrorsFor(state, "password")}
        />
      </FieldGroup>
      <SubmitButton className="w-full" pendingText="Creating workspace…">
        Create workspace
      </SubmitButton>
    </form>
  );
}
