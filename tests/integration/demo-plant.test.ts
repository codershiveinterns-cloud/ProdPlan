/**
 * Integration: the shared demo plant (docs/M1_SPEC.md §6.9) against prodplan_test.
 *  - the first demo sign-in creates + seeds tenant `demo` with four users and writes "Demo sign-in (<role>)";
 *  - later calls reuse it (also under concurrency);
 *  - a plant older than 24 h is replaced and sessions issued for the old copy resolve to `revoked`;
 *  - the demo:ip rate limit allows 30 sign-ins per hour;
 *  - password login for a demo address fails.
 * Uses the global slug `demo`, so it removes whatever demo plant exists in the test database before and after.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/auth/login";
import { resolveSession } from "@/lib/auth/session";
import { signSessionToken, verifySessionToken } from "@/lib/auth/jwt";
import { loginEmailKey, loginIpKey, resetBucket } from "@/lib/rate-limit";
import { DEMO_DATA_ENTITY_TYPE } from "@/lib/demo/seed-tenant";
import {
  checkDemoRateLimit,
  DEMO_RATE_LIMIT,
  DEMO_SLUG,
  DEMO_TENANT_NAME,
  DEMO_USERS,
  demoIpKey,
  demoSignIn,
  ensureDemoPlant,
  isDemoEmail,
  resetDemoPlantIfStale,
} from "@/lib/demo/demo-plant";
import { dbAvailable, disconnectDb } from "./helpers";

const available = await dbAvailable();
const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
const CREATE_TIMEOUT = 60_000;

async function removeDemoPlant(): Promise<void> {
  await prisma.tenant.deleteMany({ where: { slug: DEMO_SLUG } });
  await prisma.rateLimitBucket.deleteMany({ where: { key: "demo:plant:lock" } });
}

describe.skipIf(!available)("demo plant (integration)", () => {
  let firstTenantId = "";

  beforeAll(async () => {
    await removeDemoPlant();
  });

  afterAll(async () => {
    await removeDemoPlant();
    await resetBucket(demoIpKey(ip));
    await resetBucket(loginIpKey(ip));
    await resetBucket(loginEmailKey(DEMO_USERS.ADMIN.email));
    await disconnectDb();
  });

  it(
    "first demo sign-in creates and seeds the plant and writes the LOGIN audit row",
    async () => {
      const result = await demoSignIn("ADMIN", { ip, userAgent: "vitest" });
      firstTenantId = result.tenant.id;
      expect(result.tenant).toMatchObject({ slug: DEMO_SLUG, name: DEMO_TENANT_NAME, timezone: "Asia/Kolkata" });
      expect(result.user).toMatchObject({ email: DEMO_USERS.ADMIN.email, role: "ADMIN", mustChangePassword: false });
      expect(result.user.lastLoginAt).toBeInstanceOf(Date);
      expect("passwordHash" in result.user).toBe(false);

      const users = await prisma.user.findMany({ where: { tenantId: firstTenantId }, orderBy: { email: "asc" } });
      expect(users.map((u) => [u.email, u.role, u.mustChangePassword, u.isActive])).toEqual([
        [DEMO_USERS.ADMIN.email, "ADMIN", false, true],
        [DEMO_USERS.PLANNER.email, "PLANNER", false, true],
        [DEMO_USERS.SUPERVISOR.email, "SUPERVISOR", false, true],
        [DEMO_USERS.VIEWER.email, "VIEWER", false, true],
      ]);
      // Random 32-char passwords hashed with bcrypt; none of them is the public seed password.
      for (const u of users) expect(u.passwordHash).toMatch(/^\$2[aby]\$12\$/);

      const [orders, products, machines, seeded] = await Promise.all([
        prisma.order.count({ where: { tenantId: firstTenantId } }),
        prisma.product.count({ where: { tenantId: firstTenantId } }),
        prisma.machine.count({ where: { tenantId: firstTenantId } }),
        prisma.auditLog.count({ where: { tenantId: firstTenantId, entityType: DEMO_DATA_ENTITY_TYPE, action: "IMPORT" } }),
      ]);
      expect(orders).toBe(24);
      expect(products).toBe(5);
      expect(machines).toBe(6);
      expect(seeded).toBe(1);

      const logins = await prisma.auditLog.findMany({ where: { tenantId: firstTenantId, action: "LOGIN" } });
      expect(logins).toHaveLength(1);
      expect(logins[0]).toMatchObject({
        entityType: "User",
        entityId: result.user.id,
        actorEmail: DEMO_USERS.ADMIN.email,
        summary: "Demo sign-in (ADMIN)",
        ip,
        userAgent: "vitest",
      });
    },
    CREATE_TIMEOUT,
  );

  it("second sign-in reuses the existing plant (no second tenant, no re-seed)", async () => {
    const again = await ensureDemoPlant();
    expect(again.id).toBe(firstTenantId);

    const viewer = await demoSignIn("VIEWER", { ip });
    expect(viewer.tenant.id).toBe(firstTenantId);
    expect(viewer.user).toMatchObject({ email: DEMO_USERS.VIEWER.email, role: "VIEWER" });

    expect(await prisma.tenant.count({ where: { slug: DEMO_SLUG } })).toBe(1);
    expect(await prisma.order.count({ where: { tenantId: firstTenantId } })).toBe(24);
    const summaries = await prisma.auditLog.findMany({ where: { tenantId: firstTenantId, action: "LOGIN" }, select: { summary: true } });
    expect(summaries.map((r) => r.summary).sort()).toEqual(["Demo sign-in (ADMIN)", "Demo sign-in (VIEWER)"]);
  });

  it(
    "a stale plant is replaced and sessions issued for the old copy become revoked",
    async () => {
      const oldAdmin = await prisma.user.findUniqueOrThrow({ where: { email: DEMO_USERS.ADMIN.email } });
      const oldClaims = await verifySessionToken(
        await signSessionToken({ userId: oldAdmin.id, tenantId: firstTenantId, role: "ADMIN", tokenVersion: oldAdmin.tokenVersion }),
      );
      expect((await resolveSession(oldClaims))?.status).toBe("ok");

      // Fresh plant: nothing happens.
      expect((await resetDemoPlantIfStale()).reset).toBe(false);

      // Age the copy by 25 hours.
      await prisma.tenant.update({ where: { id: firstTenantId }, data: { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) } });
      const outcome = await resetDemoPlantIfStale(24);
      expect(outcome.reset).toBe(true);
      expect(outcome.tenant?.id).toBeDefined();
      expect(outcome.tenant?.id).not.toBe(firstTenantId);

      expect(await prisma.tenant.findUnique({ where: { id: firstTenantId } })).toBeNull();
      expect(await resolveSession(oldClaims)).toEqual({ status: "revoked" });

      const fresh = await ensureDemoPlant();
      expect(fresh.id).toBe(outcome.tenant!.id);
      expect(await prisma.order.count({ where: { tenantId: fresh.id } })).toBe(24);
      const newAdmin = await prisma.user.findUniqueOrThrow({ where: { email: DEMO_USERS.ADMIN.email } });
      expect(newAdmin.tenantId).toBe(fresh.id);
      expect(newAdmin.id).not.toBe(oldAdmin.id);
    },
    CREATE_TIMEOUT,
  );

  it(
    "concurrent callers converge on one plant",
    async () => {
      await removeDemoPlant();
      const plants = await Promise.all([ensureDemoPlant(), ensureDemoPlant(), ensureDemoPlant()]);
      expect(new Set(plants.map((p) => p.id)).size).toBe(1);
      expect(await prisma.tenant.count({ where: { slug: DEMO_SLUG } })).toBe(1);
      expect(await prisma.user.count({ where: { tenantId: plants[0]!.id } })).toBe(4);
      expect(await prisma.rateLimitBucket.count({ where: { key: "demo:plant:lock" } })).toBe(0);
    },
    CREATE_TIMEOUT,
  );

  it("rate-limits demo sign-ins per network at 30 per hour", async () => {
    await resetBucket(demoIpKey(ip));
    for (let i = 1; i <= DEMO_RATE_LIMIT.limit; i++) {
      const r = await checkDemoRateLimit(ip);
      expect(r.limited).toBe(false);
    }
    const over = await checkDemoRateLimit(ip);
    expect(over.limited).toBe(true);
    expect(over.retryAfterMinutes).toBeGreaterThan(0);
  });

  it("password login for a demo address fails", async () => {
    expect(isDemoEmail(DEMO_USERS.ADMIN.email)).toBe(true);
    const outcome = await authenticate({ email: DEMO_USERS.ADMIN.email, password: "Password123!" }, { ip });
    expect(outcome.ok).toBe(false);
  });
});
