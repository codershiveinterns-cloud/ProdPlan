/**
 * Profile self-service (docs/M1_SPEC.md §3 "profile:self", §6.8): own name, own password, "Sign out everywhere".
 * Each mutation bumps the actor's own `tokenVersion`; the Server Action then calls `reissueSessionFor()` so the
 * actor's current cookie stays valid while every other session is revoked.
 */
import { audit, type AuditCtx } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/password";
import { replacePassword, verifyUserPassword } from "@/lib/auth/user-credentials";
import { userSelect, type UserDTO } from "@/lib/auth/user-dto";
import type { TenantDb } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { passwordEqualsEmail } from "@/lib/validation/auth";
import type { ChangePasswordInput, ProfileNameInput } from "@/lib/validation/auth";
import { CurrentPasswordError, PasswordEqualsEmailError } from "./errors";
import { userAuditSnapshot, type Actor } from "./manage";

/**
 * Verifies the current password, stores the new one (min 8, max 72, ≠ email — the schema enforces the length),
 * clears `mustChangePassword` and bumps `tokenVersion`.
 */
export async function changeOwnPassword(
  db: TenantDb,
  actor: Actor,
  ctx: AuditCtx,
  input: ChangePasswordInput,
): Promise<UserDTO> {
  if (passwordEqualsEmail(input.newPassword, actor.email)) throw new PasswordEqualsEmailError();
  const valid = await verifyUserPassword(db, actor.id, input.currentPassword);
  if (!valid) throw new CurrentPasswordError();
  const hash = await hashPassword(input.newPassword);

  return db.$transaction(async (tx) => {
    const before = await tx.user.findUnique({ where: { id: actor.id }, select: userSelect });
    if (!before) throw new NotFoundError("User not found.");
    const after = await replacePassword(tx, actor.id, { hash, mustChangePassword: false });
    await audit(tx, ctx, {
      entityType: "User",
      entityId: after.id,
      entityLabel: after.email,
      action: "UPDATE",
      before: userAuditSnapshot(before),
      after: userAuditSnapshot(after),
      summary: `${after.name} changed their password`,
    });
    return after;
  });
}

/** Renames the actor and bumps their `tokenVersion` (spec: own name change re-issues the cookie). */
export async function updateOwnName(db: TenantDb, actor: Actor, ctx: AuditCtx, input: ProfileNameInput): Promise<UserDTO> {
  return db.$transaction(async (tx) => {
    const before = await tx.user.findUnique({ where: { id: actor.id }, select: userSelect });
    if (!before) throw new NotFoundError("User not found.");
    if (before.name === input.name) return before;
    const after = await tx.user.update({
      where: { id: actor.id },
      data: { name: input.name, tokenVersion: { increment: 1 } },
      select: userSelect,
    });
    await audit(tx, ctx, {
      entityType: "User",
      entityId: after.id,
      entityLabel: after.email,
      action: "UPDATE",
      before: userAuditSnapshot(before),
      after: userAuditSnapshot(after),
      summary: `${before.name} renamed themselves to ${after.name}`,
    });
    return after;
  });
}

/** Bumps the actor's `tokenVersion` so every session except the re-issued current one is revoked. */
export async function signOutEverywhere(db: TenantDb, actor: Actor, ctx: AuditCtx): Promise<UserDTO> {
  return db.$transaction(async (tx) => {
    const after = await tx.user.update({
      where: { id: actor.id },
      data: { tokenVersion: { increment: 1 } },
      select: userSelect,
    });
    await audit(tx, ctx, {
      entityType: "User",
      entityId: after.id,
      entityLabel: after.email,
      action: "UPDATE",
      summary: `${after.name} signed out of all other sessions`,
    });
    return after;
  });
}
