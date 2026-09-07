import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type ColumnPriority = 1 | 2 | 3;
export type SortDir = "asc" | "desc";

export type DataTableColumn<T> = {
  /** Unique key for React and for `aria-sort`. */
  key: string;
  header: ReactNode;
  /** 1 = always visible; 2 = hidden below md; 3 = hidden below lg (spec §5). */
  priority: ColumnPriority;
  /** Applied to both the header and body cells (e.g. `text-right w-32`). */
  className?: string;
  render: (row: T) => ReactNode;
  /** Present → the header becomes a sort link (requires the `sort` prop on the table). */
  sortKey?: string;
};

export type DataTableSort = {
  sort: string;
  dir: SortDir;
  makeHref: (sort: string, dir: SortDir) => string;
};

export type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Rendered inside the table frame when `rows` is empty. */
  emptyState: ReactNode;
  sort?: DataTableSort;
  /** Extra classes per row, e.g. the amber tint for materials at/below the reorder threshold. */
  rowClassName?: (row: T) => string | undefined;
  /** Screen-reader caption ("Orders, 25 of 312"). */
  caption?: string;
  className?: string;
};

/** Responsive visibility for column priorities (spec §5). */
export function priorityClass(priority: ColumnPriority): string {
  switch (priority) {
    case 3:
      return "hidden lg:table-cell";
    case 2:
      return "hidden md:table-cell";
    default:
      return "";
  }
}

function nextDir(column: DataTableColumn<unknown>, sort: DataTableSort): SortDir {
  const active = column.sortKey === sort.sort;
  return active && sort.dir === "asc" ? "desc" : "asc";
}

/**
 * Server Component table for list pages: column priorities, sticky first column, 48 px rows, sort header links.
 * No client handlers — row actions belong in a kebab `DropdownMenu` rendered by the page inside `render`.
 * Wide tables scroll inside their own container; the page body never scrolls horizontally.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyState,
  sort,
  rowClassName,
  caption,
  className,
}: DataTableProps<T>) {
  return (
    <div className={cn("overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10", className)}>
      {rows.length === 0 ? (
        <div className="p-6">{emptyState}</div>
      ) : (
        <Table>
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <TableHeader className="bg-muted">
            <TableRow className="hover:bg-transparent">
              {columns.map((column, index) => {
                const sortable = Boolean(sort && column.sortKey);
                const active = sortable && sort!.sort === column.sortKey;
                const ariaSort = active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined;
                return (
                  <TableHead
                    key={column.key}
                    scope="col"
                    aria-sort={sortable ? (ariaSort ?? "none") : undefined}
                    className={cn(
                      priorityClass(column.priority),
                      index === 0 && "pp-sticky-col bg-muted shadow-[inset_-1px_0_0_var(--border)]",
                      column.className,
                    )}
                  >
                    {sortable ? (
                      <Link
                        href={sort!.makeHref(column.sortKey!, nextDir(column as DataTableColumn<unknown>, sort!))}
                        className={cn(
                          "-mx-3 inline-flex h-12 items-center gap-1 px-3 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset",
                          active && "text-foreground",
                        )}
                      >
                        {column.header}
                        {active ? (
                          sort!.dir === "asc" ? (
                            <ArrowUp className="size-3.5" aria-hidden="true" />
                          ) : (
                            <ArrowDown className="size-3.5" aria-hidden="true" />
                          )
                        ) : (
                          <ArrowUpDown className="size-3.5 opacity-50" aria-hidden="true" />
                        )}
                        <span className="sr-only">
                          {active ? `, sorted ${sort!.dir === "asc" ? "ascending" : "descending"}` : ", sortable"}
                        </span>
                      </Link>
                    ) : (
                      column.header
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={rowKey(row)} className={cn("bg-card", rowClassName?.(row))}>
                {columns.map((column, index) => (
                  <TableCell
                    key={column.key}
                    className={cn(
                      priorityClass(column.priority),
                      index === 0 && "pp-sticky-col shadow-[inset_-1px_0_0_var(--border)]",
                      column.className,
                    )}
                  >
                    {column.render(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
