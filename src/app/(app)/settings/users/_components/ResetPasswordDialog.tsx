"use client";

import { useActionState } from "react";

import { resetUserPasswordAction } from "@/app/(app)/settings/actions";
import { FieldErrors } from "@/components/forms/FieldErrors";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { ToastOnResult } from "@/components/forms/ToastOnResult";
import { actionErrorMessage, fieldErrorsFor } from "@/components/forms/action-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { TemporaryPasswordField } from "./TemporaryPasswordField";
import { TemporaryPasswordReveal } from "./TemporaryPasswordReveal";
import type { UserRow } from "./types";

function ResetForm({ user }: { user: UserRow }) {
  const [state, formAction] = useActionState(resetUserPasswordAction, null);

  if (state?.ok && state.data) {
    const { name, email, temporaryPassword } = state.data;
    return (
      <>
        <DialogHeader>
          <DialogTitle>Password reset for {name}</DialogTitle>
          <DialogDescription>They have been signed out everywhere and must use this password to sign in.</DialogDescription>
        </DialogHeader>
        <TemporaryPasswordReveal name={name} email={email} temporaryPassword={temporaryPassword} />
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Reset password for {user.name}?</DialogTitle>
        <DialogDescription>
          {user.email} will be signed out of every session and must set a new password at their next sign-in.
        </DialogDescription>
      </DialogHeader>
      <form action={formAction} className="flex flex-col gap-5" noValidate>
        <ToastOnResult state={state} successMessage="Password reset" />
        {state && !state.ok && !state.fieldErrors ? <FieldErrors errors={[actionErrorMessage(state.error)]} /> : null}
        <input type="hidden" name="userId" value={user.id} />
        <TemporaryPasswordField
          id="reset-temporaryPassword"
          errors={fieldErrorsFor(state, "temporaryPassword")}
          autoFocus
        />
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <SubmitButton pendingText="Resetting…">Reset password</SubmitButton>
        </DialogFooter>
      </form>
    </>
  );
}

export type ResetPasswordDialogProps = {
  user: UserRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Admin password reset (controlled; opened from the row menu). Shows the temporary password once; the content
 * unmounts on close so it cannot be re-opened into the reveal.
 */
export function ResetPasswordDialog({ user, open, onOpenChange }: ResetPasswordDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <ResetForm user={user} />
      </DialogContent>
    </Dialog>
  );
}
