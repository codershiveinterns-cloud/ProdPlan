"use client";

import type { ReactNode } from "react";

import { FieldErrors } from "@/components/forms/FieldErrors";
import { fieldErrorsFor } from "@/components/forms/action-state";
import { SHIFTS_FIELD } from "@/lib/machines/form-fields";

import { FormDialog } from "@/app/(app)/machines/_components/FormDialog";
import { addShiftAction, updateShiftAction } from "../actions";
import { ShiftFields } from "./ShiftFields";

export type ShiftDialogShift = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  daysOfWeek: number[];
  breakMinutes: number;
};

export type ShiftDialogProps = {
  trigger: ReactNode;
  calendarId: string;
  calendarName: string;
  /** Present → edit mode. */
  shift?: ShiftDialogShift | null;
};

const NEW_SHIFT = { name: "", startTime: "06:00", endTime: "14:00", daysOfWeek: [1, 2, 3, 4, 5, 6], breakMinutes: "30" };

/** Add / edit a shift. Server-side `validateShifts()` messages (overlap etc.) render under the fields. */
export function ShiftDialog({ trigger, calendarId, calendarName, shift }: ShiftDialogProps) {
  const editing = Boolean(shift);
  const action = shift ? updateShiftAction.bind(null, shift.id, calendarId) : addShiftAction.bind(null, calendarId);
  const idPrefix = shift ? `shift-${shift.id}` : `shift-new-${calendarId}`;

  return (
    <FormDialog
      trigger={trigger}
      title={shift ? `Edit shift ${shift.name}` : `Add shift to ${calendarName}`}
      description="Shifts in a calendar must not overlap. A shift whose end is at or before its start runs into the next day."
      action={action}
      submitLabel={editing ? "Save changes" : "Add shift"}
      successMessage={editing ? "Shift saved" : "Shift added"}
      handlesError={(state) => Boolean(fieldErrorsFor(state, SHIFTS_FIELD))}
    >
      {({ state, value, values }) => {
        const submittedDays = values("daysOfWeek");
        return (
          <>
            <ShiftFields
              idPrefix={idPrefix}
              defaults={{
                name: value("name", shift?.name ?? NEW_SHIFT.name) ?? "",
                startTime: value("startTime", shift?.startTime ?? NEW_SHIFT.startTime) ?? "",
                endTime: value("endTime", shift?.endTime ?? NEW_SHIFT.endTime) ?? "",
                daysOfWeek: submittedDays ? submittedDays.map(Number) : (shift?.daysOfWeek ?? NEW_SHIFT.daysOfWeek),
                breakMinutes: value("breakMinutes", String(shift?.breakMinutes ?? NEW_SHIFT.breakMinutes)) ?? "",
              }}
              errors={(field) => fieldErrorsFor(state, field)}
            />
            <FieldErrors id={`${idPrefix}-shifts-error`} errors={fieldErrorsFor(state, SHIFTS_FIELD)} />
          </>
        );
      }}
    </FormDialog>
  );
}
