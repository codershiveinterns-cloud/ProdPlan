/**
 * Integration: login + session resolution (docs/M1_SPEC.md §3, §8 "revoked-session redirect") against prodplan_test.
 * Skips with a clear message when TEST_DATABASE_URL is unreachable.
 */
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
process.env.DATABASE_URL = TEST_URL;
process.env.APP_URL ??= "http://localhost:3000";

const { prisma } = await import("@/lib/db");
const { signupTenant } = await import("@/lib/auth/signup");
const { authenticate, INVALID_CREDENTIALS_MESSAGE } = await import("@/lib/auth/login");
const { resolveSession } = await import("@/lib/auth/session");
const { signSessionToken, verifySessionToken } = await import("@/lib/auth/jwt");
const { resetBucket, loginEmailKey, loginIpKey } = await import("@/lib/rate-limit");

async function dbReachable(): Promise<boolean> {
  if (!TEST_URL) return false;
  const client = new Client({ connectionString: TEST_URL, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    await client.query("select 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

const reachable = await dbReachable();
if (!reachable) {
  console.warn(`[auth-login] skipping: TEST_DATABASE_URL (${TEST_URL ?? "unset"}) is unreachable`);
}

const run = Date.now().toString(36);
const email = `login+${run}@lg.test`;
const password = "Password123!";
const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
let tenantId = "";
let userId = "";

describe.skipIf(!reachable)("authenticate + resolveSession", () => {
  beforeAll(async () => {
    const res = await signupTenant({ company: `Lg ${run}`, timezone: "Asia/Kolkata", name: "Ravi", email, password }, {});
    tenantId = res.tenant.id;
    userId = res.user.id;
  });

  afterAll(async () => {
    if (tenantId) await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await resetBucket(loginIpKey(ip));
    await resetBucket(loginEmailKey(email));
    await resetBucket(loginEmailKey(`nobody+${run}@lg.test`));
    await prisma.$disconnect();
  });

  it("returns the generic message for unknown emails and wrong passwords", async () => {
    const unknown = await authenticate({ email: `nobody+${run}@lg.test`, password }, { ip });
    expect(unknown).toEqual({ ok: false, error: INVALID_CREDENTIALS_MESSAGE, limited: false });
    const wrong = await authenticate({ email, password: "Password123?" }, { ip });
    expect(wrong).toEqual({ ok: false, error: INVALID_CREDENTIALS_MESSAGE, limited: false });
    expect(await prisma.auditLog.count({ where: { tenantId, action: "LOGIN" } })).toBe(0);
  });

  it("signs in with a differently-cased/spaced email, sets lastLoginAt and writes a LOGIN audit row", async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(before.lastLoginAt).toBeNull();

    const outcome = await authenticate({ email: `  ${email.toUpperCase()} `, password }, { ip, userAgent: "vitest-agent" });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.user.id).toBe(userId);
    expect(outcome.user.lastLoginAt).toBeInstanceOf(Date);
    expect(outcome.tenant).toMatchObject({ id: tenantId, timezone: "Asia/Kolkata" });
    expect(outcome.tokenVersion).toBe(0);
    expect("passwordHash" in outcome.user).toBe(false);
    expect("tokenVersion" in outcome.user).toBe(false);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.lastLoginAt).not.toBeNull();

    const rows = await prisma.auditLog.findMany({ where: { tenantId, action: "LOGIN" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      entityType: "User",
      entityId: userId,
      actorUserId: userId,
      actorEmail: email,
      ip,
      userAgent: "vitest-agent",
    });
    expect(rows[0]!.summary).toMatch(/signed in/);
  });

  it("resolves a fresh token to an ok session and reports 'revoked' after a tokenVersion bump", async () => {
    const token = await signSessionToken({ userId, tenantId, role: "ADMIN", tokenVersion: 0 });
    const claims = await verifySessionToken(token);
    expect(claims).not.toBeNull();

    const ok = await resolveSession(claims);
    expect(ok?.status).toBe("ok");
    if (ok?.status !== "ok") return;
    expect(ok.user.id).toBe(userId);
    expect(ok.tenant.id).toBe(tenantId);
    expect("passwordHash" in ok.user).toBe(false);
    expect("tokenVersion" in ok.user).toBe(false);

    await prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
    expect(await resolveSession(claims)).toEqual({ status: "revoked" });

    const fresh = await verifySessionToken(await signSessionToken({ userId, tenantId, role: "ADMIN", tokenVersion: 1 }));
    expect((await resolveSession(fresh))?.status).toBe("ok");
  });

  it("reports 'revoked' for deactivated users, tenant mismatches and deleted users", async () => {
    const claims = await verifySessionToken(await signSessionToken({ userId, tenantId, role: "ADMIN", tokenVersion: 1 }));

    await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
    expect(await resolveSession(claims)).toEqual({ status: "revoked" });
    const inactiveLogin = await authenticate({ email, password }, { ip });
    expect(inactiveLogin).toEqual({ ok: false, error: INVALID_CREDENTIALS_MESSAGE, limited: false });
    await prisma.user.update({ where: { id: userId }, data: { isActive: true } });

    const mismatch = await verifySessionToken(
      await signSessionToken({ userId, tenantId: "some-other-tenant", role: "ADMIN", tokenVersion: 1 }),
    );
    expect(await resolveSession(mismatch)).toEqual({ status: "revoked" });

    const ghost = await verifySessionToken(
      await signSessionToken({ userId: "does-not-exist", tenantId, role: "ADMIN", tokenVersion: 0 }),
    );
    expect(await resolveSession(ghost)).toEqual({ status: "revoked" });

    expect(await resolveSession(null)).toBeNull();
  });
});
