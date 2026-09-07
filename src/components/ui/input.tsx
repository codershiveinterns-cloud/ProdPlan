import * as React from "react"
import { cn } from "cn"

/**
 * Text input. Default height is 44 px (h-11, spec §5 density rule); `inputSize="sm"` gives the 36 px variant
 * for dense desktop tables. (`size` is the native attribute, hence the different prop name.)
 */
function Input({
  className,
  type,
  inputSize = "default",
  ...props
}: React.ComponentProps<"input"> & { inputSize?: "default" | "sm" }) {
  return (
    <input
      type={type}
      data-slot="input"
      data-size={inputSize}
      className={cn(
        "w-full min-w-0 rounded-lg border border-input bg-card px-3 py-1 text-base transition-colors outline-none file:inline-flex file:h-8 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 read-only:bg-muted/60 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[size=default]:h-11 data-[size=sm]:h-9 data-[size=sm]:px-2.5 data-[size=sm]:text-sm md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
