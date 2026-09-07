import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type DateInputProps = Omit<React.ComponentProps<typeof Input>, "type" | "value" | "defaultValue" | "min" | "max"> & {
  name: string;
  /** `YYYY-MM-DD` */
  defaultValue?: string;
  /** `YYYY-MM-DD` (e.g. `todayInTz(tz)` for "Due date cannot be in the past"). */
  min?: string;
  max?: string;
};

/**
 * Native date picker (values cross the boundary as `YYYY-MM-DD`, see spec §4). Server Components can render it
 * directly; validation of the range happens in zod on the server.
 */
export function DateInput({ name, defaultValue, min, max, className, ...props }: DateInputProps) {
  return (
    <Input
      type="date"
      name={name}
      defaultValue={defaultValue}
      min={min}
      max={max}
      className={cn("w-full md:w-48", className)}
      {...props}
    />
  );
}
