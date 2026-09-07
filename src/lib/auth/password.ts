/**
 * Password policy, email normalisation and bcrypt helpers (docs/M1_SPEC.md §3).
 *
 * bcrypt cost 12 (~250–400 ms on an M-series laptop) — only ever called from Server Actions / Route Handlers,
 * never from `src/proxy.ts`.
 */
import bcrypt from "bcryptjs";
import { z } from "zod";

export const BCRYPT_COST = 12;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

/**
 * A real cost-12 bcrypt hash of a random throw-away string. Login compares the submitted password against it when
 * the email is unknown so that response timing does not reveal whether an account exists.
 */
export const DUMMY_HASH = "$2b$12$5rPsjgC5tA0efrm4WvTHNupXDq1sGvNUTArxjhVFETdm36AZlZi8K";

export const passwordSchema = z
  .string({ error: "Enter a password" })
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`)
  .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters`);

/** Trims, lower-cases, then validates as an email (≤ 254 chars). Output is the normalised address. */
export const emailSchema = z
  .string({ error: "Enter your email address" })
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address").max(254, "Email is too long"));

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Cross-field rule: the password must not equal the (normalised) email. Use inside `.refine()`/`.check()`. */
export function passwordDiffersFromEmail(data: { email: string; password: string }): boolean {
  return normalizeEmail(data.password) !== normalizeEmail(data.email);
}

export const PASSWORD_EQUALS_EMAIL_MESSAGE = "Password must not be the same as your email";

/** Options for `.refine(passwordDiffersFromEmail, passwordNotEmailRefineOptions)` on schemas with email + password. */
export const passwordNotEmailRefineOptions = { path: ["password"], message: PASSWORD_EQUALS_EMAIL_MESSAGE };

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}
