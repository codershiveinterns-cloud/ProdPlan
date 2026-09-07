"use client";

import type { ReactNode } from "react";

import { DateInput } from "@/components/forms/DateInput";
import { FormField } from "@/components/forms/FormField";
import { fieldErrorsFor } from "@/components/forms/action-state";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { FormDialog } from "@/app/(app)/machines/_components/FormDialog";
import { addExceptionAction, updateExceptionAction } from "../actions";

export type ExceptionDialogException = {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  isWorking: boolean;
  note: string | null;
};

export type ExceptionDialogProps = {
  trigger: ReactNode;
  calendarId: string;
  calendarName: string;
  /** Default date for a new exception (today in the tenant timezone). */
  today: string;
  /** Present → edit mode. */
  exception?: ExceptionDialogException | null;
};

const CHOICES: Array<{ value: "working" | "non-working"; label: string; hint: string }> = [
  { value: "non-working", label: "Non-working", hint: "Holiday or shutdown — no shifts run that day." },
  { value: "working", label: "Working", hint: "All shifts run, even on a non-working weekday (overtime)." },
];

/** Add / edit a calendar exception: date (default today), Working / Non-working, note. */
export function ExceptionDialog({ trigger, calendarId, calendarName, today, exception }: ExceptionDialogProps) {
  const editing = Boolean(exception);
  const action = exception
    ? updateExceptionAction.bind(null, exception.id, calendarId)
    : addExceptionAction.bind(null, calendarId);
  const idPrefix = exception ? `ex-${exception.id}` : `ex-new-${calendarId}`;

  return (
    <FormDialog
      trigger={trigger}
      title={editing ? "Edit exception" : `Add exception to ${calendarName}`}
      description="An exception overrides the weekly pattern for one date."
      action={action}
      submitLabel={editing ? "Save changes" : "Add exception"}
      successMessage={editing ? "Exception saved" : "Exception added"}
    >
      {({ state, value }) => {
        const selected = value("isWorking", exception ? (exception.isWorking ? "working" : "non-working") : "non-working");
        return (
          <>
            <FormField label="Date" htmlFor={`${idPrefix}-date`} required errors={fieldErrorsFor(state, "date")}>
              <DateInput name="date" defaultValue={value("date", exception?.date ?? today)} className="md:w-full" />
            </FormField>
            <fieldset className="flex flex-col gap-1.5">
              <legend className="text-sm font-medium">
                Day type <span aria-hidden="true" className="text-destructive">*</span>
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {CHOICES.map((choice) => (
                  <label
                    key={choice.value}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-input bg-card px-3 py-2.5 text-sm transition-colors",
                      "has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                    )}
                  >
                    <input
                      type="radio"
                      name="isWorking"
                      value={choice.value}
                      defaultChecked={selected === choice.value}
                      className="mt-0.5 size-4 accent-primary"
                    />
                    <span>
                      <span className="font-medium">{choice.label}</span>
                      <span className="block text-xs text-muted-foreground">{choice.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
              {fieldErrorsFor(state, "isWorking") ? (
                <p role="alert" className="text-sm text-destructive">
                  {fieldErrorsFor(state, "isWorking")?.[0]}
                </p>
              ) : null}
            </fieldset>
            <FormField label="Note" htmlFor={`${idPrefix}-note`} hint="Optional" errors={fieldErrorsFor(state, "note")}>
              <Input name="note" maxLength={200} defaultValue={value("note", exception?.note ?? "")} placeholder="Holiday: Diwali" />
            </FormField>
          </>
        );
      }}
    </FormDialog>
  );
}
