/**
 * Integration: user management (docs/M1_SPEC.md §3 "Users", "Last-admin guard") against prodplan_test.
 * Skips with a clear message when TEST_DATABASE_URL is unreachable.
 */
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuditCtx } from "@/lib/audit";
import { EmailTakenError } from "@/lib/auth/signup";
import { prisma } from "@/lib/db";
import { LastAdminError, PasswordEqualsEmailError, SelfDeactivationError, SelfPasswordResetError } from "@/lib/users/errors";
import { listUsers, parseUserListParams, userListHref, USER_LIST_DEFAULTS } from "@/lib/users/list";
import { editUser, inviteUser, resetUserPassword, setUserActive, type Actor } from "@/lib/users/manage";
import { generateTemporaryPassword, TEMPORARY_PASSWORD_LENGTH } from "@/lib/users/temporary-password";
import { createTenantFixture, dbAvailable, deleteTenant, disconnectDb, type TenantFixture } from "./helpers";

const available = await dbAvailable();
const run = Date.now().toString(36);

function actorOf(user: { id: string; email: string; name: string; tenantId: string; role: Actor["role"] }): Actor {
  return { id: user.id, email: user.email, name: user.name, tenantId: user.tenantId, role: user.role };
}

function ctxFor(actor: Actor): AuditCtx {
  return { actor, ip: "203.0.113.9", userAgent: "vitest" };
}

async function tokenVersionOf(userId: string): Promise<number> {
  const row = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { tokenVersion: true } });
  return row.tokenVersion;
}

async function passwordMatches(userId: string, password: string): Promise<boolean> {
  const row = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
  return bcrypt.compare(password, row.passwordHash);
}

describe.skipIf(!available)("user management (integration)", () => {
  let T: TenantFixture;
  let admin: Actor;
  let ctx: AuditCtx;

  beforeAll(async () => {
    T = await createTenantFixture({ slugPrefix: `um-${run}` });
    admin = actorOf(T.admin);
    ctx = ctxFor(admin);
  });

  afterAll(async () => {
    await deleteTenant(T?.tenant.id);
    await disconnectDb();
  });

  it("generates readable temporary passwords inside the policy", () => {
    const pw = generateTemporaryPassword();
    expect(pw).toHaveLength(TEMPORARY_PASSWORD_LENGTH);
    expect(pw).toMatch(/^[A-HJ-NP-Za-km-z2-9]{4}(-[A-HJ-NP-Za-km-z2-9]{4}){2}$/);
    expect(generateTemporaryPassword()).not.toBe(pw);
  });

  it("invite creates a user with mustChangePassword=true, normalised email and a hashed temporary password", async () => {
    const email = `Planner.${run}@UM.test`;
    const { user, temporaryPassword } = await inviteUser(T.db, admin, ctx, {
      name: "Ravi Planner",
      email: email.toLowerCase(),
      role: "PLANNER",
      temporaryPassword: "TempPass123",
    });
    expect(temporaryPassword).toBe("TempPass123");
    expect(user).toMatchObject({
      tenantId: T.tenant.id,
      email: email.toLowerCase(),
      name: "Ravi Planner",
      role: "PLANNER",
      isActive: true,
      mustChangePassword: true,
      lastLoginAt: null,
    });
    expect("passwordHash" in user).toBe(false);
    expect("tokenVersion" in user).toBe(false);
    expect(await passwordMatches(user.id, "TempPass123")).toBe(true);

    const rows = await prisma.auditLog.findMany({ where: { tenantId: T.tenant.id, entityType: "User", entityId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "CREATE", actorUserId: admin.id, entityLabel: user.email, ip: "203.0.113.9" });
    expect(rows[0]!.summary).toContain("Planner");
    const after = JSON.stringify(rows[0]!.after);
    expect(after).not.toContain("TempPass123");
    expect(after).not.toMatch(/passwordHash|\$2b\$|tokenVersion/);
    expect(rows[0]!.after).toEqual({ email: user.email, name: "Ravi Planner", role: "PLANNER", isActive: true });
  });

  it("invite generates a temporary password when none is given and rejects a password equal to the email", async () => {
    const email = `viewer.${run}@um.test`;
    const { user, temporaryPassword } = await inviteUser(T.db, admin, ctx, { name: "Vina Viewer", email, role: "VIEWER" });
    expect(temporaryPassword).toHaveLength(TEMPORARY_PASSWORD_LENGTH);
    expect(user.mustChangePassword).toBe(true);
    expect(await passwordMatches(user.id, temporaryPassword)).toBe(true);

    await expect(
      inviteUser(T.db, admin, ctx, { name: "X", email: `same.${run}@um.test`, role: "VIEWER", temporaryPassword: `Same.${run}@um.test` }),
    ).rejects.toBeInstanceOf(PasswordEqualsEmailError);
  });

  it("invite for an existing email (even in another tenant) fails with EmailTakenError and leaves nothing behind", async () => {
    const other = await createTenantFixture({ slugPrefix: `um-other-${run}` });
    try {
      const before = await prisma.user.count({ where: { tenantId: T.tenant.id } });
      await expect(
        inviteUser(T.db, admin, ctx, { name: "Dup", email: other.admin.email.toUpperCase().toLowerCase(), role: "VIEWER" }),
      ).rejects.toBeInstanceOf(EmailTakenError);
      await expect(
        inviteUser(T.db, admin, ctx, { name: "Dup", email: T.admin.email, role: "VIEWER" }),
      ).rejects.toBeInstanceOf(EmailTakenError);
      expect(await prisma.user.count({ where: { tenantId: T.tenant.id } })).toBe(before);
    } finally {
      await deleteTenant(other.tenant.id);
    }
  });

  it("the last-admin guard blocks demoting or deactivating the only active admin (self-changes included)", async () => {
    await expect(editUser(T.db, admin, ctx, { userId: admin.id, name: T.admin.name, role: "PLANNER" })).rejects.toBeInstanceOf(
      LastAdminError,
    );
    const still = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
    expect(still.role).toBe("ADMIN");
    expect(still.tokenVersion).toBe(0); // rolled back, no bump

    // A second admin can deactivate the first, but then cannot demote themselves.
    const { user: admin2 } = await inviteUser(T.db, admin, ctx, { name: "Second Admin", email: `admin2.${run}@um.test`, role: "ADMIN" });
    const actor2 = actorOf(admin2);
    await setUserActive(T.db, actor2, ctxFor(actor2), { userId: admin.id, isActive: false });
    await expect(editUser(T.db, actor2, ctxFor(actor2), { userId: admin2.id, name: admin2.name, role: "VIEWER" })).rejects.toBeInstanceOf(
      LastAdminError,
    );
    await expect(setUserActive(T.db, actor2, ctxFor(actor2), { userId: admin2.id, isActive: false })).rejects.toBeInstanceOf(
      SelfDeactivationError,
    );
    // Restore: reactivate the original admin.
    await setUserActive(T.db, actor2, ctxFor(actor2), { userId: admin.id, isActive: true });
    expect(await prisma.user.count({ where: { tenantId: T.tenant.id, role: "ADMIN", isActive: true } })).toBe(2);
  });

  it("parallel demotions of the two admins: exactly one succeeds", async () => {
    const P = await createTenantFixture({ slugPrefix: `um-race-${run}` });
    try {
      const a = actorOf(P.admin);
      const { user: b } = await inviteUser(P.db, a, ctxFor(a), { name: "Admin B", email: `adminb.${run}@um.test`, role: "ADMIN" });
      const bActor = actorOf(b);

      const results = await Promise.allSettled([
        editUser(P.db, a, ctxFor(a), { userId: b.id, name: b.name, role: "PLANNER" }),
        editUser(P.db, bActor, ctxFor(bActor), { userId: a.id, name: a.name, role: "PLANNER" }),
      ]);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]!.reason).toBeInstanceOf(LastAdminError);

      const admins = await prisma.user.findMany({ where: { tenantId: P.tenant.id, role: "ADMIN", isActive: true } });
      expect(admins).toHaveLength(1);
      const demoted = await prisma.user.findMany({ where: { tenantId: P.tenant.id, role: "PLANNER" } });
      expect(demoted).toHaveLength(1);
      expect(demoted[0]!.tokenVersion).toBe(1);
      expect(admins[0]!.tokenVersion).toBe(0);
    } finally {
      await deleteTenant(P.tenant.id);
    }
  });

  it("edit: a role change bumps tokenVersion, a rename alone does not; both are audited", async () => {
    const { user } = await inviteUser(T.db, admin, ctx, { name: "Sam Super", email: `super.${run}@um.test`, role: "SUPERVISOR" });
    const renamed = await editUser(T.db, admin, ctx, { userId: user.id, name: "Samir Super", role: "SUPERVISOR" });
    expect(renamed.name).toBe("Samir Super");
    expect(await tokenVersionOf(user.id)).toBe(0);

    const promoted = await editUser(T.db, admin, ctx, { userId: user.id, name: "Samir Super", role: "PLANNER" });
    expect(promoted.role).toBe("PLANNER");
    expect(await tokenVersionOf(user.id)).toBe(1);

    const unchanged = await editUser(T.db, admin, ctx, { userId: user.id, name: "Samir Super", role: "PLANNER" });
    expect(unchanged.role).toBe("PLANNER");
    expect(await tokenVersionOf(user.id)).toBe(1);

    const rows = await prisma.auditLog.findMany({
      where: { tenantId: T.tenant.id, entityType: "User", entityId: user.id, action: "UPDATE" },
      orderBy: { createdAt: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]!.changedFields).toEqual(["name"]);
    expect(rows[1]!.changedFields).toEqual(["role"]);
    expect(rows[1]!.summary).toContain("Supervisor to Planner");
  });

  it("deactivate / reactivate bump tokenVersion each time and are idempotent", async () => {
    const { user } = await inviteUser(T.db, admin, ctx, { name: "Dee Active", email: `dee.${run}@um.test`, role: "VIEWER" });
    expect(await tokenVersionOf(user.id)).toBe(0);

    const off = await setUserActive(T.db, admin, ctx, { userId: user.id, isActive: false });
    expect(off.isActive).toBe(false);
    expect(await tokenVersionOf(user.id)).toBe(1);

    const again = await setUserActive(T.db, admin, ctx, { userId: user.id, isActive: false });
    expect(again.isActive).toBe(false);
    expect(await tokenVersionOf(user.id)).toBe(1); // no-op, no bump

    const on = await setUserActive(T.db, admin, ctx, { userId: user.id, isActive: true });
    expect(on.isActive).toBe(true);
    expect(await tokenVersionOf(user.id)).toBe(2);

    const rows = await prisma.auditLog.findMany({
      where: { tenantId: T.tenant.id, entityType: "User", entityId: user.id, action: "UPDATE" },
      orderBy: { createdAt: "asc" },
    });
    expect(rows.map((r) => r.summary)).toEqual([
      `Deactivated user Dee Active (${user.email})`,
      `Reactivated user Dee Active (${user.email})`,
    ]);
    expect(rows.every((r) => r.changedFields.includes("isActive"))).toBe(true);
  });

  it("reset password sets a new temporary password, mustChangePassword=true and bumps tokenVersion; never for self", async () => {
    const { user } = await inviteUser(T.db, admin, ctx, { name: "Rita Reset", email: `rita.${run}@um.test`, role: "VIEWER", temporaryPassword: "FirstPass1" });
    await prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: false } });

    const { user: after, temporaryPassword } = await resetUserPassword(T.db, admin, ctx, { userId: user.id });
    expect(after.mustChangePassword).toBe(true);
    expect(temporaryPassword).toHaveLength(TEMPORARY_PASSWORD_LENGTH);
    expect(await passwordMatches(user.id, temporaryPassword)).toBe(true);
    expect(await passwordMatches(user.id, "FirstPass1")).toBe(false);
    expect(await tokenVersionOf(user.id)).toBe(1);

    const rows = await prisma.auditLog.findMany({ where: { tenantId: T.tenant.id, entityType: "User", entityId: user.id, action: "UPDATE" } });
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0])).not.toContain(temporaryPassword);
    // Only the (redacted) credentials changed, so the diff is empty; the summary carries the meaning.
    expect(rows[0]!.changedFields).toEqual([]);
    expect(rows[0]!.summary).toBe(`Reset the password of Rita Reset (${user.email})`);

    await expect(resetUserPassword(T.db, admin, ctx, { userId: admin.id })).rejects.toBeInstanceOf(SelfPasswordResetError);
  });

  it("listUsers honours q / role / includeInactive / sort / pagination and never leaks credentials", async () => {
    const all = await listUsers(T.db, USER_LIST_DEFAULTS);
    expect(all.total).toBeGreaterThanOrEqual(5);
    expect(all.rows.every((u) => u.isActive)).toBe(true);
    expect(all.rows.every((u) => !("passwordHash" in u) && !("tokenVersion" in u))).toBe(true);
    const names = all.rows.map((u) => u.name);
    expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);

    const { user: inactive } = await inviteUser(T.db, admin, ctx, { name: "Zed Inactive", email: `zed.${run}@um.test`, role: "VIEWER" });
    await setUserActive(T.db, admin, ctx, { userId: inactive.id, isActive: false });
    const activeOnly = await listUsers(T.db, USER_LIST_DEFAULTS);
    expect(activeOnly.rows.some((u) => u.id === inactive.id)).toBe(false);
    const withInactive = await listUsers(T.db, { ...USER_LIST_DEFAULTS, includeInactive: true });
    expect(withInactive.rows.some((u) => u.id === inactive.id)).toBe(true);

    const planners = await listUsers(T.db, { ...USER_LIST_DEFAULTS, role: "PLANNER" });
    expect(planners.rows.length).toBeGreaterThan(0);
    expect(planners.rows.every((u) => u.role === "PLANNER")).toBe(true);

    const search = await listUsers(T.db, { ...USER_LIST_DEFAULTS, q: "RAVI" });
    expect(search.rows.map((u) => u.name)).toEqual(["Ravi Planner"]);

    const byLogin = await listUsers(T.db, { ...USER_LIST_DEFAULTS, sort: "lastLoginAt", dir: "desc" });
    expect(byLogin.rows.length).toBe(all.total);

    const page2 = await listUsers(T.db, { ...USER_LIST_DEFAULTS, page: 99 });
    expect(page2.page).toBe(1); // clamped to the last page
    expect(page2.rows.length).toBe(all.total);

    // URL contract helpers
    const params = parseUserListParams({ q: " ravi ", page: "2", sort: "lastLoginAt", dir: "desc", includeInactive: "1", role: "planner" });
    expect(params).toEqual({ q: "ravi", page: 2, sort: "lastLoginAt", dir: "desc", includeInactive: true, role: "PLANNER" });
    expect(parseUserListParams({ page: "x", sort: "nope", dir: "sideways", role: "OWNER" })).toEqual(USER_LIST_DEFAULTS);
    expect(userListHref(USER_LIST_DEFAULTS)).toBe("/settings/users");
    expect(userListHref(params, { page: 1 })).toBe("/settings/users?q=ravi&role=PLANNER&includeInactive=1&sort=lastLoginAt&dir=desc");
  });
});
