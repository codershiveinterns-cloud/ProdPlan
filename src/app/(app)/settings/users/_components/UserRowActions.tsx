"use client";

import { useCallback, useState } from "react";
import { KeyRound, MoreHorizontal, Pencil, UserRoundCheck, UserRoundX } from "lucide-react";

import { setUserActiveAction } from "@/app/(app)/settings/actions";
import { ConfirmDialog } from "@/components/data/ConfirmDialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { EditUserDialog } from "./EditUserDialog";
import { ResetPasswordDialog } from "./ResetPasswordDialog";
import type { UserRow } from "./types";

type DialogKind = "edit" | "reset" | null;

/**
 * Row kebab: Edit, Reset password, Deactivate/Reactivate. Edit and Reset open controlled dialogs rendered next to
 * the menu (so closing the menu never unmounts them); Deactivate/Reactivate uses the kit's `ConfirmDialog` with the
 * documented DropdownMenuItem trigger pattern (`onSelect` prevented so the menu stays until the dialog resolves).
 */
export function UserRowActions({ user }: { user: UserRow }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const onEditOpenChange = useCallback((open: boolean) => setDialog(open ? "edit" : null), []);
  const onResetOpenChange = useCallback((open: boolean) => setDialog(open ? "reset" : null), []);

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${user.name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialog("edit")}>
            <Pencil className="text-muted-foreground" aria-hidden="true" />
            Edit
          </DropdownMenuItem>
          {!user.isSelf ? (
            <DropdownMenuItem onSelect={() => setDialog("reset")}>
              <KeyRound className="text-muted-foreground" aria-hidden="true" />
              Reset password
            </DropdownMenuItem>
          ) : null}
          {!user.isSelf ? (
            <>
              <DropdownMenuSeparator />
              <ConfirmDialog
                trigger={
                  <DropdownMenuItem
                    onSelect={(event) => event.preventDefault()}
                    variant={user.isActive ? "destructive" : "default"}
                  >
                    {user.isActive ? (
                      <UserRoundX aria-hidden="true" />
                    ) : (
                      <UserRoundCheck className="text-muted-foreground" aria-hidden="true" />
                    )}
                    {user.isActive ? "Deactivate" : "Reactivate"}
                  </DropdownMenuItem>
                }
                title={user.isActive ? `Deactivate ${user.name}?` : `Reactivate ${user.name}?`}
                description={
                  user.isActive
                    ? `${user.email} will be signed out everywhere and can no longer sign in. Their history is kept and the account can be reactivated later.`
                    : `${user.email} will be able to sign in again with their existing password.`
                }
                confirmLabel={user.isActive ? "Deactivate" : "Reactivate"}
                destructive={user.isActive}
                action={setUserActiveAction.bind(null, user.id, !user.isActive)}
                successMessage={user.isActive ? `${user.name} deactivated` : `${user.name} reactivated`}
                onSuccess={() => setMenuOpen(false)}
              />
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <EditUserDialog user={user} open={dialog === "edit"} onOpenChange={onEditOpenChange} />
      {!user.isSelf ? <ResetPasswordDialog user={user} open={dialog === "reset"} onOpenChange={onResetOpenChange} /> : null}
    </>
  );
}
