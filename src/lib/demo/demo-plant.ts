/**
 * The shared demo plant (docs/M1_SPEC.md §6.9).
 *
 *  - `ensureDemoPlant()` creates tenant `demo` ("Acme Precision Works", Asia/Kolkata) with its "General shift"
 *    calendar and four demo users (random, unguessable bcrypt passwords), then loads the §7 `acme` dataset through
 *    `seedDemoData()` — exactly what prisma/seed.ts does, minus the public password. Idempotent and safe under
 *    concurrent demo sign-ins: creation runs under a lock row in `RateLimitBucket` (the platform-level table every
 *    serverless instance shares) and a plant only counts as ready once the seed's `DemoData` audit row exists.
 *  - `resetDemoPlantIfStale(maxAgeHours)` deletes the tenant (FK cascades remove everything, including the users,
 *    so every visitor's session becomes `revoked`) and recreates it when `Tenant.createdAt` is older.
 *  - `demoSignIn(role)` resolves the demo user for a role and writes the LOGIN audit row; the Server Action in
 *    src/app/(auth)/actions.ts then issues the cookie.
 *
 * This module lives beside the auth layer and is allowed to use the raw client (spec §6.9): creating and deleting a
 * tenant by slug is impossible through `tenantDb()`. NOTE for eslint.config.mjs / tests/unit/lint-rules.test.ts:
 * add "src/lib/demo/demo-plant.ts" to RAW_PRISMA_ALLOWED.
 */
import { randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit";
import { DEMO_TENANT_SLUG } from "@/lib/auth/guards";
import { hashPassword } from "@/lib/auth/password";
import { tenantSelect, type SessionTenant } from "@/lib/auth/session";
import { DEFAULT_CALENDAR_NAME, DEFAULT_SHIFT } from "@/lib/auth/signup";
import { createUserRecord } from "@/lib/auth/user-credentials";
import { userSelect, type UserDTO } from "@/lib/auth/user-dto";
import { prisma, tenantDb, type TenantTx } from "@/lib/db";
import { logger } from "@/lib/logger";
import { hit, type RateLimitResult } from "@/lib/rate-limit";
import { DEMO_DATA_ENTITY_TYPE, seedDemoData } from "@/lib/demo/seed-tenant";

export const DEMO_SLUG = DEMO_TENANT_SLUG;
export const DEMO_TENANT_NAME = "Acme Precision Works";
export const DEMO_TIMEZONE = "Asia/Kolkata";
export const DEMO_EMAIL_DOMAIN = "demo.prodplan.app";
export const DEMO_VARIANT = "acme" as const;

export const DEMO_ROLES: readonly Role[] = ["ADMIN", "PLANNER", "SUPERVISOR", "VIEWER"];

export type DemoUserSpec = { email: string; name: string };

/** role → demo account. Emails are `<role>@demo.prodplan.app`; the names match the §7 acme dataset. */
export const DEMO_USERS: Readonly<Record<Role, DemoUserSpec>> = {
  ADMIN: { email: `admin@${DEMO_EMAIL_DOMAIN}`, name: "Priya Sharma" },
  PLANNER: { email: `planner@${DEMO_EMAIL_DOMAIN}`, name: "Arjun Mehta" },
  SUPERVISOR: { email: `supervisor@${DEMO_EMAIL_DOMAIN}`, name: "Ravi Kulkarni" },
  VIEWER: { email: `viewer@${DEMO_EMAIL_DOMAIN}`, name: "Neha Iyer" },
};

/** Shown when someone tries to sign up / sign in with a demo address by password. */
export const DEMO_EMAIL_REJECTED_MESSAGE = "Use the demo buttons on the sign-in page";

/** `demo:ip:<ip>` — 30 demo sign-ins per hour per network (spec §6.9). */
export const DEMO_RATE_LIMIT = { limit: 30, windowSec: 60 * 60 } as const;

export const DEMO_MAX_AGE_HOURS = 24;

const LOCK_KEY = "demo:plant:lock";
const LOCK_TTL_MS = 3 * 60 * 1000;
const LOCK_POLL_MS = 250;
const LOCK_WAIT_MS = 90 * 1000;
const DEMO_USER_AGENT = "prodplan/demo-plant";

export function isDemoRole(value: unknown): value is Role {
  return typeof value === "string" && (DEMO_ROLES as readonly string[]).includes(value);
}

export function demoUserForRole(role: Role): DemoUserSpec {
  return DEMO_USERS[role];
}

/** True for any address on the demo domain (after trim + lower-case). */
export function isDemoEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${DEMO_EMAIL_DOMAIN}`);
}

export function demoIpKey(ip: string): string {
  return `demo:ip:${ip}`;
}

export async function checkDemoRateLimit(ip: string, now: Date = new Date()): Promise<RateLimitResult> {
  return hit(demoIpKey(ip), DEMO_RATE_LIMIT.limit, DEMO_RATE_LIMIT.windowSec, now);
}

export type DemoPlant = SessionTenant & { createdAt: Date };

const demoTenantSelect = { ...tenantSelect, createdAt: true } as const;

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002";
}

/** 32-character random password (never stored in plain text, never shown — demo users only sign in via the buttons). */
function randomPassword(): string {
  return randomBytes(24).toString("base64url").slice(0, 32);
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

// ---------------------------------------------------------------------------------------------------------------
// Lock (RateLimitBucket row as a cross-instance mutex)
// ---------------------------------------------------------------------------------------------------------------

async function acquireLock(): Promise<void> {
  const started = Date.now();
  for (;;) {
    const now = new Date();
    try {
      await prisma.rateLimitBucket.create({ data: { key: LOCK_KEY, count: 1, resetAt: new Date(now.getTime() + LOCK_TTL_MS) } });
      return;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
    // Someone else holds it. Take over a lock whose holder died (resetAt in the past).
    const stale = await prisma.rateLimitBucket.deleteMany({ where: { key: LOCK_KEY, resetAt: { lt: now } } });
    if (stale.count > 0) continue;
    if (Date.now() - started > LOCK_WAIT_MS) throw new Error("demo plant: timed out waiting for the setup lock");
    await new Promise((resolve) => setTimeout(resolve, LOCK_POLL_MS));
  }
}

async function releaseLock(): Promise<void> {
  await prisma.rateLimitBucket.deleteMany({ where: { key: LOCK_KEY } }).catch(() => undefined);
}

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  await acquireLock();
  try {
    return await fn();
  } finally {
    await releaseLock();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------------------------------------------

async function findDemoTenant(): Promise<DemoPlant | null> {
  return prisma.tenant.findUnique({ where: { slug: DEMO_SLUG }, select: demoTenantSelect });
}

/**
 * The plant is "ready" once the seed's final IMPORT row exists (it is written inside the seed transaction, so a
 * half-created plant never passes). A tenant with slug `demo` that does not own the demo admin address is NOT the
 * demo plant (someone signed up with that slug) — we refuse to touch it.
 */
async function demoPlantState(): Promise<{ tenant: DemoPlant | null; ready: boolean }> {
  const tenant = await findDemoTenant();
  if (!tenant) return { tenant: null, ready: false };
  const [admin, seeded] = await Promise.all([
    prisma.user.findUnique({ where: { email: DEMO_USERS.ADMIN.email }, select: userSelect }),
    prisma.auditLog.count({ where: { tenantId: tenant.id, entityType: DEMO_DATA_ENTITY_TYPE, action: "IMPORT" } }),
  ]);
  if (admin?.tenantId !== tenant.id) {
    throw new Error(`demo plant: tenant slug "${DEMO_SLUG}" belongs to a non-demo workspace; refusing to use or reset it`);
  }
  return { tenant, ready: seeded > 0 };
}

// ---------------------------------------------------------------------------------------------------------------
// Create / delete
// ---------------------------------------------------------------------------------------------------------------

async function createDemoPlant(now: Date): Promise<DemoPlant> {
  // Four independent random passwords, hashed in parallel (bcrypt cost 12, ~300 ms each).
  const hashes = await Promise.all(DEMO_ROLES.map(() => hashPassword(randomPassword())));

  const { tenant, admin } = await prisma.$transaction(async (tx) => {
    const created = await tx.tenant.create({
      data: { name: DEMO_TENANT_NAME, slug: DEMO_SLUG, timezone: DEMO_TIMEZONE },
      select: { id: true },
    });
    const users: UserDTO[] = [];
    for (const [index, role] of DEMO_ROLES.entries()) {
      const spec = DEMO_USERS[role];
      // createUserRecord() is the auth layer's credential primitive (the hash column is only written there). It
      // sets tenantId explicitly, so the raw transaction client is a valid stand-in for a scoped one here.
      users.push(
        await createUserRecord(tx as unknown as TenantTx, {
          tenantId: created.id,
          email: spec.email,
          name: spec.name,
          role,
          hash: hashes[index]!,
          mustChangePassword: false,
        }),
      );
    }
    const calendar = await tx.shiftCalendar.create({
      data: { tenantId: created.id, name: DEFAULT_CALENDAR_NAME },
      select: { id: true, name: true, isActive: true },
    });
    const shift = await tx.shift.create({
      data: {
        tenantId: created.id,
        calendarId: calendar.id,
        name: DEFAULT_SHIFT.name,
        startTime: DEFAULT_SHIFT.startTime,
        endTime: DEFAULT_SHIFT.endTime,
        daysOfWeek: [...DEFAULT_SHIFT.daysOfWeek],
        breakMinutes: DEFAULT_SHIFT.breakMinutes,
      },
      select: { name: true, startTime: true, endTime: true, daysOfWeek: true, breakMinutes: true },
    });
    const tenant = await tx.tenant.update({
      where: { id: created.id },
      data: { defaultCalendarId: calendar.id },
      select: demoTenantSelect,
    });

    const admin = users[0]!;
    const actor = { actorUserId: admin.id, actorEmail: admin.email, actorName: admin.name, ip: null, userAgent: DEMO_USER_AGENT };
    await tx.auditLog.createMany({
      data: [
        {
          tenantId: tenant.id,
          ...actor,
          entityType: "Tenant",
          entityId: tenant.id,
          entityLabel: tenant.name,
          action: "CREATE",
          summary: `Created demo plant ${tenant.name}`,
          changedFields: ["name", "slug", "timezone", "defaultCalendarId"],
          after: toJson({ name: tenant.name, slug: tenant.slug, timezone: tenant.timezone, defaultCalendarId: calendar.id }),
        },
        ...users.map((u) => ({
          tenantId: tenant.id,
          ...actor,
          entityType: "User",
          entityId: u.id,
          entityLabel: u.email,
          action: "CREATE" as const,
          summary: `Created demo user ${u.name} (${u.email}) as ${u.role.charAt(0) + u.role.slice(1).toLowerCase()}`,
          changedFields: ["email", "name", "role", "isActive"],
          after: toJson({ email: u.email, name: u.name, role: u.role, isActive: u.isActive }),
        })),
        {
          tenantId: tenant.id,
          ...actor,
          entityType: "ShiftCalendar",
          entityId: calendar.id,
          entityLabel: calendar.name,
          action: "CREATE",
          summary: `Created shift calendar ${calendar.name} (default)`,
          changedFields: ["name", "isActive", "shifts"],
          after: toJson({ name: calendar.name, isActive: calendar.isActive, shifts: [shift] }),
        },
      ],
    });
    return { tenant, admin };
  });

  await seedDemoData(tenantDb(tenant.id), tenant, admin, { variant: DEMO_VARIANT, now, userAgent: DEMO_USER_AGENT });
  logger.info("demo plant created", { tenantId: tenant.id });
  return (await findDemoTenant()) ?? tenant;
}

async function deleteDemoTenant(id: string): Promise<void> {
  await prisma.tenant.deleteMany({ where: { id, slug: DEMO_SLUG } });
}

// ---------------------------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------------------------

/**
 * Returns the demo plant, creating and seeding it when missing. Concurrent callers wait for the lock and then
 * find the finished plant. A tenant that exists but never finished seeding (crash mid-way) is replaced.
 */
export async function ensureDemoPlant(now: Date = new Date()): Promise<DemoPlant> {
  const fast = await demoPlantState();
  if (fast.tenant && fast.ready) return fast.tenant;

  return withLock(async () => {
    const state = await demoPlantState();
    if (state.tenant && state.ready) return state.tenant;
    if (state.tenant) {
      logger.warn("demo plant: found an unfinished copy, recreating", { tenantId: state.tenant.id });
      await deleteDemoTenant(state.tenant.id);
    }
    return createDemoPlant(now);
  });
}

/** Deletes the current copy (cascade) and seeds a fresh one. Every visitor's session in the old copy is revoked. */
export async function resetDemoPlant(now: Date = new Date()): Promise<DemoPlant> {
  return withLock(async () => {
    const state = await demoPlantState();
    if (state.tenant) await deleteDemoTenant(state.tenant.id);
    return createDemoPlant(now);
  });
}

export function isDemoPlantStale(tenant: Pick<DemoPlant, "createdAt">, maxAgeHours: number, now: Date = new Date()): boolean {
  return now.getTime() - tenant.createdAt.getTime() > maxAgeHours * 60 * 60 * 1000;
}

/**
 * Opportunistic daily reset (called at the start of every demo sign-in): recreates the plant when it is older than
 * `maxAgeHours`. Returns whether a reset happened. Does nothing when the plant does not exist yet.
 */
export async function resetDemoPlantIfStale(
  maxAgeHours: number = DEMO_MAX_AGE_HOURS,
  now: Date = new Date(),
): Promise<{ reset: boolean; tenant: DemoPlant | null }> {
  const { tenant } = await demoPlantState();
  if (!tenant || !isDemoPlantStale(tenant, maxAgeHours, now)) return { reset: false, tenant };

  const fresh = await withLock(async () => {
    const state = await demoPlantState();
    if (!state.tenant) return null;
    if (!isDemoPlantStale(state.tenant, maxAgeHours, now)) return state.tenant; // someone reset it meanwhile
    await deleteDemoTenant(state.tenant.id);
    return createDemoPlant(now);
  });
  return { reset: fresh !== null && fresh.id !== tenant.id, tenant: fresh };
}

export type DemoSignInContext = { ip?: string | null; userAgent?: string | null };

export type DemoSignInResult = { user: UserDTO; tenant: SessionTenant };

/**
 * Resolves the demo user for `role` in the (ready) demo plant, updates `lastLoginAt` and writes the LOGIN audit
 * row "Demo sign-in (<role>)". The caller issues the session cookie (`reissueSessionFor`).
 */
export async function demoSignIn(role: Role, ctx: DemoSignInContext = {}, now: Date = new Date()): Promise<DemoSignInResult> {
  const tenant = await ensureDemoPlant(now);
  const spec = DEMO_USERS[role];
  const db = tenantDb(tenant.id);
  const user = await db.user.findUnique({ where: { email: spec.email }, select: userSelect });
  if (!user || !user.isActive) {
    throw new Error(`demo plant: demo user ${spec.email} is missing or inactive`);
  }
  const updated = await db.$transaction(async (tx) => {
    const row = await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: now }, select: userSelect });
    await audit(
      tx,
      { actor: { id: user.id, email: user.email, name: user.name, tenantId: user.tenantId }, ip: ctx.ip ?? null, userAgent: ctx.userAgent ?? null },
      { entityType: "User", entityId: user.id, entityLabel: user.email, action: "LOGIN", summary: `Demo sign-in (${role})` },
    );
    return row;
  });
  const { createdAt: _createdAt, ...sessionTenant } = tenant;
  void _createdAt;
  return { user: updated, tenant: sessionTenant };
}
