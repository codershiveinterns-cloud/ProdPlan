/**
 * Unit: demo plant constants (docs/M1_SPEC.md §6.9) — role → email mapping, demo-email detection, rate-limit key and
 * the demo-tenant permission lock in guards.ts.
 */
import { describe, expect, it } from "vitest";
import { canInTenant, DEMO_LOCKED_PERMISSIONS, DEMO_TENANT_SLUG, isDemoTenant } from "@/lib/auth/guards";
import {
  DEMO_EMAIL_DOMAIN,
  DEMO_ROLES,
  DEMO_SLUG,
  DEMO_RATE_LIMIT,
  DEMO_USERS,
  demoIpKey,
  demoUserForRole,
  isDemoEmail,
  isDemoRole,
} from "@/lib/demo/demo-plant";
import { PERMISSIONS } from "@/lib/rbac";

describe("demo plant constants (spec §6.9)", () => {
  it("maps every role to <role>@demo.prodplan.app with a display name", () => {
    expect(DEMO_SLUG).toBe("demo");
    expect(DEMO_TENANT_SLUG).toBe("demo");
    expect(DEMO_EMAIL_DOMAIN).toBe("demo.prodplan.app");
    expect([...DEMO_ROLES]).toEqual(["ADMIN", "PLANNER", "SUPERVISOR", "VIEWER"]);
    for (const role of DEMO_ROLES) {
      const spec = demoUserForRole(role);
      expect(spec).toBe(DEMO_USERS[role]);
      expect(spec.email).toBe(`${role.toLowerCase()}@demo.prodplan.app`);
      expect(spec.name.trim().length).toBeGreaterThan(0);
    }
    const emails = DEMO_ROLES.map((r) => DEMO_USERS[r].email);
    expect(new Set(emails).size).toBe(4);
  });

  it("recognises demo addresses case-insensitively and ignores look-alikes", () => {
    expect(isDemoEmail("admin@demo.prodplan.app")).toBe(true);
    expect(isDemoEmail("  Viewer@DEMO.ProdPlan.App ")).toBe(true);
    expect(isDemoEmail("admin@acme.test")).toBe(false);
    expect(isDemoEmail("demo.prodplan.app@example.com")).toBe(false);
    expect(isDemoEmail("admin@notdemo.prodplan.app")).toBe(false);
  });

  it("validates roles and builds the demo:ip:<ip> rate-limit key (30 / 60 min)", () => {
    expect(isDemoRole("ADMIN")).toBe(true);
    expect(isDemoRole("OWNER")).toBe(false);
    expect(isDemoRole(undefined)).toBe(false);
    expect(demoIpKey("203.0.113.9")).toBe("demo:ip:203.0.113.9");
    expect(DEMO_RATE_LIMIT).toEqual({ limit: 30, windowSec: 3600 });
  });

  it("locks users:manage and tenant:manage inside the demo tenant only", () => {
    const demo = { slug: "demo" };
    const real = { slug: "acme" };
    expect(isDemoTenant(demo)).toBe(true);
    expect(isDemoTenant(real)).toBe(false);
    expect([...DEMO_LOCKED_PERMISSIONS].sort()).toEqual(["tenant:manage", "users:manage"]);
    expect(canInTenant("ADMIN", demo, "users:manage")).toBe(false);
    expect(canInTenant("ADMIN", demo, "tenant:manage")).toBe(false);
    expect(canInTenant("ADMIN", real, "users:manage")).toBe(true);
    // Everything else is untouched for every role.
    for (const permission of PERMISSIONS) {
      if (DEMO_LOCKED_PERMISSIONS.has(permission)) continue;
      for (const role of DEMO_ROLES) {
        expect(canInTenant(role, demo, permission)).toBe(canInTenant(role, real, permission));
      }
    }
  });
});
