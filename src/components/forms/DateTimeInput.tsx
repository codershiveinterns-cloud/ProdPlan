"use client";

import { useId, useState } from "react";
import { TZDate } from "@date-fns/tz";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type DateTimeInputProps = {
  /** Name of the hidden input carrying the ISO-8601 UTC instant (empty string when incomplete). */
  name: string;
  /** IANA timezone the date/time fields are interpreted in (tenant.timezone). */
  tz: string;
  /** UTC instant to pre-fill (Date or ISO string). */
  defaultValue?: Date | string;
  required?: boolean;
  disabled?: boolean;
  /** Minutes between allowed times (default 15). */
  stepMinutes?: number;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-required"?: boolean | "true" | "false";
  className?: string;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** UTC instant → `{ date: "YYYY-MM-DD", time: "HH:MM" }` in `tz`. */
export function utcToZonedFields(value: Date | string, tz: string): { date: string; time: string } {
  const d = typeof value === "string" ? new TZDate(value, tz) : new TZDate(value, tz);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/** `YYYY-MM-DD` + `HH:MM` in `tz` → ISO UTC string, or "" when either part is missing/invalid. */
export function zonedFieldsToUtcIso(date: string, time: string, tz: string): string {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tm = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dm || !tm) return "";
  const zoned = new TZDate(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), Number(tm[1]), Number(tm[2]), tz);
  const ms = zoned.getTime();
  return Number.isNaN(ms) ? "" : new Date(ms).toISOString();
}

/**
 * Date + time (15-minute step) fields interpreted in the tenant timezone. The submitted value is a hidden
 * `<input name>` holding the UTC ISO instant, so the server never has to redo timezone maths for this field.
 */
export function DateTimeInput({
  name,
  tz,
  defaultValue,
  required,
  disabled,
  stepMinutes = 15,
  id,
  className,
  ...aria
}: DateTimeInputProps) {
  const initial = defaultValue ? utcToZonedFields(defaultValue, tz) : { date: "", time: "" };
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const autoId = useId();
  const baseId = id ?? `${name}-${autoId}`;
  const iso = zonedFieldsToUtcIso(date, time, tz);

  const shared = {
    required,
    disabled,
    "aria-invalid": aria["aria-invalid"],
    "aria-describedby": aria["aria-describedby"],
    "aria-required": aria["aria-required"] ?? (required || undefined),
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)} data-slot="datetime-input">
      <input type="hidden" name={name} value={iso} />
      <label htmlFor={`${baseId}-date`} className="sr-only">
        Date
      </label>
      <Input
        id={`${baseId}-date`}
        type="date"
        value={date}
        onChange={(event) => setDate(event.target.value)}
        className="w-full min-w-40 flex-1 sm:w-auto"
        {...shared}
      />
      <label htmlFor={`${baseId}-time`} className="sr-only">
        Time
      </label>
      <Input
        id={`${baseId}-time`}
        type="time"
        step={stepMinutes * 60}
        value={time}
        onChange={(event) => setTime(event.target.value)}
        className="w-full min-w-32 flex-1 sm:w-auto"
        {...shared}
      />
    </div>
  );
}
