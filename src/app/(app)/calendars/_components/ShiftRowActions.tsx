"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";

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

import { deleteShiftAction } from "../actions";
import { ShiftDialog, type ShiftDialogShift } from "./ShiftDialog";

/** Kebab on a shift row: Edit (ShiftDialog), Delete (blocked on the calendar's last shift). */
export function ShiftRowActions({
  shift,
  calendarId,
  calendarName,
  isLast,
}: {
  shift: ShiftDialogShift;
  calendarId: string;
  calendarName: string;
  isLast: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={`Actions for shift ${shift.name}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <ShiftDialog
          calendarId={calendarId}
          calendarName={calendarName}
          shift={shift}
          trigger={
            <DropdownMenuItem onSelect={(event) => event.preventDefault()}>
              <Pencil />
              Edit
            </DropdownMenuItem>
          }
        />
        <DropdownMenuSeparator />
        {isLast ? (
          <>
            <DropdownMenuItem disabled>
              <Trash2 />
              Delete
            </DropdownMenuItem>
            <DropdownMenuLabel className="max-w-56 whitespace-normal font-normal">
              A calendar keeps at least one shift. Add another shift first.
            </DropdownMenuLabel>
          </>
        ) : (
          <ConfirmDialog
            trigger={
              <DropdownMenuItem variant="destructive" onSelect={(event) => event.preventDefault()}>
                <Trash2 />
                Delete
              </DropdownMenuItem>
            }
            title={`Remove shift ${shift.name}?`}
            description={`${shift.startTime}–${shift.endTime} will no longer count towards capacity for machines on ${calendarName}.`}
            confirmLabel="Remove"
            destructive
            action={deleteShiftAction.bind(null, shift.id, calendarId)}
            successMessage="Shift removed"
          />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
