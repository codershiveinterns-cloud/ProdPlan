import type { ComponentProps, ReactNode } from "react";
import { FormField } from "@/components/forms/FormField";
import { Input } from "@/components/ui/input";

type TextFieldProps = {
  id: string;
  label: string;
  description?: ReactNode;
  errors?: string[];
  hint?: ReactNode;
} & Omit<ComponentProps<typeof Input>, "id" | "aria-invalid" | "aria-describedby">;

/** Labelled input with inline zod errors — a thin wrapper over the ui-kit `FormField` for the auth forms. */
export function TextField({ id, label, description, errors, hint, required, ...input }: TextFieldProps) {
  return (
    <FormField label={label} htmlFor={id} description={description} errors={errors} required={required} hint={hint}>
      <Input {...input} required={required} />
    </FormField>
  );
}
