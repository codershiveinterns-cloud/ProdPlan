import Link from "next/link";
import { Gauge } from "lucide-react";

import { DataTable, type DataTableColumn } from "@/components/data/DataTable";
import { EmptyState } from "@/components/data/EmptyState";
import { formatPercent } from "@/lib/format";
import type { MachineUtilisationRow } from "@/lib/analytics/dashboard";
import { cn } from "@/lib/utils";

/** Amber past 90% (near/at capacity), otherwise the default bar colour — no new colour invented. */
function barTone(pct: number): string {
  return pct >= 90 ? "bg-amber-500" : "bg-primary";
}

const COLUMNS: DataTableColumn<MachineUtilisationRow>[] = [
  {
    key: "machine",
    header: "Machine",
    priority: 1,
    render: (row) => (
      <Link href={`/schedule?workCenterId=${encodeURIComponent(row.workCenterId)}`} className="hover:underline">
        <span className="font-mono text-xs text-muted-foreground">{row.code}</span> {row.name}
      </Link>
    ),
  },
  { key: "workCenter", header: "Work center", priority: 2, render: (row) => row.workCenterCode },
  {
    key: "utilisation",
    header: "Utilisation (next 7 days)",
    priority: 1,
    className: "w-64",
    render: (row) => (
      <div className="flex items-center gap-3">
        <div className="h-2 min-w-24 flex-1 overflow-hidden rounded-full bg-muted">
          <span className={cn("block h-full rounded-full", barTone(row.utilisationPercent))} style={{ width: `${Math.min(100, row.utilisationPercent)}%` }} />
        </div>
        <span className="w-12 shrink-0 text-right tabular-nums">{formatPercent(row.utilisationPercent)}</span>
      </div>
    ),
  },
];

/** Per-machine utilisation, next 7 days, sorted highest first (docs/M3_SPEC.md §5.2). */
export function MachineUtilisationTable({ rows }: { rows: MachineUtilisationRow[] }) {
  return (
    <DataTable
      columns={COLUMNS}
      rows={rows}
      rowKey={(row) => row.id}
      caption={`Machine utilisation, ${rows.length} machines`}
      emptyState={<EmptyState icon={Gauge} size="compact" title="No active machines" description="Add machines to see utilisation here." />}
    />
  );
}
