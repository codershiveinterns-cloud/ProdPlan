/** Machines and downtime windows (docs/M1_SPEC.md §4 "Machines & capacity", §6.2). */
import { z } from "zod";
import { DowntimeType, MachineStatus } from "@/generated/prisma/enums";
import {
  enumField,
  enumFieldWithDefault,
  idField,
  intField,
  isoDateTimeField,
  optionalNumberField,
  optionalText,
  optionalUnitField,
  text,
} from "./common";

export const machineStatusField = enumField(MachineStatus, "Select a status");

export const EFFICIENCY_MESSAGE = "Efficiency must be a whole number between 1 and 150";

export const machineSchema = z.object({
  workCenterId: idField("work center"),
  calendarId: idField("shift calendar"),
  code: text("Code", { max: 32 }),
  name: text("Name", { max: 120 }),
  /** Blank → ACTIVE (new machines are schedulable by default). */
  status: enumFieldWithDefault(MachineStatus, "Select a status", "ACTIVE"),
  efficiencyPercent: intField("Efficiency %", {
    min: 1,
    max: 150,
    defaultValue: 100,
    messages: { min: EFFICIENCY_MESSAGE, max: EFFICIENCY_MESSAGE, integer: EFFICIENCY_MESSAGE, number: EFFICIENCY_MESSAGE },
  }),
  ratedCapacityPerShift: optionalNumberField("Rated output per shift", { min: 0, decimals: 3 }),
  capacityUnit: optionalUnitField,
  notes: optionalText("Notes", { max: 2000, multiline: true }),
});

export type MachineInput = z.infer<typeof machineSchema>;

export const downtimeTypeField = enumField(DowntimeType, "Select a downtime type");

export const DOWNTIME_END_MESSAGE = "End must be after start";

export const downtimeSchema = z
  .object({
    machineId: idField("machine"),
    startsAt: isoDateTimeField("Start"),
    endsAt: isoDateTimeField("End"),
    type: downtimeTypeField,
    reason: optionalText("Reason", { max: 500 }),
  })
  .refine((d) => d.endsAt.getTime() > d.startsAt.getTime(), { error: DOWNTIME_END_MESSAGE, path: ["endsAt"] });

export type DowntimeInput = z.infer<typeof downtimeSchema>;
