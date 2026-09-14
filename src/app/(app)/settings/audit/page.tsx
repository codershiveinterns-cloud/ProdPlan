import type { Metadata } from "next";
import Link from "next/link";
import { History } from "lucide-react";

import { EmptyState } from "@/components/data/EmptyState";
import { Pagination } from "@/components/data/Pagination";
import { SearchInput } from "@/components/data/SearchInput";
import { Button } from "@/components/ui/button";
import { ExportButton } from "@/components/export/ExportButton";
import { can } from "@/lib/rbac";
import {
  AUDIT_LOG_PAGE_SIZE,
  auditLogListQuery,
  countActiveAuditLogFilters,
  listAuditActorOptions,
  listAuditLog,
  parseAuditLogListParams,
} from "@/lib/audit-log-list";

import { requirePagePermission } from "../_lib/guard";
import { AuditLogFilters } from "./_components/AuditLogFilters";
import { AuditLogTable } from "./_components/AuditLogTable";

export const metadata: Metadata = { title: "Audit log" };

type SearchParams = Record<string, string | string[] | undefined>;

/** Audit log (docs/M3_SPEC.md §9): ADMIN-only browsable view of every AuditLog row for the tenant. */
export default async function AuditLogPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { session, db } = await requirePagePermission("audit:read-all");
  const params = parseAuditLogListParams(await searchParams);
  const tz = session.tenant.timezone;
  const [{ rows, total }, actors] = await Promise.all([listAuditLog(db, params, tz), listAuditActorOptions(db)]);
  const listHref = (patch: Partial<typeof params>) => `/settings/audit${auditLogListQuery({ ...params, ...patch })}`;
  const activeFilters = countActiveAuditLogFilters(params);
  const filtered = activeFilters > 0 || params.q !== "";
  const canExport = can(session.user.role, "exports:create");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <SearchInput placeholder="Search summary, entity, actor" defaultValue={params.q} />
        <div className="flex flex-wrap items-start gap-3">
          <AuditLogFilters params={params} actors={actors} />
          {canExport ? (
            <ExportButton
              kind="AUDIT_LOG"
              filters={{ q: params.q, entityType: params.entityType, action: params.action, actorId: params.actorId, from: params.from, to: params.to }}
            />
          ) : null}
        </div>
      </div>
      <AuditLogTable
        rows={rows}
        tz={tz}
        caption={`Audit log, page ${params.page}, ${rows.length} of ${total}`}
        emptyState={
          filtered ? (
            <EmptyState
              title={params.q ? `No results for “${params.q}”` : "No activity matches these filters"}
              description="Try a different search or clear the filters."
              action={
                <Button variant="outline" asChild>
                  <Link href="/settings/audit">Clear filters</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState icon={History} title="No activity yet" description="Every create, edit and status change will show up here." />
          )
        }
      />
      <Pagination page={params.page} pageSize={AUDIT_LOG_PAGE_SIZE} total={total} makeHref={(page) => listHref({ page })} />
    </div>
  );
}
