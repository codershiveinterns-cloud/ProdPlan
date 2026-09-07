import { useId } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Suggested units (spec §4 "Units"). Stored values are trimmed + lower-cased by the server action. */
export const COMMON_UNITS = ["pcs", "nos", "kg", "g", "m", "mm", "l", "ml", "set", "box"] as const;

export type UnitInputProps = Omit<React.ComponentProps<typeof Input>, "type" | "list"> & {
  name: string;
};

/** Free-text unit field with a datalist of common units. */
export function UnitInput({ name, defaultValue = "pcs", className, ...props }: UnitInputProps) {
  const listId = useId();
  return (
    <>
      <Input
        type="text"
        name={name}
        list={listId}
        defaultValue={defaultValue}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={16}
        className={cn("w-full md:w-40 lowercase", className)}
        {...props}
      />
      <datalist id={listId}>
        {COMMON_UNITS.map((unit) => (
          <option key={unit} value={unit} />
        ))}
      </datalist>
    </>
  );
}
