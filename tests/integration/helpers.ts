/**
 * Shared fixtures for integration tests (run against TEST_DATABASE_URL — tests/setup.ts points DATABASE_URL at it).
 * Uses the raw client on purpose (tests/** may): fixtures must be able to create tenants and cross-tenant data.
 */
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Shift, ShiftCalendar, Tenant, User } from "@/generated/prisma/client";
import { prisma, tenantDb, type TenantDb } from "@/lib/db";

let availability: Promise<boolean> | undefined;

/**
 * True when the test database is configured and reachable. Logs one warning and returns false otherwise, so test
 * files can `describe.skipIf(!(await dbAvailable()))` instead of failing on a developer machine without Postgres.
 */
export function dbAvailable(): Promise<boolean> {
  availability ??= (async () => {
    if (!process.env.TEST_DATABASE_URL) {
      console.warn("[integration] TEST_DATABASE_URL is not set — skipping integration tests");
      return false;
    }
    try {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message.split("\n")[0] : String(err);
      console.warn(`[integration] test database is unreachable — skipping integration tests (${message})`);
      return false;
    }
  })();
  return availability;
}

export type TenantFixture = {
  tenant: Tenant;
  admin: User;
  calendar: ShiftCalendar;
  shift: Shift;
  /** Scoped client for this tenant. */
  db: TenantDb;
  /** Plain-text password of the admin user. */
  password: string;
};

export type CreateTenantFixtureOptions = {
  /** Prefix for the unique slug (a-z0-9-). The fixture appends a timestamp + random suffix. */
  slugPrefix: string;
  timezone?: string;
  password?: string;
  adminEmail?: string;
};

/**
 * Creates tenant + ADMIN user + default "General shift" calendar with one "Day" shift, and sets
 * Tenant.defaultCalendarId — the same shape signup produces (docs/M1_SPEC.md §2). Clean up with deleteTenant().
 */
export async function createTenantFixture(options: CreateTenantFixtureOptions): Promise<TenantFixture> {
  const suffix = `${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
  const slug = `${options.slugPrefix}-${suffix}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const password = options.password ?? "Password123!";
  const passwordHash = await bcrypt.hash(password, 4); // low cost: tests only

  const created = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: { name: `${options.slugPrefix} ${suffix}`, slug, timezone: options.timezone ?? "Asia/Kolkata" },
    });
    const admin = await tx.user.create({
      data: {
        tenantId: tenant.id,
        email: (options.adminEmail ?? `admin@${slug}.test`).toLowerCase(),
        name: "Test Admin",
        passwordHash,
        role: "ADMIN",
      },
    });
    const calendar = await tx.shiftCalendar.create({ data: { tenantId: tenant.id, name: "General shift" } });
    const shift = await tx.shift.create({
      data: {
        tenantId: tenant.id,
        calendarId: calendar.id,
        name: "Day",
        startTime: "09:00",
        endTime: "17:00",
        daysOfWeek: [1, 2, 3, 4, 5, 6],
        breakMinutes: 60,
      },
    });
    const withDefault = await tx.tenant.update({ where: { id: tenant.id }, data: { defaultCalendarId: calendar.id } });
    return { tenant: withDefault, admin, calendar, shift };
  });

  return { ...created, db: tenantDb(created.tenant.id), password };
}

/** Deletes a tenant and, via the FK cascades, everything it owns. Safe to call twice. */
export async function deleteTenant(id: string | undefined): Promise<void> {
  if (!id) return;
  await prisma.tenant.deleteMany({ where: { id } });
}

/** Closes the shared raw client's pool (call from afterAll of the last test in a file). */
export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}
