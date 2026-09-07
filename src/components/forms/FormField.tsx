import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { cn } from "@/lib/utils";

import { FieldErrors } from "./FieldErrors";

export type FormFieldProps = {
  label: ReactNode;
  /** The control's `id`. Injected into a single child element when it has none. */
  htmlFor: string;
  description?: ReactNode;
  errors?: string[];
  required?: boolean;
  /** Small text at the right of the label (e.g. "Optional", "Locked while in progress"). */
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
};

type AriaProps = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-required"?: boolean | "true" | "false";
};

/**
 * Label + control + description + errors, built on the shadcn `field` primitives. When `children` is a single
 * element, `id`, `aria-invalid`, `aria-required` and `aria-describedby` (description + error ids) are injected so
 * pages don't have to repeat them. Works for Input, Textarea, SelectTrigger, Combobox, DateInput…
 */
export function FormField({ label, htmlFor, description, errors, required, hint, children, className }: FormFieldProps) {
  const invalid = Boolean(errors && errors.length > 0);
  const descriptionId = description ? `${htmlFor}-description` : undefined;
  const errorId = invalid ? `${htmlFor}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  const only = Children.count(children) === 1 ? Children.toArray(children)[0] : null;
  const control =
    only && isValidElement<AriaProps>(only)
      ? cloneElement(only as ReactElement<AriaProps>, {
          id: only.props.id ?? htmlFor,
          "aria-invalid": only.props["aria-invalid"] ?? (invalid || undefined),
          "aria-required": only.props["aria-required"] ?? (required || undefined),
          "aria-describedby": [only.props["aria-describedby"], describedBy].filter(Boolean).join(" ") || undefined,
        })
      : children;

  return (
    <Field data-invalid={invalid || undefined} className={cn("gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <FieldLabel htmlFor={htmlFor} className="text-foreground">
          {label}
          {required ? (
            <span aria-hidden="true" className="text-destructive">
              *
            </span>
          ) : null}
        </FieldLabel>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </div>
      {control}
      {description ? <FieldDescription id={descriptionId}>{description}</FieldDescription> : null}
      <FieldErrors id={errorId} errors={errors} />
    </Field>
  );
}
