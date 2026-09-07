import Link from "next/link";
import { Boxes } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/data/EmptyState";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatQty } from "@/lib/format";
import type { MaterialRequirementRow } from "@/lib/orders/service";

/** Material requirement table (docs/M1_SPEC.md §6.1 detail): required = qty × requiredPerUnit, on hand, short by. */
export function MaterialRequirement({ rows, productId }: { rows: MaterialRequirementRow[]; productId: string }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Boxes}
        size="compact"
        title="No bill of materials"
        description="This product has no BOM lines yet, so no material requirement can be computed."
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
          <TableHead scope="col">Material</TableHead>
          <TableHead scope="col" className="text-right">Required</TableHead>
          <TableHead scope="col" className="hidden text-right md:table-cell">On hand</TableHead>
          <TableHead scope="col" className="text-right">Short by</TableHead>
          <TableHead scope="col" className="text-right"><span className="sr-only">Availability</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.materialId} className={r.isShort ? "bg-amber-50/60" : undefined}>
            <TableCell>
              <Link href={`/materials/${r.materialId}`} className="flex min-w-0 items-baseline gap-1.5 underline-offset-4 hover:underline">
                <span className="font-mono text-xs text-muted-foreground">{r.materialCode}</span>
                <span className="truncate">{r.materialName}</span>
              </Link>
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatQty(r.required, r.materialUnit)}</TableCell>
            <TableCell className="hidden text-right tabular-nums md:table-cell">{formatQty(r.onHand, r.materialUnit)}</TableCell>
            <TableCell className="text-right tabular-nums">{r.isShort ? formatQty(r.shortBy, r.materialUnit) : "—"}</TableCell>
            <TableCell className="text-right">
              {r.isShort ? (
                <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">Short</Badge>
              ) : (
                <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">Covered</Badge>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
