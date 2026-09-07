/**
 * Session lookup + cookie issuance (docs/M1_SPEC.md §3).
 *
 * `getSession()` is wrapped in `React.cache` so a layout, page and nested components share one DB round trip.
 * Cookie WRITES only happen from Server Actions / Route Handlers (`createSession`, `clearSessionCookie`,
 * `renewSessionIfNeeded`) — Server Components can only read.
 */
import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { userSelect, type UserDTO } from "@/lib/auth/user-dto";
import {
  sessionCookieName,
  sessionCookieOptions,
  shouldRenewSession,
  signSessionToken,
  verifySessionToken,
  type SessionClaims,
  type SignSessionInput,
} from "@/lib/auth/jwt";

export type SessionTenant = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  defaultCalendarId: string | null;
};

export type Session = { user: UserDTO; tenant: SessionTenant };

export type SessionResult = null | { status: "revoked" } | ({ status: "ok" } & Session);

export const tenantSelect = {
  id: true,
  name: true,
  slug: true,
  timezone: true,
  defaultCalendarId: true,
} as const;

/** Verified JWT claims from the request cookie (no DB). Cached per request. */
export const readSessionClaims = cache(async (): Promise<SessionClaims | null> => {
  const store = await cookies();
  return verifySessionToken(store.get(sessionCookieName())?.value);
});

/**
 * Pure resolution of a verified token against the database — shared by `getSession()` and tests.
 * `null` only when there are no usable claims; a token that verifies but no longer matches the DB is `revoked`
 * (so the caller clears the cookie via /logout and there is no proxy ↔ layout redirect loop).
 */
export async function resolveSession(claims: SessionClaims | null): Promise<SessionResult> {
  if (!claims) return null;
  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: { ...userSelect, tokenVersion: true, tenant: { select: tenantSelect } },
  });
  if (!user || user.tenantId !== claims.tid) return { status: "revoked" };
  if (!user.isActive || user.tokenVersion !== claims.tv) return { status: "revoked" };
  const { tokenVersion: _tokenVersion, tenant, ...dto } = user;
  void _tokenVersion;
  return { status: "ok", user: dto, tenant };
}

export const getSession = cache(async (): Promise<SessionResult> => resolveSession(await readSessionClaims()));

/** Signs a fresh 7-day token and sets the cookie. Server Actions / Route Handlers only. */
export async function createSession(input: SignSessionInput): Promise<string> {
  const token = await signSessionToken(input);
  const store = await cookies();
  store.set(sessionCookieName(), token, sessionCookieOptions());
  return token;
}

/** Expires the cookie (`maxAge: 0`, same attributes). Server Actions / Route Handlers only. */
export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(sessionCookieName(), "", sessionCookieOptions(0));
}

/**
 * Sliding renewal: re-issues the cookie when < 3 days remain. Cookie writes throw inside Server Components, so the
 * write is attempted and silently skipped there — renewal effectively happens only from actions/route handlers.
 * Returns true when a new cookie was written.
 */
export async function renewSessionIfNeeded(session: Session, claims: SessionClaims | null): Promise<boolean> {
  if (!claims || !shouldRenewSession(claims)) return false;
  try {
    await createSession({
      userId: session.user.id,
      tenantId: session.tenant.id,
      role: session.user.role,
      tokenVersion: claims.tv,
    });
    return true;
  } catch {
    return false;
  }
}

/** Current tokenVersion for a user — used when the actor's own cookie must be re-issued after a bump. */
export async function currentTokenVersion(userId: string): Promise<number | null> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { tokenVersion: true } });
  return row?.tokenVersion ?? null;
}

/**
 * Re-issue the actor's cookie with the user's CURRENT tokenVersion (after "Sign out everywhere" or an own
 * password/name change bumped it). Server Actions only.
 */
export async function reissueSessionFor(user: Pick<UserDTO, "id" | "tenantId" | "role">): Promise<void> {
  const tv = await currentTokenVersion(user.id);
  if (tv === null) return;
  await createSession({ userId: user.id, tenantId: user.tenantId, role: user.role, tokenVersion: tv });
}
