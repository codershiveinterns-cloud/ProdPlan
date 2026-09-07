"use client";

import Link from "next/link";

import { FieldErrors } from "@/components/forms/FieldErrors";
import { FormField } from "@/components/forms/FormField";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { actionErrorMessage, fieldErrorsFor } from "@/components/forms/action-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { useFormAction } from "@/app/(app)/machines/_components/use-form-action";
import { createCalendarAction } from "../actions";

/** /calendars/new: name only — the calendar is created with one default shift, then the editor opens. */
export function NewCalendarForm({ defaultShiftSummary }: { defaultShiftSummary: string }) {
  const { state, formAction, formKey, value } = useFormAction(createCalendarAction);
  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-6" noValidate>
      {state && !state.ok && !state.fieldErrors ? <FieldErrors errors={[actionErrorMessage(state.error)]} /> : null}
      <div key={formKey} className="flex flex-col gap-5">
        <FormField
          label="Calendar name"
          htmlFor="name"
          required
          description="For example “Two shifts”, “Night line” or “Maintenance crew”."
          errors={fieldErrorsFor(state, "name")}
        >
          <Input name="name" defaultValue={value("name", "")} maxLength={80} autoComplete="off" autoFocus />
        </FormField>
        <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-3 text-sm">
          <p className="font-medium">Starts with one shift</p>
          <p className="text-muted-foreground">{defaultShiftSummary}. You can edit it and add more shifts and exceptions on the next screen.</p>
        </div>
      </div>
      <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <Button variant="outline" asChild>
          <Link href="/calendars">Cancel</Link>
        </Button>
        <SubmitButton pendingText="Creating…">Create calendar</SubmitButton>
      </div>
    </form>
  );
}
