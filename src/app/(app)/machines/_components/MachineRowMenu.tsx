"use client";

import Link from "next/link";
import { Eye, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { ConfirmDialog } from "@/components/data/ConfirmDialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { deleteMachineAction } from "../actions";

/** Row kebab on /machines: View, Edit, Delete (delete is blocked server-side while routing steps pin the machine). */
export function MachineRowMenu({ machine, canWrite }: { machine: { id: string; code: string }; canWrite: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${machine.code}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/machines/${machine.id}`}>
            <Eye />
            View
          </Link>
        </DropdownMenuItem>
        {canWrite ? (
          <>
            <DropdownMenuItem asChild>
              <Link href={`/machines/${machine.id}/edit`}>
                <Pencil />
                Edit
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <ConfirmDialog
              trigger={
                <DropdownMenuItem variant="destructive" onSelect={(event) => event.preventDefault()}>
                  <Trash2 />
                  Delete
                </DropdownMenuItem>
              }
              title={`Delete machine ${machine.code}?`}
              description="Its downtime windows are removed too. This cannot be undone. Machines used by a routing step cannot be deleted — set them Inactive instead."
              confirmLabel="Delete"
              destructive
              action={deleteMachineAction.bind(null, machine.id)}
              successMessage="Machine deleted"
            />
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
