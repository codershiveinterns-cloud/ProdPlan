import Link from "next/link";
import { Cog } from "lucide-react";

import { DataTable, type DataTableColumn } from "@/components/data/DataTable";
import { DowntimeTypeBadge } from "@/components/data/DowntimeTypeBadge";
import { EmptyState } from "@/components/data/EmptyState";
import { MachineStatusBadge } from "@/components/data/MachineStatusBadge";
import { Button } from "@/components/ui/button";
import type { DowntimeType } from "@/generated/prisma/enums";
import type { DashboardMachineRow } from "@/lib/dashboard/queries";

/** Row DTO with the strings the page already formatted (`until` in the tenant timezone). */
export type MachineRow = Omit<DashboardMachineRow, "activeDowntime"> & {
  activeDowntime: { type: DowntimeType; until: string; reason: string | null } | null;
};

export function MachinesTable({ rows, canCreate }: { rows: MachineRow[]; canCreate: boolean }) {
  const columns: DataTableColumn<MachineRow>[] = [
    {
      key: "code",
      header: "Code",
      priority: 1,
      render: (m) => (
        <Link href={`/machines/${m.id}`} className="font-mono font-medium underline-offset-4 hover:underline">
          {m.code}
        </Link>
      ),
    },
    { key: "name", header: "Name", priority: 1, render: (m) => <span className="block max-w-64 truncate">{m.name}</span> },
    {
      key: "wc",
      header: "Work center",
      priority: 2,
      render: (m) => (
        <span className="whitespace-nowrap">
          <span className="font-mono">{m.workCenterCode}</span>
          <span className="text-muted-foreground"> · {m.workCenterName}</span>
        </span>
      ),
    },
    { key: "status", header: "Status", priority: 1, render: (m) => <MachineStatusBadge status={m.status} activeDowntime={m.activeDowntime} /> },
    {
      key: "downtime",
      header: "Current downtime",
      priority: 3,
      render: (m) =>
        m.activeDowntime ? (
          <span className="inline-flex flex-wrap items-center gap-1.5 whitespace-nowrap">
            <DowntimeTypeBadge type={m.activeDowntime.type} />
            <span className="text-sm text-muted-foreground">
              until {m.activeDowntime.until}
              {m.activeDowntime.reason ? ` · ${m.activeDowntime.reason}` : ""}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(m) => m.id}
      caption={`Machines, ${rows.length} shown`}
      emptyState={
        <EmptyState
          icon={Cog}
          size="compact"
          title="No machines yet"
          description="Add machines with their work center, calendar and efficiency to plan capacity."
          action={
            canCreate ? (
              <Button asChild>
                <Link href="/machines/new">Add machine</Link>
              </Button>
            ) : undefined
          }
        />
      }
    />
  );
}
