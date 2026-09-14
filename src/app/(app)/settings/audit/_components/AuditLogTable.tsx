import type { ReactNode } from "react";
import Link from "next/link";

import { DataTable, type DataTableColumn } from "@/components/data/DataTable";
import { auditHref } from "@/lib/audit";
import type { AuditLogListRow } from "@/lib/audit-log-list";
import { formatDateTime, formatRelative } from "@/lib/format";

import { ActionBadge } from "./ActionBadge";

function prettyEntityType(entityType: string): string {
  return entityType.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

export type AuditLogTableProps = {
  rows: AuditLogListRow[];
  tz: string;
  emptyState: ReactNode;
  caption?: string;
};

function columns(tz: string): DataTableColumn<AuditLogListRow>[] {
  const now = Date.now();
  return [
    {
      key: "when",
      header: "When",
      priority: 1,
      className: "w-40",
      render: (row) => (
        <span title={formatDateTime(row.createdAt, tz)} className="whitespace-nowrap text-muted-foreground">
          {formatRelative(row.createdAt, now, tz)}
        </span>
      ),
    },
    {
      key: "actor",
      header: "Actor",
      priority: 1,
      render: (row) => <span className="truncate">{row.actorName?.trim() || row.actorEmail?.trim() || "System"}</span>,
    },
    {
      key: "action",
      header: "Action",
      priority: 2,
      render: (row) => <ActionBadge action={row.action} />,
    },
    {
      key: "entity",
      header: "Entity",
      priority: 1,
      render: (row) => {
        const href = auditHref(row);
        const label = `${prettyEntityType(row.entityType)}${row.entityLabel ? `: ${row.entityLabel}` : ""}`;
        return href ? (
          <Link href={href} className="text-primary underline-offset-4 hover:underline">
            {label}
          </Link>
        ) : (
          <span>{label}</span>
        );
      },
    },
    {
      key: "summary",
      header: "Summary",
      priority: 2,
      render: (row) => <span className="text-muted-foreground">{row.summary}</span>,
    },
    {
      key: "changed",
      header: "Changed fields",
      priority: 3,
      render: (row) => (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{row.changedFields.length > 0 ? row.changedFields.join(", ") : "—"}</span>
          {row.before != null || row.after != null ? (
            <details className="text-xs">
              <summary className="cursor-pointer text-primary underline-offset-4 hover:underline">Raw before/after</summary>
              <pre className="mt-1 max-h-64 max-w-md overflow-auto rounded-md bg-muted p-2 text-[11px] leading-snug">
                {JSON.stringify({ before: row.before ?? null, after: row.after ?? null }, null, 2)}
              </pre>
            </details>
          ) : null}
        </div>
      ),
    },
  ];
}

/** Audit log table (docs/M3_SPEC.md §9): when / actor / action / entity / summary / changed fields, row expand via native `<details>`. */
export function AuditLogTable({ rows, tz, emptyState, caption }: AuditLogTableProps) {
  return <DataTable columns={columns(tz)} rows={rows} rowKey={(r) => r.id} emptyState={emptyState} caption={caption} />;
}
