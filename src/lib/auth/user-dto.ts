/**
 * The only shape of a User that leaves `src/lib/auth/**` (docs/M1_SPEC.md §3).
 * `passwordHash` and `tokenVersion` are never selected outside this directory; every `user.find*` elsewhere
 * MUST pass `select: userSelect`.
 */
import type { Prisma } from "@/generated/prisma/client";

export const userSelect = {
  id: true,
  tenantId: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.UserSelect;

export type UserDTO = Prisma.UserGetPayload<{ select: typeof userSelect }>;

/** Serialisable variant (Dates as ISO strings) for client components. */
export type PlainUserDTO = Omit<UserDTO, "lastLoginAt" | "createdAt" | "updatedAt"> & {
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Narrow any user-like row to the DTO (drops passwordHash / tokenVersion / relations). */
export function toUserDTO(u: UserDTO & Record<string, unknown>): UserDTO {
  return {
    id: u.id,
    tenantId: u.tenantId,
    email: u.email,
    name: u.name,
    role: u.role,
    isActive: u.isActive,
    mustChangePassword: u.mustChangePassword,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}
