"use client";

import Link from "next/link";

import { MACHINE_STATUSES, machineStatusLabel } from "@/components/data/MachineStatusBadge";
import { FieldErrors } from "@/components/forms/FieldErrors";
import { FormField } from "@/components/forms/FormField";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { actionErrorMessage, fieldErrorsFor } from "@/components/forms/action-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { COMMON_UNITS } from "@/components/forms/UnitInput";
import type { MachineStatus } from "@/generated/prisma/enums";

import { createMachineAction, updateMachineAction } from "../actions";
import { useFormAction } from "./use-form-action";

export type MachineFormValues = {
  id: string;
  workCenterId: string;
  calendarId: string;
  code: string;
  name: string;
  status: MachineStatus;
  efficiencyPercent: number;
  ratedCapacityPerShift: number | null;
  capacityUnit: string | null;
  notes: string | null;
};

export type MachineFormProps = {
  machine?: MachineFormValues | null;
  workCenters: Array<{ id: string; code: string; name: string; isActive: boolean }>;
  calendars: Array<{ id: string; name: string; isActive: boolean }>;
  defaultCalendarId: string | null;
  cancelHref: string;
};

const RETURN_TO_NEW = encodeURIComponent("/machines/new");

/** Create / edit machine form (docs/M1_SPEC.md §6.2 "Machine form"). */
export function MachineForm({ machine, workCenters, calendars, defaultCalendarId, cancelHref }: MachineFormProps) {
  const editing = Boolean(machine);
  const action = machine ? updateMachineAction.bind(null, machine.id) : createMachineAction;
  const { state, formAction, pending, formKey, value } = useFormAction(action);

  const initialCalendar = machine?.calendarId ?? defaultCalendarId ?? calendars[0]?.id ?? "";
  const unitListId = "machine-capacity-units";

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      {state && !state.ok && !state.fieldErrors ? <FieldErrors errors={[actionErrorMessage(state.error)]} /> : null}
      <div key={formKey} className="grid gap-5 md:grid-cols-2">
        <FormField label="Work center" htmlFor="workCenterId" required errors={fieldErrorsFor(state, "workCenterId")}>
          {workCenters.length === 0 ? (
            <p className="flex h-11 items-center text-sm text-muted-foreground">
              No work centers yet —{" "}
              <Link href={`/work-centers?return=${RETURN_TO_NEW}`} className="ml-1 font-medium text-primary underline-offset-4 hover:underline">
                Create one
              </Link>
            </p>
          ) : (
            <Select name="workCenterId" defaultValue={value("workCenterId", machine?.workCenterId ?? "") || undefined}>
              <SelectTrigger id="workCenterId" className="w-full" aria-invalid={Boolean(fieldErrorsFor(state, "workCenterId"))}>
                <SelectValue placeholder="Select a work center" />
              </SelectTrigger>
              <SelectContent>
                {workCenters.map((wc) => (
                  <SelectItem key={wc.id} value={wc.id}>
                    <span className="font-mono">{wc.code}</span>
                    <span className="text-muted-foreground"> · {wc.name}</span>
                    {!wc.isActive ? <span className="text-muted-foreground"> (inactive)</span> : null}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        <FormField label="Code" htmlFor="code" required errors={fieldErrorsFor(state, "code")}>
          <Input
            name="code"
            defaultValue={value("code", machine?.code ?? "")}
            maxLength={32}
            autoComplete="off"
            autoCapitalize="characters"
            className="font-mono uppercase"
            placeholder="CNC-01"
          />
        </FormField>

        <FormField label="Name" htmlFor="name" required errors={fieldErrorsFor(state, "name")}>
          <Input name="name" defaultValue={value("name", machine?.name ?? "")} maxLength={120} autoComplete="off" placeholder="Haas VF-2" />
        </FormField>

        <FormField
          label="Status"
          htmlFor="status"
          required
          description="Inactive = retired (hidden from pickers). Maintenance = out of service until set back to Active."
          errors={fieldErrorsFor(state, "status")}
        >
          <Select name="status" defaultValue={value("status", machine?.status ?? "ACTIVE")}>
            <SelectTrigger id="status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MACHINE_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {machineStatusLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField
          label="Shift calendar"
          htmlFor="calendarId"
          required
          description="Pre-filled with the plant default. Changing the plant default later never changes this machine."
          errors={fieldErrorsFor(state, "calendarId")}
        >
          {calendars.length === 0 ? (
            <p className="flex h-11 items-center text-sm text-muted-foreground">
              No shift calendars yet —{" "}
              <Link href="/calendars/new" className="ml-1 font-medium text-primary underline-offset-4 hover:underline">
                Create one
              </Link>
            </p>
          ) : (
            <Select name="calendarId" defaultValue={value("calendarId", initialCalendar) || undefined}>
              <SelectTrigger id="calendarId" className="w-full" aria-invalid={Boolean(fieldErrorsFor(state, "calendarId"))}>
                <SelectValue placeholder="Select a shift calendar" />
              </SelectTrigger>
              <SelectContent>
                {calendars.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    {c.id === defaultCalendarId ? " (default)" : ""}
                    {!c.isActive ? " (inactive)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        <FormField
          label="Efficiency %"
          htmlFor="efficiencyPercent"
          required
          description="Effective minutes = shift minutes × efficiency %. 1–150."
          errors={fieldErrorsFor(state, "efficiencyPercent")}
        >
          <InputGroup className="md:w-40">
            <InputGroupInput
              id="efficiencyPercent"
              name="efficiencyPercent"
              type="number"
              inputMode="numeric"
              min={1}
              max={150}
              step={1}
              defaultValue={value("efficiencyPercent", String(machine?.efficiencyPercent ?? 100))}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupText>%</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
        </FormField>

        <FormField
          label="Rated output per shift"
          htmlFor="ratedCapacityPerShift"
          hint="Optional"
          description="Informational only — capacity is planned in minutes."
          errors={[...(fieldErrorsFor(state, "ratedCapacityPerShift") ?? []), ...(fieldErrorsFor(state, "capacityUnit") ?? [])]}
        >
          <InputGroup>
            <InputGroupInput
              id="ratedCapacityPerShift"
              name="ratedCapacityPerShift"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.001"
              placeholder="120"
              defaultValue={value("ratedCapacityPerShift", machine?.ratedCapacityPerShift === null || machine?.ratedCapacityPerShift === undefined ? "" : String(machine.ratedCapacityPerShift))}
            />
            <InputGroupAddon align="inline-end" className="gap-1 pr-1.5">
              <label htmlFor="capacityUnit" className="sr-only">
                Unit
              </label>
              <input
                id="capacityUnit"
                name="capacityUnit"
                list={unitListId}
                defaultValue={value("capacityUnit", machine?.capacityUnit ?? "pcs")}
                maxLength={16}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-label="Unit"
                className="h-8 w-20 rounded-md border border-input bg-background px-2 text-sm lowercase outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              <datalist id={unitListId}>
                {COMMON_UNITS.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
              <InputGroupText>per shift</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
        </FormField>

        <FormField label="Notes" htmlFor="notes" hint="Optional" errors={fieldErrorsFor(state, "notes")} className="md:col-span-2">
          <Textarea name="notes" rows={4} maxLength={2000} defaultValue={value("notes", machine?.notes ?? "")} />
        </FormField>
      </div>

      <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <Button variant="outline" asChild>
          <Link href={cancelHref} aria-disabled={pending}>
            Cancel
          </Link>
        </Button>
        <SubmitButton pendingText="Saving…">{editing ? "Save changes" : "Create machine"}</SubmitButton>
      </div>
    </form>
  );
}
