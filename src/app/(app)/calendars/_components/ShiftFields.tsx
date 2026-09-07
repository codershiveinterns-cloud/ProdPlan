"use client";

import { useState } from "react";

import { FormField } from "@/components/forms/FormField";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { DAY_LABELS, DAY_LABELS_LONG, DAYS_MON_FIRST, isHHMM, shiftNetMinutes } from "@/lib/calendar";
import { formatMinutes } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ShiftFieldValues = {
  name: string;
  startTime: string;
  endTime: string;
  daysOfWeek: number[];
  breakMinutes: string;
};

export type ShiftFieldsProps = {
  idPrefix: string;
  defaults: ShiftFieldValues;
  errors: (field: string) => string[] | undefined;
};

function parseDays(values: number[]): Set<number> {
  return new Set(values.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6));
}

/**
 * Shift fields: Name, Start, End ("ends next day" helper when End ≤ Start), seven 44 px day chips (Mon…Sun,
 * stored 0 = Sun … 6 = Sat as repeated `daysOfWeek` hidden inputs), Break minutes, plus a live net-minutes hint.
 */
export function ShiftFields({ idPrefix, defaults, errors }: ShiftFieldsProps) {
  const [startTime, setStartTime] = useState(defaults.startTime);
  const [endTime, setEndTime] = useState(defaults.endTime);
  const [breakMinutes, setBreakMinutes] = useState(defaults.breakMinutes);
  const [days, setDays] = useState<Set<number>>(() => parseDays(defaults.daysOfWeek));

  const timesValid = isHHMM(startTime) && isHHMM(endTime);
  const endsNextDay = timesValid && endTime <= startTime;
  const breakNum = Number(breakMinutes);
  const net = timesValid ? shiftNetMinutes({ startTime, endTime, breakMinutes: Number.isFinite(breakNum) ? breakNum : 0 }) : null;

  const toggleDay = (day: number) => {
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  const selectedDays = DAYS_MON_FIRST.filter((d) => days.has(d));

  return (
    <>
      <FormField label="Shift name" htmlFor={`${idPrefix}-name`} required errors={errors("name")}>
        <Input name="name" defaultValue={defaults.name} maxLength={60} autoComplete="off" placeholder="Morning" />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Start" htmlFor={`${idPrefix}-startTime`} required errors={errors("startTime")}>
          <Input
            name="startTime"
            type="time"
            step={300}
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
          />
        </FormField>
        <FormField
          label="End"
          htmlFor={`${idPrefix}-endTime`}
          required
          description={endsNextDay ? "Ends next day" : undefined}
          errors={errors("endTime")}
        >
          <Input name="endTime" type="time" step={300} value={endTime} onChange={(event) => setEndTime(event.target.value)} />
        </FormField>
      </div>

      <fieldset className="flex flex-col gap-1.5" aria-describedby={errors("daysOfWeek") ? `${idPrefix}-daysOfWeek-error` : undefined}>
        <legend className="text-sm font-medium">
          Days <span aria-hidden="true" className="text-destructive">*</span>
        </legend>
        {selectedDays.map((d) => (
          <input key={d} type="hidden" name="daysOfWeek" value={d} />
        ))}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days of the week the shift starts on">
          {DAYS_MON_FIRST.map((day) => {
            const on = days.has(day);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={on}
                aria-label={DAY_LABELS_LONG[day]}
                onClick={() => toggleDay(day)}
                className={cn(
                  "h-11 min-w-11 rounded-lg border px-2.5 text-sm font-medium transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                  on
                    ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                    : "border-input bg-card text-foreground hover:bg-muted",
                )}
              >
                {DAY_LABELS[day]}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">Weekday of the date the shift starts on. Night shifts are counted on their start day.</p>
        {errors("daysOfWeek") ? (
          <p id={`${idPrefix}-daysOfWeek-error`} role="alert" className="text-sm text-destructive">
            {errors("daysOfWeek")?.[0]}
          </p>
        ) : null}
      </fieldset>

      <FormField
        label="Break"
        htmlFor={`${idPrefix}-breakMinutes`}
        required
        description={
          net === null
            ? "Unpaid break inside the shift."
            : net > 0
              ? `Net working time: ${formatMinutes(net)} per shift.`
              : "Break must be shorter than the shift."
        }
        errors={errors("breakMinutes")}
      >
        <InputGroup className="sm:w-48">
          <InputGroupInput
            id={`${idPrefix}-breakMinutes`}
            name="breakMinutes"
            type="number"
            inputMode="numeric"
            min={0}
            max={1439}
            step={5}
            value={breakMinutes}
            onChange={(event) => setBreakMinutes(event.target.value)}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupText>min</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
      </FormField>
    </>
  );
}
