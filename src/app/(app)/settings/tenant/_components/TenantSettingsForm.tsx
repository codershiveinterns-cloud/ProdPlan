"use client";

import Link from "next/link";
import { useActionState } from "react";

import { updateTenantSettingsAction } from "@/app/(app)/settings/actions";
import { Combobox, type ComboboxOption } from "@/components/forms/Combobox";
import { FieldErrors } from "@/components/forms/FieldErrors";
import { FormField } from "@/components/forms/FormField";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { ToastOnResult } from "@/components/forms/ToastOnResult";
import { actionErrorMessage, fieldErrorsFor } from "@/components/forms/action-state";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CalendarOption } from "@/lib/tenant/settings";

export type TenantSettingsFormProps = {
  tenant: { name: string; timezone: string; defaultCalendarId: string | null };
  calendars: CalendarOption[];
  timezones: ComboboxOption[];
};

export function TenantSettingsForm({ tenant, calendars, timezones }: TenantSettingsFormProps) {
  const [state, formAction] = useActionState(updateTenantSettingsAction, null);
  const calendarErrors = fieldErrorsFor(state, "defaultCalendarId");

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <ToastOnResult state={state} successMessage="Plant settings saved" />
      {state && !state.ok && !state.fieldErrors ? <FieldErrors errors={[actionErrorMessage(state.error)]} /> : null}
      <div className="grid gap-5 md:grid-cols-2">
        <FormField label="Company name" htmlFor="name" required errors={fieldErrorsFor(state, "name")}>
          <Input name="name" defaultValue={tenant.name} maxLength={120} autoComplete="organization" required />
        </FormField>
        <FormField
          label="Plant timezone"
          htmlFor="timezone"
          required
          description="Due dates, “today” and shift times are calculated in this timezone."
          errors={fieldErrorsFor(state, "timezone")}
        >
          <Combobox
            name="timezone"
            options={timezones}
            defaultValue={tenant.timezone}
            placeholder="Choose a timezone"
            searchPlaceholder="Search timezone…"
            emptyText="No timezone found"
            required
          />
        </FormField>
        <FormField
          label="Default shift calendar"
          htmlFor="defaultCalendarId"
          required
          description="Pre-filled when a machine is created. Existing machines keep their own calendar."
          errors={calendarErrors}
          className="md:col-span-2"
        >
          {calendars.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No shift calendars yet —{" "}
              <Link href="/calendars/new?return=/settings/tenant" className="font-medium underline underline-offset-4">
                Create one
              </Link>
            </p>
          ) : (
            <Select name="defaultCalendarId" defaultValue={tenant.defaultCalendarId ?? undefined} required>
              <SelectTrigger
                id="defaultCalendarId"
                className="w-full"
                aria-invalid={calendarErrors ? true : undefined}
                aria-describedby={[
                  "defaultCalendarId-description",
                  calendarErrors ? "defaultCalendarId-error" : undefined,
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <SelectValue placeholder="Select a calendar" />
              </SelectTrigger>
              <SelectContent>
                {calendars.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    {c.isActive ? "" : " (inactive)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
      </div>
      <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
      </div>
    </form>
  );
}
