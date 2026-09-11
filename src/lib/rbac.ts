/**
 * Role-based access control matrix — the single source of truth (docs/M1_SPEC.md §3).
 * Server actions and pages call `requirePermission(permission)` (src/lib/auth/guards.ts), which uses `can()`.
 * UI code may call `can()` to hide controls, but the server check is the authority.
 */
import type { Role } from "@/generated/prisma/enums";

export const PERMISSIONS = [
  "dashboard:read",
  "orders:read",
  "orders:write",
  "orders:status",
  "orders:cancel",
  "customers:read",
  "customers:write",
  "products:read",
  "products:write",
  "materials:read",
  "materials:write",
  "stock:move",
  "stock:adjust",
  "machines:read",
  "machines:write",
  "downtime:write",
  "users:manage",
  "tenant:manage",
  "audit:read-all",
  "profile:self",
  "schedule:read",
  "schedule:run",
  "schedule:move",
  "operations:status",
  "notifications:read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const READ_ALL: Permission[] = [
  "dashboard:read",
  "orders:read",
  "customers:read",
  "products:read",
  "materials:read",
  "machines:read",
  "profile:self",
  "schedule:read",
  "notifications:read",
];

const MATRIX: Record<Role, ReadonlySet<Permission>> = {
  ADMIN: new Set<Permission>(PERMISSIONS),
  PLANNER: new Set<Permission>([
    ...READ_ALL,
    "orders:write",
    "orders:status",
    "orders:cancel",
    "customers:write",
    "products:write",
    "materials:write",
    "stock:move",
    "stock:adjust",
    "machines:write",
    "downtime:write",
    "schedule:run",
    "schedule:move",
    "operations:status",
  ]),
  SUPERVISOR: new Set<Permission>([...READ_ALL, "orders:status", "stock:move", "downtime:write", "operations:status"]),
  VIEWER: new Set<Permission>(READ_ALL),
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role].has(permission);
}

export function permissionsFor(role: Role): Permission[] {
  return PERMISSIONS.filter((p) => MATRIX[role].has(p));
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  PLANNER: "Planner",
  SUPERVISOR: "Supervisor",
  VIEWER: "Viewer",
};
