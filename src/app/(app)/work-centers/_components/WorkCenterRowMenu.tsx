"use client";

import Link from "next/link";
import { Cog, MoreHorizontal, Pencil, Power, Trash2 } from "lucide-react";

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
import { describeUsage } from "@/lib/machines/usage";
import type { WorkCenterRow } from "@/lib/machines/work-centers";

import { deleteWorkCenterAction, setWorkCenterActiveAction } from "../actions";
import { WorkCenterDialog } from "./WorkCenterDialog";

/** Row kebab: Edit (dialog), Machines link, Deactivate/Reactivate, Delete (blocked while used → Deactivate). */
export function WorkCenterRowMenu({ workCenter, canWrite }: { workCenter: WorkCenterRow; canWrite: boolean }) {
  const usage = describeUsage({ machines: workCenter.machineCount, operations: workCenter.operationCount });
  const inUse = usage !== "";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${workCenter.code}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/machines?workCenterId=${encodeURIComponent(workCenter.id)}`}>
            <Cog />
            View machines
          </Link>
        </DropdownMenuItem>
        {canWrite ? (
          <>
            <WorkCenterDialog
              workCenter={workCenter}
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
                <DropdownMenuItem onSelect={(event) => event.preventDefault()}>
                  <Power />
                  {workCenter.isActive ? "Deactivate" : "Reactivate"}
                </DropdownMenuItem>
              }
              title={`${workCenter.isActive ? "Deactivate" : "Reactivate"} ${workCenter.code}?`}
              description={
                workCenter.isActive
                  ? "It stays on existing machines and routings but disappears from pickers."
                  : "It becomes available in machine and routing pickers again."
              }
              confirmLabel={workCenter.isActive ? "Deactivate" : "Reactivate"}
              action={setWorkCenterActiveAction.bind(null, workCenter.id, !workCenter.isActive)}
              successMessage={`Work center ${workCenter.isActive ? "deactivated" : "reactivated"}`}
            />
            {inUse ? (
              <>
                <DropdownMenuItem disabled>
                  <Trash2 />
                  Delete
                </DropdownMenuItem>
                <DropdownMenuLabel className="max-w-56 whitespace-normal font-normal">
                  {usage} — deactivate instead of deleting.
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
                title={`Delete work center ${workCenter.code}?`}
                description="This cannot be undone. Deleting is only possible while no machine or routing step uses it."
                confirmLabel="Delete"
                destructive
                action={deleteWorkCenterAction.bind(null, workCenter.id)}
                successMessage="Work center deleted"
              />
            )}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
