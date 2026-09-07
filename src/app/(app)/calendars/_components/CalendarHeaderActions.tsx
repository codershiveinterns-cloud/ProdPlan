"use client";

import { MoreHorizontal, Pencil, Power, Star, Trash2 } from "lucide-react";

import { ConfirmDialog } from "@/components/data/ConfirmDialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { deleteCalendarAction, setCalendarActiveAction, setDefaultCalendarAction } from "../actions";
import { RenameCalendarDialog } from "./RenameCalendarDialog";

export type CalendarHeaderActionsProps = {
  calendar: { id: string; name: string; isActive: boolean };
  isDefault: boolean;
  /** Reason the calendar cannot be deleted (default / used), or null when deletable. */
  deleteBlock: string | null;
};

/** Editor header (machines:write): Rename, Set as default, kebab with Deactivate/Reactivate and Delete. */
export function CalendarHeaderActions({ calendar, isDefault, deleteBlock }: CalendarHeaderActionsProps) {
  return (
    <>
      <RenameCalendarDialog
        calendar={calendar}
        trigger={
          <Button variant="outline">
            <Pencil data-icon="inline-start" />
            Rename
          </Button>
        }
      />
      {!isDefault && calendar.isActive ? (
        <ConfirmDialog
          trigger={
            <Button>
              <Star data-icon="inline-start" />
              Set as default
            </Button>
          }
          title={`Make ${calendar.name} the default calendar?`}
          description="New machines will be pre-filled with it. Existing machines keep the calendar they have."
          confirmLabel="Set as default"
          action={setDefaultCalendarAction.bind(null, calendar.id)}
        />
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="More actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {isDefault ? (
            <DropdownMenuLabel className="max-w-56 whitespace-normal font-normal">
              This is the default calendar. Set another default to deactivate or delete it.
            </DropdownMenuLabel>
          ) : (
            <ConfirmDialog
              trigger={
                <DropdownMenuItem onSelect={(event) => event.preventDefault()}>
                  <Power />
                  {calendar.isActive ? "Deactivate" : "Reactivate"}
                </DropdownMenuItem>
              }
              title={`${calendar.isActive ? "Deactivate" : "Reactivate"} ${calendar.name}?`}
              description={
                calendar.isActive
                  ? "Machines already using it keep it; it disappears from the calendar picker."
                  : "It becomes available in the calendar picker again."
              }
              confirmLabel={calendar.isActive ? "Deactivate" : "Reactivate"}
              action={setCalendarActiveAction.bind(null, calendar.id, !calendar.isActive)}
            />
          )}
          <DropdownMenuSeparator />
          {deleteBlock ? (
            <>
              <DropdownMenuItem disabled>
                <Trash2 />
                Delete
              </DropdownMenuItem>
              <DropdownMenuLabel className="max-w-56 whitespace-normal font-normal">{deleteBlock}</DropdownMenuLabel>
            </>
          ) : (
            <ConfirmDialog
              trigger={
                <DropdownMenuItem variant="destructive" onSelect={(event) => event.preventDefault()}>
                  <Trash2 />
                  Delete
                </DropdownMenuItem>
              }
              title={`Delete calendar ${calendar.name}?`}
              description="Its shifts and exceptions are removed too. This cannot be undone."
              confirmLabel="Delete"
              destructive
              action={deleteCalendarAction.bind(null, calendar.id)}
            >
              <input type="hidden" name="redirectToList" value="1" />
            </ConfirmDialog>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
