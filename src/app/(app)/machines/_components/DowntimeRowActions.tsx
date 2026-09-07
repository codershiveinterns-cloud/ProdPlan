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
import type { DowntimeRow } from "@/lib/machines/downtime";

import { deleteDowntimeAction } from "../actions";
import { DowntimeDialog } from "./DowntimeDialog";

/** Kebab on a downtime row: Edit (DowntimeDialog) and Delete (ConfirmDialog). Rendered only for `downtime:write`. */
export function DowntimeRowActions({ window, machineCode, tz }: { window: DowntimeRow; machineCode: string; tz: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={`Actions for downtime ${window.rangeLabel}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DowntimeDialog
          machineId={window.machineId}
          machineCode={machineCode}
          tz={tz}
          window={window}
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
          title="Delete this downtime window?"
          description={`${window.rangeLabel} will be removed and the machine's capacity for that period restored.`}
          confirmLabel="Delete"
          destructive
          action={deleteDowntimeAction.bind(null, window.id, window.machineId)}
          successMessage="Downtime window removed"
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
