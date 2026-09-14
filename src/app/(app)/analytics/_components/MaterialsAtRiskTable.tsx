import Link from "next/link";
import { Boxes } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/data/DataTable";
import { EmptyState } from "@/components/data/EmptyState";
import { formatDate, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { ShortagePrediction } from "@/lib/analytics/shortage";

/** Colour semantics matching DeliveryRiskBadge/StatCard: WATCH amber, SHORT red — no new colours invented. */
const SEVERITY_META: Record<ShortagePrediction["severity"], { label: string; className: string }> = {
  OK: { label: "OK", className: "border-green-200 bg-green-50 text-green-700" },
  WATCH: { label: "Watch", className: "border-amber-200 bg-amber-50 text-amber-800" },
  SHORT: { label: "Short", className: "border-red-200 bg-red-50 text-red-700" },
};

const COLUMNS: DataTableColumn<ShortagePrediction>[] = [
  {
    key: "material",
    header: "Material",
    priority: 1,
    render: (row) => (
      <Link href={`/materials/${row.materialId}`} className="hover:underline">
        <span className="font-mono text-xs text-muted-foreground">{row.code}</span> {row.name}
      </Link>
    ),
  },
  { key: "onHand", header: "On hand", priority: 1, className: "text-right tabular-nums", render: (row) => formatQty(row.stockOnHand, row.unit) },
  {
    key: "committedDemand",
    header: "Committed demand",
    priority: 2,
    className: "text-right tabular-nums",
    render: (row) => formatQty(row.committedDemand, row.unit),
  },
  {
    key: "projectedBalance",
    header: "Projected balance",
    priority: 1,
    className: "text-right tabular-nums",
    render: (row) => (
      <span className={cn(row.projectedBalance < 0 && "font-medium text-red-700")}>{formatQty(row.projectedBalance, row.unit)}</span>
    ),
  },
  {
    key: "firstShortfall",
    header: "First shortfall",
    priority: 2,
    render: (row) =>
      row.firstShortfallOrderId && row.firstShortfallDate ? (
        <Link href={`/orders/${row.firstShortfallOrderId}`} className="hover:underline">
          {formatDate(row.firstShortfallDate)}
        </Link>
      ) : (
        "—"
      ),
  },
  {
    key: "severity",
    header: "Severity",
    priority: 1,
    render: (row) => (
      <Badge variant="outline" className={SEVERITY_META[row.severity].className}>
        {SEVERITY_META[row.severity].label}
      </Badge>
    ),
  },
];

/** Materials predicted to run short, WATCH/SHORT only (docs/M3_SPEC.md §5.4), from `predictShortages()`. */
export function MaterialsAtRiskTable({ rows }: { rows: ShortagePrediction[] }) {
  return (
    <DataTable
      columns={COLUMNS}
      rows={rows}
      rowKey={(row) => row.materialId}
      caption={`Materials at risk, ${rows.length} materials`}
      rowClassName={(row) => (row.severity === "SHORT" ? "bg-red-50/40" : undefined)}
      emptyState={<EmptyState icon={Boxes} size="compact" title="No materials at risk" description="Every material has enough stock for open orders." />}
    />
  );
}
