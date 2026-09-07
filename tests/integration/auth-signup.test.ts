/**
 * Integration: signup transaction (docs/M1_SPEC.md §2, §3, §8) against prodplan_test.
 * Skips with a clear message when TEST_DATABASE_URL is unreachable.
 */
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
process.env.DATABASE_URL = TEST_URL;

const { prisma } = await import("@/lib/db");
const { signupTenant, EmailTakenError, DEFAULT_CALENDAR_NAME, DEFAULT_SHIFT } = await import("@/lib/auth/signup");
const { verifyPassword } = await import("@/lib/auth/password");

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
  console.warn(`[auth-signup] skipping: TEST_DATABASE_URL (${TEST_URL ?? "unset"}) is unreachable`);
}

const run = Date.now().toString(36);
const createdTenantIds: string[] = [];

describe.skipIf(!reachable)("signupTenant", () => {
  beforeAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug: { startsWith: `sig-${run}` } } });
  });

  afterAll(async () => {
    if (createdTenantIds.length) await prisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
    await prisma.$disconnect();
  });

  it("creates tenant + admin + General shift calendar + shift + defaultCalendarId in one go", async () => {
    const result = await signupTenant(
      {
        company: `Sig ${run} Precision Works`,
        timezone: "Asia/Kolkata",
        name: "  Priya Sharma ",
        email: `  Priya+${run}@Sig.test `,
        password: "Password123!",
      },
      { ip: "203.0.113.7", userAgent: "vitest" },
    );
    createdTenantIds.push(result.tenant.id);

    expect(result.tenant.slug).toBe(`sig-${run}-precision-works`);
    expect(result.tenant.timezone).toBe("Asia/Kolkata");
    expect(result.tenant.defaultCalendarId).toBe(result.calendarId);
    expect(result.user.email).toBe(`priya+${run}@sig.test`);
    expect(result.user.name).toBe("Priya Sharma");
    expect(result.user.role).toBe("ADMIN");
    expect(result.user.mustChangePassword).toBe(false);
    expect(result.tokenVersion).toBe(0);
    expect("passwordHash" in result.user).toBe(false);

    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { id: result.tenant.id },
      include: { users: true, calendars: { include: { shifts: true } }, auditLogs: true },
    });
    expect(tenant.defaultCalendarId).toBe(tenant.calendars[0]!.id);
    expect(tenant.users).toHaveLength(1);
    expect(await verifyPassword("Password123!", tenant.users[0]!.passwordHash)).toBe(true);
    expect(tenant.calendars).toHaveLength(1);
    expect(tenant.calendars[0]!.name).toBe(DEFAULT_CALENDAR_NAME);
    expect(tenant.calendars[0]!.shifts).toHaveLength(1);
    expect(tenant.calendars[0]!.shifts[0]).toMatchObject({
      name: DEFAULT_SHIFT.name,
      startTime: "09:00",
      endTime: "17:00",
      daysOfWeek: [1, 2, 3, 4, 5, 6],
      breakMinutes: 60,
      tenantId: tenant.id,
    });

    const types = tenant.auditLogs.map((a) => `${a.entityType}:${a.action}`).sort();
    expect(types).toEqual(["ShiftCalendar:CREATE", "Tenant:CREATE", "User:CREATE"]);
    for (const row of tenant.auditLogs) {
      expect(row.actorUserId).toBe(result.user.id);
      expect(row.ip).toBe("203.0.113.7");
      expect(JSON.stringify(row.after ?? {})).not.toMatch(/passwordHash|\$2b\$/);
    }
  });

  it("rejects a duplicate email cleanly and leaves no half-created tenant behind", async () => {
    const email = `dup+${run}@sig.test`;
    const first = await signupTenant(
      { company: `Sig ${run} Dup One`, timezone: "UTC", name: "A", email, password: "Password123!" },
      {},
    );
    createdTenantIds.push(first.tenant.id);
    const before = await prisma.tenant.count();

    await expect(
      signupTenant({ company: `Sig ${run} Dup Two`, timezone: "UTC", name: "B", email: email.toUpperCase(), password: "Password123!" }, {}),
    ).rejects.toBeInstanceOf(EmailTakenError);

    expect(await prisma.tenant.count()).toBe(before);
    expect(await prisma.tenant.findFirst({ where: { slug: `sig-${run}-dup-two` } })).toBeNull();
  });

  it("retries the slug with -2, -3 … when the company name collides", async () => {
    const company = `Sig ${run} Collide`;
    const a = await signupTenant({ company, timezone: "UTC", name: "A", email: `c1+${run}@sig.test`, password: "Password123!" }, {});
    const b = await signupTenant({ company, timezone: "UTC", name: "B", email: `c2+${run}@sig.test`, password: "Password123!" }, {});
    const c = await signupTenant({ company, timezone: "UTC", name: "C", email: `c3+${run}@sig.test`, password: "Password123!" }, {});
    createdTenantIds.push(a.tenant.id, b.tenant.id, c.tenant.id);
    expect(a.tenant.slug).toBe(`sig-${run}-collide`);
    expect(b.tenant.slug).toBe(`sig-${run}-collide-2`);
    expect(c.tenant.slug).toBe(`sig-${run}-collide-3`);
    expect(a.tenant.name).toBe(company);
  });
});
