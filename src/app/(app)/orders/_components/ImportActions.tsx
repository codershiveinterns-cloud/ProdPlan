"use client";

import { useActionState } from "react";
import { Trash2, Upload } from "lucide-react";

import { ConfirmDialog } from "@/components/data/ConfirmDialog";
import { FieldErrors } from "@/components/forms/FieldErrors";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { ToastOnResult } from "@/components/forms/ToastOnResult";
import { actionErrorMessage } from "@/components/forms/action-state";
import { Button } from "@/components/ui/button";
import { commitImportAction, discardImportAction } from "@/app/(app)/orders/actions";

/** Step 2 footer: "Import {n} valid rows" (disabled at 0) and "Discard". Only the batch id is posted. */
export function ImportActions({ batchId, validCount }: { batchId: string; validCount: number }) {
  const [state, formAction] = useActionState(commitImportAction, null);
  const error = state && !state.ok ? actionErrorMessage(state.error) : null;
  return (
    <div className="flex flex-col gap-3">
      {error ? <FieldErrors errors={[error]} /> : null}
      <div className="sticky bottom-0 -mx-4 flex flex-col-reverse gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:flex-row sm:justify-end md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <ConfirmDialog
          trigger={
            <Button type="button" variant="outline">
              <Trash2 data-icon="inline-start" />
              Discard
            </Button>
          }
          title="Discard this import?"
          description="Nothing has been imported yet. You can upload the file again at any time."
          confirmLabel="Discard"
          destructive
          action={(formData) => {
            formData.set("batchId", batchId);
            return discardImportAction(null, formData);
          }}
        />
        <form action={formAction}>
          <ToastOnResult state={state} successMessage="Orders imported" />
          <input type="hidden" name="batchId" value={batchId} />
          <SubmitButton pendingText="Importing…" disabled={validCount === 0} className="w-full sm:w-auto">
            <Upload data-icon="inline-start" />
            Import {validCount.toLocaleString("en-IN")} valid row{validCount === 1 ? "" : "s"}
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
