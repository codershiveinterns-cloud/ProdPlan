/**
 * Email/password authentication (docs/M1_SPEC.md §3).
 *
 * - emails normalised (trim + lower-case);
 * - `bcrypt.compare` ALWAYS runs (against DUMMY_HASH when the email is unknown) so timing does not reveal
 *   whether an account exists;
 * - the error message is always "Invalid email or password" (plus a rate-limit hint when limited);
 * - success updates `lastLoginAt` and writes a LOGIN AuditLog row (via `audit()`) in the same scoped transaction.
 */
import { prisma, tenantDb } from "@/lib/db";
import { audit } from "@/lib/audit";
import { DUMMY_HASH, normalizeEmail, verifyPassword } from "@/lib/auth/password";
import { tenantSelect, type SessionTenant } from "@/lib/auth/session";
import { userSelect, type UserDTO } from "@/lib/auth/user-dto";
import { hit, loginEmailKey, loginIpKey, RATE_LIMITS, tooManyAttemptsMessage } from "@/lib/rate-limit";

export const INVALID_CREDENTIALS_MESSAGE = "Invalid email or password";

export type LoginContext = { ip: string; userAgent?: string | null };

export type LoginOutcome =
  | { ok: true; user: UserDTO; tenant: SessionTenant; tokenVersion: number }
  | { ok: false; error: string; limited: boolean };

export async function authenticate(
  input: { email: string; password: string },
  ctx: LoginContext,
): Promise<LoginOutcome> {
  const email = normalizeEmail(input.email);

  const [byIp, byEmail] = await Promise.all([
    hit(loginIpKey(ctx.ip), RATE_LIMITS.loginIp.limit, RATE_LIMITS.loginIp.windowSec),
    hit(loginEmailKey(email), RATE_LIMITS.loginEmail.limit, RATE_LIMITS.loginEmail.windowSec),
  ]);
  const limited = byIp.limited ? byIp : byEmail.limited ? byEmail : null;
  if (limited) {
    return { ok: false, error: `${INVALID_CREDENTIALS_MESSAGE}. ${tooManyAttemptsMessage(limited)}`, limited: true };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { ...userSelect, passwordHash: true, tokenVersion: true, tenant: { select: tenantSelect } },
  });

  const valid = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid || !user.isActive) {
    return { ok: false, error: INVALID_CREDENTIALS_MESSAGE, limited: false };
  }

  const now = new Date();
  const db = tenantDb(user.tenantId);
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: now }, select: { id: true } });
    await audit(
      tx,
      {
        actor: { id: user.id, email: user.email, name: user.name, tenantId: user.tenantId },
        ip: ctx.ip,
        userAgent: ctx.userAgent ?? null,
      },
      {
        entityType: "User",
        entityId: user.id,
        entityLabel: user.email,
        action: "LOGIN",
        summary: `${user.name} signed in`,
      },
    );
  });

  const { passwordHash: _passwordHash, tokenVersion, tenant, ...rest } = user;
  void _passwordHash;
  const dto: UserDTO = { ...rest, lastLoginAt: now };
  return { ok: true, user: dto, tenant, tokenVersion };
}
