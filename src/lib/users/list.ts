/**
 * Users list (docs/M1_SPEC.md §5 "List URL contract"): `q`, `page` (25/page), `sort`, `dir`, plus the module
 * filters `role` and `includeInactive=1`. Server-side filtering, sorting and pagination.
 */
import type { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import { userSelect, type UserDTO } from "@/lib/auth/user-dto";
import type { TenantDb } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/rbac";

export const USER_PAGE_SIZE = 25;
export const USER_SORT_KEYS = ["name", "email", "role", "lastLoginAt", "createdAt"] as const;
export type UserSortKey = (typeof USER_SORT_KEYS)[number];
export type SortDir = "asc" | "desc";

export type UserListParams = {
  q: string;
  page: number;
  sort: UserSortKey;
  dir: SortDir;
  includeInactive: boolean;
  role: Role | null;
};

export const USER_LIST_DEFAULTS: UserListParams = {
  q: "",
  page: 1,
  sort: "name",
  dir: "asc",
  includeInactive: false,
  role: null,
};

export type SearchParamsLike = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function isRole(v: string | undefined): v is Role {
  return v !== undefined && Object.prototype.hasOwnProperty.call(ROLE_LABELS, v);
}

function isSortKey(v: string | undefined): v is UserSortKey {
  return v !== undefined && (USER_SORT_KEYS as readonly string[]).includes(v);
}

export function parseUserListParams(sp: SearchParamsLike): UserListParams {
  const q = (first(sp.q) ?? "").trim().slice(0, 100);
  const pageRaw = Number.parseInt(first(sp.page) ?? "1", 10);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;
  const sortRaw = first(sp.sort);
  const sort = isSortKey(sortRaw) ? sortRaw : USER_LIST_DEFAULTS.sort;
  const dir: SortDir = first(sp.dir) === "desc" ? "desc" : "asc";
  const includeInactive = first(sp.includeInactive) === "1";
  const roleRaw = first(sp.role)?.toUpperCase();
  const role = isRole(roleRaw) ? roleRaw : null;
  return { q, page, sort, dir, includeInactive, role };
}

/** Number of active module filters (search and sort are not filters). */
export function countActiveUserFilters(params: UserListParams): number {
  return (params.includeInactive ? 1 : 0) + (params.role ? 1 : 0);
}

/** `/settings/users?…` with only the non-default parameters. */
export function userListHref(params: UserListParams, patch: Partial<UserListParams> = {}): string {
  const p = { ...params, ...patch };
  const qs = new URLSearchParams();
  if (p.q) qs.set("q", p.q);
  if (p.role) qs.set("role", p.role);
  if (p.includeInactive) qs.set("includeInactive", "1");
  if (p.sort !== USER_LIST_DEFAULTS.sort || p.dir !== USER_LIST_DEFAULTS.dir) {
    qs.set("sort", p.sort);
    qs.set("dir", p.dir);
  }
  if (p.page > 1) qs.set("page", String(p.page));
  const query = qs.toString();
  return query ? `/settings/users?${query}` : "/settings/users";
}

function whereFor(params: UserListParams): Prisma.UserWhereInput {
  const clauses: Prisma.UserWhereInput[] = [];
  if (!params.includeInactive) clauses.push({ isActive: true });
  if (params.role) clauses.push({ role: params.role });
  if (params.q) {
    clauses.push({
      OR: [
        { name: { contains: params.q, mode: "insensitive" } },
        { email: { contains: params.q, mode: "insensitive" } },
      ],
    });
  }
  return clauses.length ? { AND: clauses } : {};
}

function orderByFor(params: UserListParams): Prisma.UserOrderByWithRelationInput[] {
  const tieBreaker: Prisma.UserOrderByWithRelationInput = { name: "asc" };
  switch (params.sort) {
    case "lastLoginAt":
      return [{ lastLoginAt: { sort: params.dir, nulls: "last" } }, tieBreaker];
    case "email":
      return [{ email: params.dir }];
    case "role":
      return [{ role: params.dir }, tieBreaker];
    case "createdAt":
      return [{ createdAt: params.dir }, tieBreaker];
    default:
      return [{ name: params.dir }, { email: "asc" }];
  }
}

export type UserListResult = { rows: UserDTO[]; total: number; page: number; pageSize: number };

export async function listUsers(db: TenantDb, params: UserListParams): Promise<UserListResult> {
  const where = whereFor(params);
  const total = await db.user.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / USER_PAGE_SIZE));
  const page = Math.min(params.page, totalPages);
  const rows = await db.user.findMany({
    where,
    select: userSelect,
    orderBy: orderByFor(params),
    skip: (page - 1) * USER_PAGE_SIZE,
    take: USER_PAGE_SIZE,
  });
  return { rows, total, page, pageSize: USER_PAGE_SIZE };
}
