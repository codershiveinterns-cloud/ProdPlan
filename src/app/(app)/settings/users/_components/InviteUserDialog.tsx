"use client";

import { useActionState, useState } from "react";
import { UserPlus } from "lucide-react";

import { inviteUserAction } from "@/app/(app)/settings/actions";
import { FieldErrors } from "@/components/forms/FieldErrors";
import { FormField } from "@/components/forms/FormField";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { TemporaryPasswordField } from "./TemporaryPasswordField";
import { TemporaryPasswordReveal } from "./TemporaryPasswordReveal";
import { UserRoleSelect } from "./UserRoleSelect";

function InviteForm() {
  const [state, formAction] = useActionState(inviteUserAction, null);
  const roleErrors = fieldErrorsFor(state, "role");

  if (state?.ok && state.data) {
    const { name, email, temporaryPassword } = state.data;
    return (
      <>
        <DialogHeader>
          <DialogTitle>{name} has been invited</DialogTitle>
          <DialogDescription>Give them their email and this temporary password to sign in.</DialogDescription>
        </DialogHeader>
        <TemporaryPasswordReveal name={name} email={email} temporaryPassword={temporaryPassword} />
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Invite user</DialogTitle>
        <DialogDescription>
          The new user signs in with their email and a temporary password, then sets their own.
        </DialogDescription>
      </DialogHeader>
      <form action={formAction} className="flex flex-col gap-5" noValidate>
        <ToastOnResult state={state} successMessage="User invited" />
        {state && !state.ok && !state.fieldErrors ? <FieldErrors errors={[actionErrorMessage(state.error)]} /> : null}
        <FormField label="Name" htmlFor="invite-name" required errors={fieldErrorsFor(state, "name")}>
          <Input name="name" maxLength={120} autoComplete="off" required autoFocus />
        </FormField>
        <FormField label="Email" htmlFor="invite-email" required errors={fieldErrorsFor(state, "email")}>
          <Input name="email" type="email" inputMode="email" autoComplete="off" maxLength={254} required />
        </FormField>
        <FormField label="Role" htmlFor="invite-role" required errors={roleErrors}>
          <UserRoleSelect
            id="invite-role"
            defaultValue="VIEWER"
            invalid={Boolean(roleErrors)}
            describedBy={roleErrors ? "invite-role-error" : undefined}
          />
        </FormField>
        <TemporaryPasswordField id="invite-temporaryPassword" errors={fieldErrorsFor(state, "temporaryPassword")} />
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <SubmitButton pendingText="Inviting…">Invite user</SubmitButton>
        </DialogFooter>
      </form>
    </>
  );
}

/**
 * "Invite user" button + dialog. Radix unmounts the content whenever the dialog closes, so the form (and the
 * revealed password) never survives a close.
 */
export function InviteUserDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus aria-hidden="true" />
          Invite user
        </Button>
      </DialogTrigger>
      <DialogContent>
        <InviteForm />
      </DialogContent>
    </Dialog>
  );
}
