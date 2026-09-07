"use client";

import { Activity, MoreHorizontal, Power, Trash2, Wrench } from "lucide-react";

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
import type { MachineStatus } from "@/generated/prisma/enums";

import { deleteMachineAction, setMachineStatusAction } from "../actions";

const STATUS_ITEMS: Array<{ status: MachineStatus; label: string; icon: typeof Activity; description: string }> = [
  { status: "ACTIVE", label: "Set active", icon: Activity, description: "The machine becomes schedulable again." },
  {
    status: "MAINTENANCE",
    label: "Set maintenance",
    icon: Wrench,
    description: "Out of service until it is set back to Active. Add a downtime window to plan the period.",
  },
  { status: "INACTIVE", label: "Set inactive", icon: Power, description: "Retired: hidden from pickers and dashboards." },
];

/** Detail-page kebab (machines:write): status shortcuts + Delete. */
export function MachineActionsMenu({
  machine,
  usageOperations,
}: {
  machine: { id: string; code: string; status: MachineStatus };
  usageOperations: number;
}) {
  const inUse = usageOperations > 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label="More actions">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Status</DropdownMenuLabel>
        {STATUS_ITEMS.filter((item) => item.status !== machine.status).map((item) => (
          <ConfirmDialog
            key={item.status}
            trigger={
              <DropdownMenuItem onSelect={(event) => event.preventDefault()}>
                <item.icon />
                {item.label}
              </DropdownMenuItem>
            }
            title={`${item.label} for ${machine.code}?`}
            description={item.description}
            confirmLabel={item.label}
            action={setMachineStatusAction.bind(null, machine.id, item.status)}
          />
        ))}
        <DropdownMenuSeparator />
        {inUse ? (
          <>
            <DropdownMenuItem disabled>
              <Trash2 />
              Delete
            </DropdownMenuItem>
            <DropdownMenuLabel className="max-w-56 whitespace-normal font-normal">
              Used by {usageOperations} routing {usageOperations === 1 ? "step" : "steps"} — set it Inactive instead.
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
            title={`Delete machine ${machine.code}?`}
            description="Its downtime windows are removed too. This cannot be undone."
            confirmLabel="Delete"
            destructive
            action={deleteMachineAction.bind(null, machine.id)}
            successMessage="Machine deleted"
          >
            <input type="hidden" name="redirectToList" value="1" />
          </ConfirmDialog>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
