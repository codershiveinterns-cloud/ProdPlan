/**
 * User management (docs/M1_SPEC.md §3 "Users"): invite, edit name/role, reset password, deactivate/reactivate.
 *
 * Rules implemented here:
 *  - every mutation runs in ONE scoped transaction: tenant row lock → change → last-admin assertion → audit row;
 *  - invite and reset set `mustChangePassword = true`; the temporary password is returned to the caller exactly once
 *    and is never persisted or audited (audit snapshots are `userSelect` DTO subsets; `audit()` also redacts);
 *  - any change to ANOTHER user's role / password / isActive bumps that user's `tokenVersion` (revokes sessions);
 *    a role change of the actor themselves bumps too — the action re-issues the actor's cookie afterwards;
 *  - an admin cannot deactivate themselves or reset their own password from this page (Profile covers the latter);
 *  - existing emails (in any tenant) surface as `EmailTakenError` ("An account with this email already exists").
 */
import { uniqueViolationFields } from "@/lib/action";
import { audit, type AuditCtx } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/password";
import { EmailTakenError } from "@/lib/auth/signup";
import { createUserRecord, replacePassword } from "@/lib/auth/user-credentials";
import { userSelect, type UserDTO } from "@/lib/auth/user-dto";
import type { TenantDb } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { ROLE_LABELS } from "@/lib/rbac";
import { passwordEqualsEmail } from "@/lib/validation/auth";
import type { EditUserInput, InviteUserInput, ResetPasswordInput, SetUserActiveInput } from "@/lib/validation/users";
import { PasswordEqualsEmailError, SelfDeactivationError, SelfPasswordResetError } from "./errors";
import { assertAdminRemains, lockTenantRow } from "./last-admin";
import { generateTemporaryPassword } from "./temporary-password";

/** The acting user — `session.user` satisfies this. */
export type Actor = Pick<UserDTO, "id" | "email" | "name" | "tenantId" | "role">;

/**
 * DTO subset stored in AuditLog.before/after for User rows (no dates, never credentials). `mustChangePassword`
 * is left out on purpose: `audit()` redacts every key matching /password/i, so it could never survive anyway —
 * the row's `summary` says when a password was reset or changed.
 */
export function userAuditSnapshot(user: UserDTO) {
  return { email: user.email, name: user.name, role: user.role, isActive: user.isActive };
}

export type InviteResult = { user: UserDTO; temporaryPassword: string };

export async function inviteUser(db: TenantDb, actor: Actor, ctx: AuditCtx, input: InviteUserInput): Promise<InviteResult> {
  const temporaryPassword = input.temporaryPassword ?? generateTemporaryPassword();
  if (passwordEqualsEmail(temporaryPassword, input.email)) throw new PasswordEqualsEmailError();
  const hash = await hashPassword(temporaryPassword);

  const user = await db.$transaction(async (tx) => {
    await lockTenantRow(tx, actor.tenantId);
    let created: UserDTO;
    try {
      created = await createUserRecord(tx, {
        tenantId: actor.tenantId,
        email: input.email,
        name: input.name,
        role: input.role,
        hash,
        mustChangePassword: true,
      });
    } catch (err) {
      if (uniqueViolationFields(err).includes("email")) throw new EmailTakenError();
      throw err;
    }
    await assertAdminRemains(tx);
    await audit(tx, ctx, {
      entityType: "User",
      entityId: created.id,
      entityLabel: created.email,
      action: "CREATE",
      after: userAuditSnapshot(created),
      summary: `Invited ${created.name} (${created.email}) as ${ROLE_LABELS[created.role]}`,
    });
    return created;
  });

  return { user, temporaryPassword };
}

export async function editUser(db: TenantDb, actor: Actor, ctx: AuditCtx, input: EditUserInput): Promise<UserDTO> {
  return db.$transaction(async (tx) => {
    await lockTenantRow(tx, actor.tenantId);
    const before = await tx.user.findUnique({ where: { id: input.userId }, select: userSelect });
    if (!before) throw new NotFoundError("User not found.");

    const roleChanged = before.role !== input.role;
    const nameChanged = before.name !== input.name;
    if (!roleChanged && !nameChanged) return before;

    const after = await tx.user.update({
      where: { id: before.id },
      data: {
        name: input.name,
        role: input.role,
        // A role change invalidates the sessions carrying the old role hint.
        ...(roleChanged ? { tokenVersion: { increment: 1 } } : {}),
      },
      select: userSelect,
    });
    await assertAdminRemains(tx);
    await audit(tx, ctx, {
      entityType: "User",
      entityId: after.id,
      entityLabel: after.email,
      action: "UPDATE",
      before: userAuditSnapshot(before),
      after: userAuditSnapshot(after),
      summary: roleChanged
        ? `Changed ${after.name} (${after.email}) from ${ROLE_LABELS[before.role]} to ${ROLE_LABELS[after.role]}`
        : `Renamed user ${before.name} to ${after.name} (${after.email})`,
    });
    return after;
  });
}

export type ResetPasswordResult = { user: UserDTO; temporaryPassword: string };

export async function resetUserPassword(
  db: TenantDb,
  actor: Actor,
  ctx: AuditCtx,
  input: ResetPasswordInput,
): Promise<ResetPasswordResult> {
  if (input.userId === actor.id) throw new SelfPasswordResetError();
  const target = await db.user.findUnique({ where: { id: input.userId }, select: userSelect });
  if (!target) throw new NotFoundError("User not found.");

  const temporaryPassword = input.temporaryPassword ?? generateTemporaryPassword();
  if (passwordEqualsEmail(temporaryPassword, target.email)) throw new PasswordEqualsEmailError();
  const hash = await hashPassword(temporaryPassword);

  const user = await db.$transaction(async (tx) => {
    await lockTenantRow(tx, actor.tenantId);
    const before = await tx.user.findUnique({ where: { id: input.userId }, select: userSelect });
    if (!before) throw new NotFoundError("User not found.");
    const after = await replacePassword(tx, before.id, { hash, mustChangePassword: true });
    await assertAdminRemains(tx);
    await audit(tx, ctx, {
      entityType: "User",
      entityId: after.id,
      entityLabel: after.email,
      action: "UPDATE",
      before: userAuditSnapshot(before),
      after: userAuditSnapshot(after),
      summary: `Reset the password of ${after.name} (${after.email})`,
    });
    return after;
  });

  return { user, temporaryPassword };
}

export async function setUserActive(db: TenantDb, actor: Actor, ctx: AuditCtx, input: SetUserActiveInput): Promise<UserDTO> {
  if (input.userId === actor.id && !input.isActive) throw new SelfDeactivationError();
  return db.$transaction(async (tx) => {
    await lockTenantRow(tx, actor.tenantId);
    const before = await tx.user.findUnique({ where: { id: input.userId }, select: userSelect });
    if (!before) throw new NotFoundError("User not found.");
    if (before.isActive === input.isActive) return before;

    const after = await tx.user.update({
      where: { id: before.id },
      data: { isActive: input.isActive, tokenVersion: { increment: 1 } },
      select: userSelect,
    });
    await assertAdminRemains(tx);
    await audit(tx, ctx, {
      entityType: "User",
      entityId: after.id,
      entityLabel: after.email,
      action: "UPDATE",
      before: userAuditSnapshot(before),
      after: userAuditSnapshot(after),
      summary: `${after.isActive ? "Reactivated" : "Deactivated"} user ${after.name} (${after.email})`,
    });
    return after;
  });
}
