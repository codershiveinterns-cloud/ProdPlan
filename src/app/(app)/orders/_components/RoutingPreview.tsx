import Link from "next/link";
import { Route } from "lucide-react";

import { EmptyState } from "@/components/data/EmptyState";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMinutes, formatNumber } from "@/lib/format";
import type { RoutingPreviewRow } from "@/lib/orders/service";

/** Routing preview (docs/M1_SPEC.md §6.1 detail): seq, work center, setup, run/unit, est. minutes at 100 %. */
export function RoutingPreview({ rows, totalMinutes, productId }: { rows: RoutingPreviewRow[]; totalMinutes: number; productId: string }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Route}
        size="compact"
        title="No routing"
        description="This product has no routing steps yet."
        action={
          <Link href={`/products/${productId}`} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            Open product
          </Link>
        }
      />
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead scope="col" className="w-14">Seq</TableHead>
          <TableHead scope="col">Work center</TableHead>
          <TableHead scope="col" className="hidden text-right md:table-cell">Setup</TableHead>
          <TableHead scope="col" className="hidden text-right md:table-cell">Run / unit</TableHead>
          <TableHead scope="col" className="text-right">Est. at 100 %</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="font-mono text-xs text-muted-foreground">{r.sequence}</TableCell>
            <TableCell>
              <span className="flex min-w-0 items-baseline gap-1.5">
                <span className="font-mono text-xs text-muted-foreground">{r.workCenterCode}</span>
                <span className="truncate">{r.workCenterName}</span>
                {r.machineCode ? <span className="text-xs text-muted-foreground">· {r.machineCode}</span> : null}
              </span>
            </TableCell>
            <TableCell className="hidden text-right tabular-nums md:table-cell">{formatMinutes(r.setupMinutes)}</TableCell>
            <TableCell className="hidden text-right tabular-nums md:table-cell">{formatNumber(r.runMinutesPerUnit, 3)} min</TableCell>
            <TableCell className="text-right tabular-nums">{formatMinutes(r.estimatedMinutes)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={2}>Total</TableCell>
          <TableCell className="hidden md:table-cell" />
          <TableCell className="hidden md:table-cell" />
          <TableCell className="text-right tabular-nums">{formatMinutes(totalMinutes)}</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}
