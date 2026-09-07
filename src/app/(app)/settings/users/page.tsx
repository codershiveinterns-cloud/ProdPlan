import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";

import { DataTable, type DataTableColumn } from "@/components/data/DataTable";
import { EmptyState } from "@/components/data/EmptyState";
import { FilterBar } from "@/components/data/FilterBar";
import { Pagination } from "@/components/data/Pagination";
import { SearchInput } from "@/components/data/SearchInput";
import { FormField } from "@/components/forms/FormField";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDateTime } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/rbac";
import { countActiveUserFilters, listUsers, parseUserListParams, userListHref } from "@/lib/users/list";

import { requirePagePermission } from "../_lib/guard";
import { InviteUserDialog } from "./_components/InviteUserDialog";
import type { UserRow } from "./_components/types";
import { UserRowActions } from "./_components/UserRowActions";

export const metadata: Metadata = { title: "Users" };

type SearchParams = Record<string, string | string[] | undefined>;

function columns(): DataTableColumn<UserRow>[] {
  return [
    {
      key: "name",
      header: "Name",
      priority: 1,
      sortKey: "name",
      render: (u) => (
        <div className="flex min-w-0 flex-col">
          <span className="flex items-center gap-2 font-medium text-foreground">
            <span className="truncate">{u.name}</span>
            {u.isSelf ? (
              <Badge variant="outline" className="shrink-0">
                You
              </Badge>
            ) : null}
          </span>
          <span className="truncate text-xs text-muted-foreground md:hidden">{u.email}</span>
        </div>
      ),
    },
    {
      key: "email",
      header: "Email",
      priority: 2,
      sortKey: "email",
      render: (u) => <span className="text-muted-foreground">{u.email}</span>,
    },
    {
      key: "role",
      header: "Role",
      priority: 1,
      sortKey: "role",
      render: (u) => <Badge variant="secondary">{ROLE_LABELS[u.role]}</Badge>,
    },
    {
      key: "status",
      header: "Status",
      priority: 1,
      render: (u) => (
        <div className="flex flex-wrap items-center gap-1.5">
          {u.isActive ? (
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">
              Active
            </Badge>
          ) : (
            <Badge variant="outline">Inactive</Badge>
          )}
          {u.isActive && u.mustChangePassword ? (
            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
              Temporary password
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      key: "lastLogin",
      header: "Last login",
      priority: 2,
      sortKey: "lastLoginAt",
      render: (u) => <span className={u.lastLoginLabel === "Never" ? "text-muted-foreground" : undefined}>{u.lastLoginLabel}</span>,
    },
    {
      key: "created",
      header: "Added",
      priority: 3,
      sortKey: "createdAt",
      render: (u) => <span className="text-muted-foreground">{u.createdLabel}</span>,
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      priority: 1,
      className: "w-12 text-right",
      render: (u) => <UserRowActions user={u} />,
    },
  ];
}

/** Users (docs/M1_SPEC.md §3 "Users", §6.8): list + invite / edit / reset password / deactivate. ADMIN only. */
export default async function UsersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { session, db } = await requirePagePermission("users:manage");
  const params = parseUserListParams(await searchParams);
  const { rows, total, page } = await listUsers(db, params);
  const tz = session.tenant.timezone;
  const activeFilters = countActiveUserFilters(params);

  const users: UserRow[] = rows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    mustChangePassword: u.mustChangePassword,
    lastLoginLabel: u.lastLoginAt ? formatDateTime(u.lastLoginAt, tz) : "Never",
    createdLabel: formatDateTime(u.createdAt, tz),
    isSelf: u.id === session.user.id,
  }));

  const filtered = activeFilters > 0 || params.q !== "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <SearchInput placeholder="Search name or email" defaultValue={params.q} />
          <FilterBar activeCount={activeFilters} clearHref="/settings/users">
            <FormField label="Role" htmlFor="role">
              <select
                name="role"
                id="role"
                defaultValue={params.role ?? ""}
                className="h-11 rounded-lg border border-input bg-card px-3 text-sm"
              >
                <option value="">All roles</option>
                {(Object.keys(ROLE_LABELS) as Array<keyof typeof ROLE_LABELS>).map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </FormField>
            <label className="flex h-11 items-center gap-2 text-sm">
              <Checkbox name="includeInactive" value="1" defaultChecked={params.includeInactive} /> Include inactive
            </label>
          </FilterBar>
        </div>
        <InviteUserDialog />
      </div>
      <DataTable
        columns={columns()}
        rows={users}
        rowKey={(u) => u.id}
        sort={{ sort: params.sort, dir: params.dir, makeHref: (sort, dir) => userListHref(params, { sort: sort as typeof params.sort, dir, page: 1 }) }}
        rowClassName={(u) => (u.isActive ? undefined : "text-muted-foreground")}
        caption={`Users, ${users.length} of ${total}`}
        emptyState={
          filtered ? (
            <EmptyState
              title={params.q ? `No results for “${params.q}”` : "No users match these filters"}
              action={
                <Button variant="outline" asChild>
                  <Link href="/settings/users">Clear filters</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Users}
              title="No users yet"
              description="Invite your planners, supervisors and viewers to give them access to this plant."
              action={<InviteUserDialog />}
            />
          )
        }
      />
      <Pagination page={page} pageSize={25} total={total} makeHref={(p) => userListHref(params, { page: p })} />
    </div>
  );
}
