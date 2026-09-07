"use client";

import { useActionState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

import { editUserAction } from "@/app/(app)/settings/actions";
import { FieldErrors } from "@/components/forms/FieldErrors";
import { FormField } from "@/components/forms/FormField";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { actionErrorMessage, fieldErrorsFor, type ActionState } from "@/components/forms/action-state";
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
import { Input } from "@/components/ui/input";

import type { UserRow } from "./types";
import { UserRoleSelect } from "./UserRoleSelect";

function EditForm({ user, close }: { user: UserRow; close: () => void }) {
  const [state, formAction] = useActionState(editUserAction, null);
  const roleErrors = fieldErrorsFor(state, "role");

  const handled = useRef<ActionState>(null);
  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.ok) {
      toast.success(state.message ?? "User updated");
      close();
    }
  }, [state, close]);

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="userId" value={user.id} />
      {state && !state.ok && !state.fieldErrors ? <FieldErrors errors={[actionErrorMessage(state.error)]} /> : null}
      <FormField label="Name" htmlFor="edit-name" required errors={fieldErrorsFor(state, "name")}>
        <Input name="name" defaultValue={user.name} maxLength={120} autoComplete="off" required autoFocus />
      </FormField>
      <FormField label="Email" htmlFor="edit-email" hint="Cannot be changed">
        <Input id="edit-email" value={user.email} readOnly disabled />
      </FormField>
      <FormField
        label="Role"
        htmlFor="edit-role"
        required
        errors={roleErrors}
        description={
          user.isSelf
            ? "Changing your own role takes effect immediately; at least one active admin must remain."
            : "A role change signs the user out of their current sessions."
        }
      >
        <UserRoleSelect
          id="edit-role"
          defaultValue={user.role}
          invalid={Boolean(roleErrors)}
          describedBy={["edit-role-description", roleErrors ? "edit-role-error" : undefined].filter(Boolean).join(" ")}
        />
      </FormField>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
      </DialogFooter>
    </form>
  );
}

export type EditUserDialogProps = {
  user: UserRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Name + role editor (controlled; opened from the row menu). Content unmounts on close, so state never goes stale. */
export function EditUserDialog({ user, open, onOpenChange }: EditUserDialogProps) {
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {user.name}</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>
        <EditForm user={user} close={close} />
      </DialogContent>
    </Dialog>
  );
}
