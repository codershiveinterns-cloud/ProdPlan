import { Fragment } from "react";

import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatInt } from "@/lib/format";
import type { CapacityTable as CapacityTableData } from "@/lib/machines/capacity";
import { cn } from "@/lib/utils";

const NUM = "text-right tabular-nums";

/**
 * "Capacity — next 7 days": Date · Day · Shift · Net min · Downtime min · Available min with a totals row;
 * non-working / exception days collapse to one muted row (docs/M1_SPEC.md §6.2). Server Component.
 */
export function CapacityTable({ table }: { table: CapacityTableData }) {
  return (
    <div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
      <Table>
        <caption className="sr-only">
          Capacity from {table.fromDate} to {table.toDate}
        </caption>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col">Date</TableHead>
            <TableHead scope="col" className="w-14">
              Day
            </TableHead>
            <TableHead scope="col">Shift</TableHead>
            <TableHead scope="col" className={NUM}>
              Net min
            </TableHead>
            <TableHead scope="col" className={cn(NUM, "hidden md:table-cell")}>
              Downtime min
            </TableHead>
            <TableHead scope="col" className={NUM}>
              Available min
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.days.map((day) =>
            day.isWorking ? (
              <Fragment key={day.date}>
                {day.shifts.map((shift, index) => (
                  <TableRow key={shift.shiftId} className={cn(index > 0 && "border-t-0")}>
                    <TableCell className={cn(index > 0 && "text-transparent select-none")}>{day.dateLabel}</TableCell>
                    <TableCell className={cn("text-muted-foreground", index > 0 && "text-transparent select-none")}>
                      {day.dayLabel}
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{shift.name}</span>{" "}
                      <span className="text-muted-foreground">{shift.timeLabel}</span>
                    </TableCell>
                    <TableCell className={NUM}>{formatInt(shift.netMinutes)}</TableCell>
                    <TableCell className={cn(NUM, "hidden md:table-cell", shift.downtimeMinutes > 0 && "text-red-700")}>
                      {shift.downtimeMinutes > 0 ? `−${formatInt(shift.downtimeMinutes)}` : "0"}
                    </TableCell>
                    <TableCell className={cn(NUM, "font-medium", shift.availableMinutes === 0 && "text-muted-foreground")}>
                      {formatInt(shift.availableMinutes)}
                    </TableCell>
                  </TableRow>
                ))}
              </Fragment>
            ) : (
              <TableRow key={day.date} className="bg-muted/30 text-muted-foreground">
                <TableCell>{day.dateLabel}</TableCell>
                <TableCell>{day.dayLabel}</TableCell>
                <TableCell colSpan={4} className="whitespace-normal italic">
                  {day.nonWorkingLabel}
                </TableCell>
              </TableRow>
            ),
          )}
        </TableBody>
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={3}>Total ({table.days.length} days)</TableCell>
            <TableCell className={NUM}>{formatInt(table.totals.net)}</TableCell>
            <TableCell className={cn(NUM, "hidden md:table-cell")}>
              {table.totals.downtime > 0 ? `−${formatInt(table.totals.downtime)}` : "0"}
            </TableCell>
            <TableCell className={NUM}>{formatInt(table.totals.available)}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
      <p className="border-t bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        Available = net shift minutes × {table.efficiencyPercent}% efficiency − downtime overlap. Dates are in the plant
        timezone.
      </p>
    </div>
  );
}
