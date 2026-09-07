"use client";

import type { ReactNode } from "react";

import { FormField } from "@/components/forms/FormField";
import { fieldErrorsFor } from "@/components/forms/action-state";
import { Input } from "@/components/ui/input";

import { FormDialog } from "@/app/(app)/machines/_components/FormDialog";
import { renameCalendarAction } from "../actions";

/** Rename dialog on the calendar editor header card. */
export function RenameCalendarDialog({ trigger, calendar }: { trigger: ReactNode; calendar: { id: string; name: string } }) {
  return (
    <FormDialog
      trigger={trigger}
      title="Rename calendar"
      action={renameCalendarAction.bind(null, calendar.id)}
      submitLabel="Rename"
      successMessage="Calendar renamed"
    >
      {({ state, value }) => (
        <FormField label="Calendar name" htmlFor={`rename-${calendar.id}`} required errors={fieldErrorsFor(state, "name")}>
          <Input name="name" defaultValue={value("name", calendar.name)} maxLength={80} autoComplete="off" autoFocus />
        </FormField>
      )}
    </FormDialog>
  );
}
