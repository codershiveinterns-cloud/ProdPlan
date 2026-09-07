"use client";

import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

export type SubmitButtonProps = Omit<React.ComponentProps<typeof Button>, "type" | "asChild"> & {
  /** Label while the surrounding form is submitting (defaults to the children with a spinner). */
  pendingText?: string;
};

/** Form submit button that disables itself and shows a spinner while its `<form>` action is pending. */
export function SubmitButton({ children, pendingText, disabled, ...props }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled} aria-busy={pending || undefined} {...props}>
      {pending ? (
        <>
          <LoaderCircle className="animate-spin" aria-hidden="true" />
          {pendingText ?? children}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
