"use client";

import { useActionState, useState, type DragEvent } from "react";
import { FileUp, Upload } from "lucide-react";

import { FieldErrors } from "@/components/forms/FieldErrors";
import { FormField } from "@/components/forms/FormField";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { ToastOnResult } from "@/components/forms/ToastOnResult";
import { actionErrorMessage, fieldErrorsFor } from "@/components/forms/action-state";
import { cn } from "@/lib/utils";
import { previewImportAction } from "@/app/(app)/orders/actions";

/** Step 1: file input / dropzone posting to `previewImportAction` (which redirects to the preview). */
export function ImportUploadForm() {
  const [state, formAction] = useActionState(previewImportAction, null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const formError = state && !state.ok && !state.fieldErrors ? actionErrorMessage(state.error) : null;

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    const input = event.currentTarget.querySelector<HTMLInputElement>("input[type=file]");
    const file = event.dataTransfer.files?.[0];
    if (input && file) {
      input.files = event.dataTransfer.files;
      setFileName(file.name);
    }
  };

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <ToastOnResult state={state} successMessage="File parsed" />
      {formError ? <FieldErrors errors={[formError]} /> : null}
      <FormField label="CSV file" htmlFor="file" required errors={fieldErrorsFor(state, "file")} description="UTF-8 .csv up to 1 MB and 2,000 data rows. Delete the example rows before importing.">
        <label
          htmlFor="file"
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-input bg-card px-4 py-8 text-center text-sm transition-colors hover:bg-muted/50",
            dragging && "border-primary bg-primary/5",
          )}
        >
          <FileUp className="size-8 text-muted-foreground" aria-hidden="true" />
          {fileName ? (
            <span className="font-medium">{fileName}</span>
          ) : (
            <>
              <span className="font-medium">Drop a CSV here or tap to choose</span>
              <span className="text-muted-foreground">Columns: order_number, customer, product_sku, quantity, priority, due_date, earliest_start_date, customer_po_ref, notes</span>
            </>
          )}
          <input
            id="file"
            name="file"
            type="file"
            accept=".csv,text/csv"
            required
            className="sr-only"
            onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
          />
        </label>
      </FormField>
      <div className="flex justify-end">
        <SubmitButton pendingText="Checking file…">
          <Upload data-icon="inline-start" />
          Upload and preview
        </SubmitButton>
      </div>
    </form>
  );
}
