/**
 * Integration: profile self-service (docs/M1_SPEC.md §3 "profile:self", §6.8) against prodplan_test —
 * own password change (verifies current, clears mustChangePassword, bumps tokenVersion, keeps the re-issued session
 * valid), own name change and "Sign out everywhere".
 */
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuditCtx } from "@/lib/audit";
import { signSessionToken, verifySessionToken } from "@/lib/auth/jwt";
import { currentTokenVersion, resolveSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { CurrentPasswordError, PasswordEqualsEmailError } from "@/lib/users/errors";
import type { Actor } from "@/lib/users/manage";
import { changeOwnPassword, signOutEverywhere, updateOwnName } from "@/lib/users/profile";
import { createTenantFixture, dbAvailable, deleteTenant, disconnectDb, type TenantFixture } from "./helpers";

const available = await dbAvailable();
const run = Date.now().toString(36);

describe.skipIf(!available)("profile self-service (integration)", () => {
  let T: TenantFixture;
  let actor: Actor;
  let ctx: AuditCtx;

  beforeAll(async () => {
    T = await createTenantFixture({ slugPrefix: `pf-${run}`, password: "OldPass123!" });
    actor = { id: T.admin.id, email: T.admin.email, name: T.admin.name, tenantId: T.tenant.id, role: "ADMIN" };
    ctx = { actor, ip: "203.0.113.10", userAgent: "vitest" };
  });

  afterAll(async () => {
    await deleteTenant(T?.tenant.id);
    await disconnectDb();
  });

  it("rejects a wrong current password and a new password equal to the email without touching the user", async () => {
    await expect(
      changeOwnPassword(T.db, actor, ctx, { currentPassword: "WrongPass1!", newPassword: "NewPass456!" }),
    ).rejects.toBeInstanceOf(CurrentPasswordError);
    await expect(
      changeOwnPassword(T.db, actor, ctx, { currentPassword: "OldPass123!", newPassword: actor.email.toUpperCase() }),
    ).rejects.toBeInstanceOf(PasswordEqualsEmailError);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
    expect(row.tokenVersion).toBe(0);
    expect(await bcrypt.compare("OldPass123!", row.passwordHash)).toBe(true);
    expect(await prisma.auditLog.count({ where: { tenantId: T.tenant.id, entityType: "User" } })).toBe(0);
  });

  it("changes the password, clears mustChangePassword, bumps tokenVersion and keeps the re-issued session valid", async () => {
    await prisma.user.update({ where: { id: actor.id }, data: { mustChangePassword: true } });
    const oldClaims = await verifySessionToken(await signSessionToken({ userId: actor.id, tenantId: T.tenant.id, role: "ADMIN", tokenVersion: 0 }));
    expect((await resolveSession(oldClaims))?.status).toBe("ok");

    const after = await changeOwnPassword(T.db, actor, ctx, { currentPassword: "OldPass123!", newPassword: "NewPass456!" });
    expect(after.mustChangePassword).toBe(false);
    expect("passwordHash" in after).toBe(false);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
    expect(row.tokenVersion).toBe(1);
    expect(row.mustChangePassword).toBe(false);
    expect(await bcrypt.compare("NewPass456!", row.passwordHash)).toBe(true);
    expect(await bcrypt.compare("OldPass123!", row.passwordHash)).toBe(false);

    // Every pre-existing session is revoked …
    expect(await resolveSession(oldClaims)).toEqual({ status: "revoked" });
    // … while the cookie the action re-issues (reissueSessionFor → currentTokenVersion) resolves fine.
    const tv = await currentTokenVersion(actor.id);
    expect(tv).toBe(1);
    const fresh = await verifySessionToken(await signSessionToken({ userId: actor.id, tenantId: T.tenant.id, role: "ADMIN", tokenVersion: tv! }));
    const session = await resolveSession(fresh);
    expect(session?.status).toBe("ok");
    if (session?.status === "ok") expect(session.user.mustChangePassword).toBe(false);

    const rows = await prisma.auditLog.findMany({ where: { tenantId: T.tenant.id, entityType: "User", entityId: actor.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "UPDATE", actorUserId: actor.id, changedFields: [] });
    expect(rows[0]!.summary).toContain("changed their password");
    expect(JSON.stringify(rows[0])).not.toMatch(/NewPass456|OldPass123|passwordHash|tokenVersion/);
  });

  it("renames the actor (bumping tokenVersion) and 'Sign out everywhere' bumps it again", async () => {
    const before = await currentTokenVersion(actor.id);
    const renamed = await updateOwnName(T.db, actor, ctx, { name: "Renamed Admin" });
    expect(renamed.name).toBe("Renamed Admin");
    expect(await currentTokenVersion(actor.id)).toBe(before! + 1);

    const same = await updateOwnName(T.db, { ...actor, name: "Renamed Admin" }, ctx, { name: "Renamed Admin" });
    expect(same.name).toBe("Renamed Admin");
    expect(await currentTokenVersion(actor.id)).toBe(before! + 1); // no-op

    await signOutEverywhere(T.db, actor, ctx);
    expect(await currentTokenVersion(actor.id)).toBe(before! + 2);

    const summaries = (
      await prisma.auditLog.findMany({ where: { tenantId: T.tenant.id, entityId: actor.id, action: "UPDATE" }, orderBy: { createdAt: "asc" } })
    ).map((r) => r.summary);
    expect(summaries.at(-2)).toContain("renamed themselves to Renamed Admin");
    expect(summaries.at(-1)).toContain("signed out of all other sessions");
  });
});
