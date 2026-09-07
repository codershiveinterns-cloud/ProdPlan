"use client";

import Link from "next/link";
import { Cog, MoreHorizontal, Pencil, Power, Star, Trash2 } from "lucide-react";

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
import type { CalendarRow } from "@/lib/calendars/calendars";

import { deleteCalendarAction, setCalendarActiveAction, setDefaultCalendarAction } from "../actions";

/** Row kebab on /calendars: Open editor, machines, Set as default, Deactivate/Reactivate, Delete (guarded). */
export function CalendarRowMenu({ calendar, canWrite }: { calendar: CalendarRow; canWrite: boolean }) {
  const deleteBlock = calendar.isDefault
    ? "This is the default calendar — set another default first."
    : calendar.machineCount > 0
      ? `Used by ${calendar.machineCount} ${calendar.machineCount === 1 ? "machine" : "machines"} — deactivate instead of deleting.`
      : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${calendar.name}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/calendars/${calendar.id}`}>
            <Pencil />
            {canWrite ? "Edit shifts & exceptions" : "View"}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/machines?calendarId=${encodeURIComponent(calendar.id)}`}>
            <Cog />
            View machines
          </Link>
        </DropdownMenuItem>
        {canWrite ? (
          <>
            <DropdownMenuSeparator />
            {!calendar.isDefault && calendar.isActive ? (
              <ConfirmDialog
                trigger={
                  <DropdownMenuItem onSelect={(event) => event.preventDefault()}>
                    <Star />
                    Set as default
                  </DropdownMenuItem>
                }
                title={`Make ${calendar.name} the default calendar?`}
                description="New machines will be pre-filled with it. Existing machines keep the calendar they have."
                confirmLabel="Set as default"
                action={setDefaultCalendarAction.bind(null, calendar.id)}
              />
            ) : null}
            {!calendar.isDefault ? (
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
            ) : null}
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
                successMessage="Calendar deleted"
              />
            )}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
