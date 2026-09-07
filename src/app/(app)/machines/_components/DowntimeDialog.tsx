"use client";

import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

import { DOWNTIME_TYPES, downtimeTypeLabel } from "@/components/data/DowntimeTypeBadge";
import { DateTimeInput } from "@/components/forms/DateTimeInput";
import { FormField } from "@/components/forms/FormField";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { fieldErrorsFor } from "@/components/forms/action-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CONFIRM_OVERLAP_FIELD } from "@/lib/machines/form-fields";
import type { DowntimeRow } from "@/lib/machines/downtime";

import { createDowntimeAction, updateDowntimeAction } from "../actions";
import { FormDialog } from "./FormDialog";

export type DowntimeDialogProps = {
  trigger: ReactNode;
  machineId: string;
  machineCode: string;
  tz: string;
  /** Present → edit mode. */
  window?: Pick<DowntimeRow, "id" | "type" | "reason" | "startsAt" | "endsAt"> | null;
};

/**
 * Add / edit a downtime window: date + time start/end (tenant timezone), type, reason. Overlaps with another
 * window on the same machine come back as a non-blocking warning with a "Save anyway" submit that re-posts the
 * same values plus `confirmOverlap=1`.
 */
export function DowntimeDialog({ trigger, machineId, machineCode, tz, window }: DowntimeDialogProps) {
  const editing = Boolean(window);
  const action = window ? updateDowntimeAction.bind(null, window.id, machineId) : createDowntimeAction.bind(null, machineId);
  const idPrefix = window ? `dt-${window.id}` : `dt-new-${machineId}`;

  return (
    <FormDialog
      trigger={trigger}
      title={editing ? "Edit downtime window" : `Add downtime for ${machineCode}`}
      description="The machine is unavailable between start and end. Its status is not changed."
      action={action}
      submitLabel={editing ? "Save changes" : "Add downtime"}
      successMessage={editing ? "Downtime window saved" : "Downtime window added"}
      handlesError={(state) => Boolean(fieldErrorsFor(state, CONFIRM_OVERLAP_FIELD))}
      footerExtra={({ state }) =>
        fieldErrorsFor(state, CONFIRM_OVERLAP_FIELD) ? (
          <SubmitButton variant="secondary" name={CONFIRM_OVERLAP_FIELD} value="1" pendingText="Saving…">
            Save anyway
          </SubmitButton>
        ) : null
      }
    >
      {({ state, value }) => {
        const overlaps = fieldErrorsFor(state, CONFIRM_OVERLAP_FIELD);
        return (
          <>
            <FormField label="Start" htmlFor={`${idPrefix}-startsAt`} required errors={fieldErrorsFor(state, "startsAt")}>
              <DateTimeInput name="startsAt" tz={tz} defaultValue={value("startsAt", window?.startsAt ?? "") || undefined} required />
            </FormField>
            <FormField
              label="End"
              htmlFor={`${idPrefix}-endsAt`}
              required
              description="Must be after the start."
              errors={fieldErrorsFor(state, "endsAt")}
            >
              <DateTimeInput name="endsAt" tz={tz} defaultValue={value("endsAt", window?.endsAt ?? "") || undefined} required />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]">
              <FormField label="Type" htmlFor={`${idPrefix}-type`} required errors={fieldErrorsFor(state, "type")}>
                <Select name="type" defaultValue={value("type", window?.type ?? "MAINTENANCE")}>
                  <SelectTrigger id={`${idPrefix}-type`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOWNTIME_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {downtimeTypeLabel(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Reason" htmlFor={`${idPrefix}-reason`} hint="Optional" errors={fieldErrorsFor(state, "reason")}>
                <Input name="reason" maxLength={500} defaultValue={value("reason", window?.reason ?? "")} placeholder="Spindle service" />
              </FormField>
            </div>
            {overlaps ? (
              <Alert className="border-amber-200 bg-amber-50 text-amber-900">
                <TriangleAlert className="text-amber-700" aria-hidden="true" />
                <AlertTitle>Overlaps with {overlaps.join(", ")}</AlertTitle>
                <AlertDescription className="text-amber-900/80">
                  Overlapping windows are allowed but only counted once in capacity. Use “Save anyway” to keep both.
                </AlertDescription>
              </Alert>
            ) : null}
          </>
        );
      }}
    </FormDialog>
  );
}
