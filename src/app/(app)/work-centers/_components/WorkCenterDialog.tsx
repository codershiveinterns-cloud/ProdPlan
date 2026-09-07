"use client";

import type { ReactNode } from "react";

import { FormField } from "@/components/forms/FormField";
import { fieldErrorsFor } from "@/components/forms/action-state";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { WorkCenterRow } from "@/lib/machines/work-centers";

import { FormDialog } from "@/app/(app)/machines/_components/FormDialog";
import { createWorkCenterAction, updateWorkCenterAction } from "../actions";

export type WorkCenterDialogProps = {
  trigger: ReactNode;
  /** Present → edit mode. */
  workCenter?: Pick<WorkCenterRow, "id" | "code" | "name" | "description" | "isActive"> | null;
  /** After creating, go here instead of staying on the list (e.g. back to /machines/new). */
  returnTo?: string;
};

/** Create / edit a work center (code, name, description; Active toggle when editing). */
export function WorkCenterDialog({ trigger, workCenter, returnTo }: WorkCenterDialogProps) {
  const editing = Boolean(workCenter);
  const action = workCenter ? updateWorkCenterAction.bind(null, workCenter.id) : createWorkCenterAction;
  const idPrefix = workCenter ? `wc-${workCenter.id}` : "wc-new";

  return (
    <FormDialog
      trigger={trigger}
      title={workCenter ? `Edit work center ${workCenter.code}` : "New work center"}
      description={
        workCenter ? undefined : "A work center groups machines that do the same kind of work (CNC, Assembly, Paint)."
      }
      action={action}
      submitLabel={editing ? "Save changes" : "Create work center"}
      successMessage={editing ? "Work center saved" : "Work center created"}
    >
      {({ state, value }) => (
        <>
          {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
          <div className="grid gap-4 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
            <FormField label="Code" htmlFor={`${idPrefix}-code`} required errors={fieldErrorsFor(state, "code")}>
              <Input
                name="code"
                defaultValue={value("code", workCenter?.code ?? "")}
                maxLength={32}
                autoComplete="off"
                autoCapitalize="characters"
                className="font-mono uppercase"
                placeholder="CNC"
              />
            </FormField>
            <FormField label="Name" htmlFor={`${idPrefix}-name`} required errors={fieldErrorsFor(state, "name")}>
              <Input
                name="name"
                defaultValue={value("name", workCenter?.name ?? "")}
                maxLength={120}
                autoComplete="off"
                placeholder="CNC machining"
              />
            </FormField>
          </div>
          <FormField
            label="Description"
            htmlFor={`${idPrefix}-description`}
            hint="Optional"
            errors={fieldErrorsFor(state, "description")}
          >
            <Textarea
              name="description"
              rows={3}
              maxLength={500}
              defaultValue={value("description", workCenter?.description ?? "")}
              className="min-h-20"
            />
          </FormField>
          {workCenter ? (
            <label className="flex h-11 items-center gap-3 text-sm">
              <input type="hidden" name="isActive" value="false" />
              <Checkbox
                name="isActive"
                value="true"
                defaultChecked={value("isActive") ? value("isActive") === "true" : workCenter.isActive}
              />
              <span>
                Active
                <span className="block text-xs text-muted-foreground">
                  Inactive work centers are hidden from machine and routing pickers.
                </span>
              </span>
            </label>
          ) : null}
        </>
      )}
    </FormDialog>
  );
}
