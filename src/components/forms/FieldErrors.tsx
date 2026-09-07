import { cn } from "@/lib/utils";

/**
 * Inline validation messages. `role="alert"` announces them; the `id` is referenced by the input's
 * `aria-describedby` (FormField wires this up automatically: `${htmlFor}-error`). Renders nothing when empty.
 */
export function FieldErrors({ errors, id, className }: { errors?: string[]; id?: string; className?: string }) {
  if (!errors || errors.length === 0) return null;
  const unique = [...new Set(errors)];
  return (
    <div id={id} role="alert" data-slot="field-error" className={cn("text-sm text-destructive", className)}>
      {unique.length === 1 ? (
        unique[0]
      ) : (
        <ul className="ml-4 flex list-disc flex-col gap-1">
          {unique.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
