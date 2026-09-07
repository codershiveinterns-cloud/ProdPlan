"use client";

import { LogOut } from "lucide-react";

import { signOutEverywhereAction } from "@/app/(app)/settings/actions";
import { ConfirmDialog } from "@/components/data/ConfirmDialog";
import { Button } from "@/components/ui/button";

/** Bumps the own tokenVersion; the action re-issues this device's cookie so only OTHER sessions are revoked. */
export function SignOutEverywhere() {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline">
          <LogOut aria-hidden="true" />
          Sign out everywhere
        </Button>
      }
      title="Sign out of all other devices?"
      description="Every other browser or device signed in with your account will be asked to sign in again. This device stays signed in."
      confirmLabel="Sign out everywhere"
      action={signOutEverywhereAction}
      successMessage="Signed out everywhere else"
    />
  );
}
