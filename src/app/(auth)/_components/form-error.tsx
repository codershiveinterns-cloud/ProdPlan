import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { actionErrorMessage } from "@/components/forms/action-state";

/** Top-of-form summary for `state.error` (field-level messages render next to their inputs). */
export function FormError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <Alert variant="destructive" aria-live="polite">
      <AlertCircle aria-hidden="true" />
      <AlertDescription>{actionErrorMessage(message)}</AlertDescription>
    </Alert>
  );
}
