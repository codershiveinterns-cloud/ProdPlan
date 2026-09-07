"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { ConfirmDialog } from "@/components/data/ConfirmDialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { deleteExceptionAction } from "../actions";
import { ExceptionDialog, type ExceptionDialogException } from "./ExceptionDialog";

/** Kebab on an exception row: Edit (ExceptionDialog), Delete (ConfirmDialog). */
export function ExceptionRowActions({
  exception,
  dateLabel,
  calendarId,
  calendarName,
  today,
}: {
  exception: ExceptionDialogException;
  dateLabel: string;
  calendarId: string;
  calendarName: string;
  today: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={`Actions for exception on ${dateLabel}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <ExceptionDialog
          calendarId={calendarId}
          calendarName={calendarName}
          today={today}
          exception={exception}
          trigger={
            <DropdownMenuItem onSelect={(event) => event.preventDefault()}>
              <Pencil />
              Edit
            </DropdownMenuItem>
          }
        />
        <DropdownMenuSeparator />
        <ConfirmDialog
          trigger={
            <DropdownMenuItem variant="destructive" onSelect={(event) => event.preventDefault()}>
              <Trash2 />
              Delete
            </DropdownMenuItem>
          }
          title={`Remove the exception on ${dateLabel}?`}
          description="The weekly shift pattern applies to that date again."
          confirmLabel="Remove"
          destructive
          action={deleteExceptionAction.bind(null, exception.id, calendarId)}
          successMessage="Exception removed"
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
