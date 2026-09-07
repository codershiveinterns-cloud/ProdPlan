/**
 * Session JWT + cookie primitives (docs/M1_SPEC.md §3).
 *
 * This module depends on `jose` only — it is imported by `src/proxy.ts`, which must never touch Prisma or bcryptjs.
 *
 * Claims: `sub` = user.id, `tid` = tenantId, `role` (a HINT for the proxy only — the DB is the authority),
 * `tv` = tokenVersion, `iat`, `exp` = iat + 7 d, `iss` = "prodplan", `aud` = APP_URL origin.
 */
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { Role } from "@/generated/prisma/enums";

export const SESSION_TTL_SEC = 7 * 24 * 60 * 60;
/** Sliding renewal threshold: re-issue the cookie when less than this remains. */
export const SESSION_RENEW_BELOW_SEC = 3 * 24 * 60 * 60;
export const JWT_ISSUER = "prodplan";
export const JWT_CLOCK_TOLERANCE_SEC = 30;

const ROLES: ReadonlySet<string> = new Set(["ADMIN", "PLANNER", "SUPERVISOR", "VIEWER"]);

export type SessionClaims = {
  sub: string;
  tid: string;
  role: Role;
  tv: number;
  iat: number;
  exp: number;
};

export function appUrl(): URL {
  const raw = process.env.APP_URL?.trim();
  if (!raw) return new URL("http://localhost:3000");
  try {
    return new URL(raw);
  } catch {
    return new URL("http://localhost:3000");
  }
}

/** JWT audience = the APP_URL origin (scheme + host + port). */
export function appOrigin(): string {
  return appUrl().origin;
}

export function isHttpsApp(): boolean {
  return appUrl().protocol === "https:";
}

/** `__Host-pp_session` when APP_URL is https (requires secure + path=/ + no domain), else `pp_session`. */
export function sessionCookieName(): string {
  return isHttpsApp() ? "__Host-pp_session" : "pp_session";
}

export type SessionCookieOptions = {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  maxAge: number;
};

export function sessionCookieOptions(maxAge: number = SESSION_TTL_SEC): SessionCookieOptions {
  return { httpOnly: true, sameSite: "lax", secure: isHttpsApp(), path: "/", maxAge };
}

let cachedKey: { secret: string; key: Uint8Array } | null = null;

/** HS256 key derived from AUTH_SECRET. Throws when the secret is missing or shorter than 32 characters. */
export function authSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET must be set and at least 32 characters long");
  }
  if (cachedKey && cachedKey.secret === secret) return cachedKey.key;
  const key = new TextEncoder().encode(secret);
  cachedKey = { secret, key };
  return key;
}

export type SignSessionInput = {
  userId: string;
  tenantId: string;
  role: Role;
  tokenVersion: number;
};

export async function signSessionToken(
  input: SignSessionInput,
  opts: { now?: Date; ttlSec?: number } = {},
): Promise<string> {
  const nowSec = Math.floor((opts.now ?? new Date()).getTime() / 1000);
  const ttl = opts.ttlSec ?? SESSION_TTL_SEC;
  return new SignJWT({ tid: input.tenantId, role: input.role, tv: input.tokenVersion })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(input.userId)
    .setIssuer(JWT_ISSUER)
    .setAudience(appOrigin())
    .setIssuedAt(nowSec)
    .setExpirationTime(nowSec + ttl)
    .sign(authSecretKey());
}

function isSessionClaims(p: JWTPayload): p is JWTPayload & SessionClaims {
  return (
    typeof p.sub === "string" &&
    p.sub.length > 0 &&
    typeof p.tid === "string" &&
    p.tid.length > 0 &&
    typeof p.role === "string" &&
    ROLES.has(p.role) &&
    typeof p.tv === "number" &&
    Number.isInteger(p.tv) &&
    typeof p.iat === "number" &&
    typeof p.exp === "number"
  );
}

/**
 * Verifies signature, algorithm, issuer, audience and expiry (30 s clock tolerance).
 * Returns `null` for anything invalid — callers treat that as "no session".
 */
export async function verifySessionToken(
  token: string | undefined | null,
  opts: { now?: Date } = {},
): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, authSecretKey(), {
      algorithms: ["HS256"],
      issuer: JWT_ISSUER,
      audience: appOrigin(),
      clockTolerance: JWT_CLOCK_TOLERANCE_SEC,
      currentDate: opts.now,
    });
    if (!isSessionClaims(payload)) return null;
    return { sub: payload.sub, tid: payload.tid, role: payload.role, tv: payload.tv, iat: payload.iat, exp: payload.exp };
  } catch {
    return null;
  }
}

/** Seconds until the token expires (negative when already expired). */
export function secondsUntilExpiry(claims: Pick<SessionClaims, "exp">, now: Date = new Date()): number {
  return claims.exp - Math.floor(now.getTime() / 1000);
}

export function shouldRenewSession(claims: Pick<SessionClaims, "exp">, now: Date = new Date()): boolean {
  return secondsUntilExpiry(claims, now) < SESSION_RENEW_BELOW_SEC;
}
