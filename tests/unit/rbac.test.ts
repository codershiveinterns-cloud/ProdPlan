import { describe, expect, it } from "vitest";
import type { Role } from "@/generated/prisma/enums";
import { PERMISSIONS, ROLE_LABELS, can, permissionsFor, type Permission } from "@/lib/rbac";

const ROLES: Role[] = ["ADMIN", "PLANNER", "SUPERVISOR", "VIEWER"];

/** docs/M1_SPEC.md §3 permission table, row by row. `*:read` is expanded into the concrete read permissions. */
const SPEC_TABLE: Record<Permission, Record<Role, boolean>> = {
  "dashboard:read": { ADMIN: true, PLANNER: true, SUPERVISOR: true, VIEWER: true },
  "orders:read": { ADMIN: true, PLANNER: true, SUPERVISOR: true, VIEWER: true },
  "customers:read": { ADMIN: true, PLANNER: true, SUPERVISOR: true, VIEWER: true },
  "products:read": { ADMIN: true, PLANNER: true, SUPERVISOR: true, VIEWER: true },
  "materials:read": { ADMIN: true, PLANNER: true, SUPERVISOR: true, VIEWER: true },
  "machines:read": { ADMIN: true, PLANNER: true, SUPERVISOR: true, VIEWER: true },
  "orders:write": { ADMIN: true, PLANNER: true, SUPERVISOR: false, VIEWER: false },
  "orders:status": { ADMIN: true, PLANNER: true, SUPERVISOR: true, VIEWER: false },
  "orders:cancel": { ADMIN: true, PLANNER: true, SUPERVISOR: false, VIEWER: false },
  "customers:write": { ADMIN: true, PLANNER: true, SUPERVISOR: false, VIEWER: false },
  "products:write": { ADMIN: true, PLANNER: true, SUPERVISOR: false, VIEWER: false },
  "materials:write": { ADMIN: true, PLANNER: true, SUPERVISOR: false, VIEWER: false },
  "stock:move": { ADMIN: true, PLANNER: true, SUPERVISOR: true, VIEWER: false },
  "stock:adjust": { ADMIN: true, PLANNER: true, SUPERVISOR: false, VIEWER: false },
  "machines:write": { ADMIN: true, PLANNER: true, SUPERVISOR: false, VIEWER: false },
  "downtime:write": { ADMIN: true, PLANNER: true, SUPERVISOR: true, VIEWER: false },
  "users:manage": { ADMIN: true, PLANNER: false, SUPERVISOR: false, VIEWER: false },
  "tenant:manage": { ADMIN: true, PLANNER: false, SUPERVISOR: false, VIEWER: false },
  "audit:read-all": { ADMIN: true, PLANNER: false, SUPERVISOR: false, VIEWER: false },
  "profile:self": { ADMIN: true, PLANNER: true, SUPERVISOR: true, VIEWER: true },
};

describe("RBAC matrix (docs/M1_SPEC.md §3)", () => {
  it("declares exactly the spec permissions", () => {
    expect([...PERMISSIONS].sort()).toEqual(Object.keys(SPEC_TABLE).sort());
  });

  it.each(Object.keys(SPEC_TABLE) as Permission[])("%s matches the spec row", (permission) => {
    for (const role of ROLES) {
      expect(can(role, permission), `${role} ${permission}`).toBe(SPEC_TABLE[permission][role]);
    }
  });

  it("snapshots the full matrix", () => {
    const matrix = Object.fromEntries(ROLES.map((role) => [role, permissionsFor(role)]));
    expect(matrix).toMatchInlineSnapshot(`
      {
        "ADMIN": [
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
        ],
        "PLANNER": [
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
          "profile:self",
        ],
        "SUPERVISOR": [
          "dashboard:read",
          "orders:read",
          "orders:status",
          "customers:read",
          "products:read",
          "materials:read",
          "stock:move",
          "machines:read",
          "downtime:write",
          "profile:self",
        ],
        "VIEWER": [
          "dashboard:read",
          "orders:read",
          "customers:read",
          "products:read",
          "materials:read",
          "machines:read",
          "profile:self",
        ],
      }
    `);
  });

  it("ADMIN has every permission and VIEWER only reads", () => {
    expect(permissionsFor("ADMIN")).toEqual([...PERMISSIONS]);
    expect(permissionsFor("VIEWER").every((p) => p.endsWith(":read") || p === "profile:self")).toBe(true);
  });

  it("labels every role", () => {
    expect(ROLE_LABELS).toEqual({ ADMIN: "Admin", PLANNER: "Planner", SUPERVISOR: "Supervisor", VIEWER: "Viewer" });
  });
});
