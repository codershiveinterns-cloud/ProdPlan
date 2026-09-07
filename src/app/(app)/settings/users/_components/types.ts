import type { Role } from "@/generated/prisma/enums";

/** Plain, pre-formatted row for the users table and its dialogs (Server Component formats dates). */
export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  /** "05 Sep 2026, 14:30" in the tenant timezone, or "Never". */
  lastLoginLabel: string;
  createdLabel: string;
  /** The signed-in admin's own row. */
  isSelf: boolean;
};
