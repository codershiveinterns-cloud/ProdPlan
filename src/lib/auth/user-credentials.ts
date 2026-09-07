/**
 * User credential primitives (docs/M1_SPEC.md §3).
 *
 * The password-hash column may only be read or written inside `src/lib/auth/**` (ESLint + tests/unit/lint-rules).
 * Invite / reset-password (src/lib/users/manage.ts) and the profile "change password" flow (src/lib/users/profile.ts)
 * therefore delegate the credential statements to this module. Every function takes the tenant-scoped client or
 * transaction, so the credential write, the `tokenVersion` bump and the audit row commit together. bcrypt hashing
 * (~300 ms) is done by the CALLER before the transaction so the tenant row lock is held as briefly as possible.
 * Nothing here ever returns the hash: results are `userSelect` DTOs.
 */
import type { Role } from "@/generated/prisma/enums";
import type { TenantDb, TenantTx } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { userSelect, type UserDTO } from "@/lib/auth/user-dto";

export type CreateUserRecordInput = {
  tenantId: string;
  /** Already normalised (trim + lower-case). */
  email: string;
  name: string;
  role: Role;
  /** bcrypt hash produced with `hashPassword()`. */
  hash: string;
  mustChangePassword: boolean;
};

/** Inserts a user with the given bcrypt hash. Throws Prisma P2002 on a duplicate email (platform-wide unique). */
export async function createUserRecord(tx: TenantTx, input: CreateUserRecordInput): Promise<UserDTO> {
  return tx.user.create({
    data: {
      tenantId: input.tenantId,
      email: input.email,
      name: input.name,
      role: input.role,
      passwordHash: input.hash,
      mustChangePassword: input.mustChangePassword,
    },
    select: userSelect,
  });
}

export type ReplacePasswordInput = {
  /** bcrypt hash produced with `hashPassword()`. */
  hash: string;
  /** true for admin resets (temporary password), false when the user chose the password themselves. */
  mustChangePassword: boolean;
};

/**
 * Replaces the user's password and bumps `tokenVersion`, which revokes every existing session of that user
 * (the caller re-issues the actor's own cookie when the actor changed their own password).
 */
export async function replacePassword(tx: TenantTx, userId: string, input: ReplacePasswordInput): Promise<UserDTO> {
  return tx.user.update({
    where: { id: userId },
    data: {
      passwordHash: input.hash,
      mustChangePassword: input.mustChangePassword,
      tokenVersion: { increment: 1 },
    },
    select: userSelect,
  });
}

/** True when `password` matches the user's current hash; false for unknown users or a wrong password. */
export async function verifyUserPassword(db: TenantDb | TenantTx, userId: string, password: string): Promise<boolean> {
  const row = await db.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!row) return false;
  return verifyPassword(password, row.passwordHash);
}
