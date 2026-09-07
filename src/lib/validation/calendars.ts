/** Shift calendars, shifts and exceptions (docs/M1_SPEC.md §4 "Calendars", §6.3). */
import { z } from "zod";
import { isHHMM, shiftNetMinutes } from "@/lib/calendar";
import {
  booleanChoice,
  hhmmField,
  intField,
  isoDateField,
  optionalCheckbox,
  optionalIdField,
  optionalText,
  text,
} from "./common";

export const calendarSchema = z.object({
  name: text("Calendar name", { max: 80 }),
  isActive: optionalCheckbox(),
});

export type CalendarInput = z.infer<typeof calendarSchema>;

export const DAYS_MESSAGE = "Select at least one day";
export const NET_MINUTES_MESSAGE = "Break must be shorter than the shift so net working time is greater than 0";

/** Seven toggle chips → `daysOfWeek` (repeated keys, a comma list, or a number array); de-duplicated, sorted 0..6. */
export const daysOfWeekField = z.preprocess(
  (v) => {
    const raw = v === null || v === undefined ? [] : Array.isArray(v) ? v : [v];
    return raw
      .flatMap((item) => (typeof item === "string" ? item.split(",") : [item]))
      .map((item) => (typeof item === "string" ? item.trim() : item))
      .filter((item) => item !== "" && item !== null && item !== undefined)
      .map((item) => (typeof item === "string" && /^\d+$/.test(item) ? Number(item) : item));
  },
  z
    .array(z.number({ error: "Days must be weekdays 0 (Sunday) to 6 (Saturday)" }).int().min(0).max(6), {
      error: DAYS_MESSAGE,
    })
    .min(1, { error: DAYS_MESSAGE })
    .transform((days) => Array.from(new Set(days)).sort((a, b) => a - b)),
);

export const shiftSchema = z
  .object({
    calendarId: optionalIdField("calendar"),
    name: text("Shift name", { max: 60 }),
    startTime: hhmmField("Start time"),
    endTime: hhmmField("End time"),
    daysOfWeek: daysOfWeekField,
    breakMinutes: intField("Break minutes", { min: 0, max: 1439, defaultValue: 0 }),
  })
  // Only judge net minutes once both times are well-formed (field errors are reported separately).
  .refine((s) => !isHHMM(s.startTime) || !isHHMM(s.endTime) || shiftNetMinutes(s) > 0, {
    error: NET_MINUTES_MESSAGE,
    path: ["breakMinutes"],
  });

export type ShiftInput = z.infer<typeof shiftSchema>;

export const calendarExceptionSchema = z.object({
  calendarId: optionalIdField("calendar"),
  date: isoDateField("Date"),
  isWorking: booleanChoice("Choose Working or Non-working"),
  note: optionalText("Note", { max: 200 }),
});

export type CalendarExceptionInput = z.infer<typeof calendarExceptionSchema>;

/** Rename dialog on the calendar editor. */
export const renameCalendarSchema = z.object({
  calendarId: optionalIdField("calendar"),
  name: text("Calendar name", { max: 80 }),
});

export type RenameCalendarInput = z.infer<typeof renameCalendarSchema>;
