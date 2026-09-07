import type { ComponentProps, ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type SuffixInputProps = ComponentProps<typeof Input> & {
  /** Unit or word rendered inside the field at the right ("kg", "days", "per pcs"). */
  suffix: ReactNode;
};

/**
 * Input with a read-only suffix inside the box. Every prop (including the `id` / `aria-*` that `FormField`
 * injects) is forwarded to the `<input>`, so the label and error wiring stay on the control itself.
 */
export function SuffixInput({ suffix, className, ...props }: SuffixInputProps) {
  return (
    <div className="relative w-full">
      <Input {...props} className={cn("pr-16", className)} />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-3 flex max-w-14 items-center truncate text-sm text-muted-foreground"
      >
        {suffix}
      </span>
    </div>
  );
}
