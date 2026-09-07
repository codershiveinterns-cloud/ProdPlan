/**
 * Authorization guards (docs/M1_SPEC.md §3). EVERY `(app)` page and EVERY Server Action calls
 * `requirePermission()` itself — the layout and the proxy are never the authority.
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { can, type Permission } from "@/lib/rbac";
import { ForbiddenError } from "@/lib/errors";
import { tenantDb, type TenantDb } from "@/lib/db";
import { getSession, readSessionClaims, renewSessionIfNeeded, type Session } from "@/lib/auth/session";

export type { Session, SessionTenant } from "@/lib/auth/session";

/** Request header set by `src/proxy.ts` with the original `pathname + search`. */
export const PATHNAME_HEADER = "x-pp-pathname";

export type RequireSessionOptions = {
  /**
   * Skip the `mustChangePassword` → `/settings/profile?force=1` redirect. The profile page and its
   * change-password action are exempt automatically (by path); pass this when calling from elsewhere.
   */
  allowMustChangePassword?: boolean;
};

const FORCE_PASSWORD_EXEMPT_PREFIXES = ["/settings/profile", "/logout"];

/** `pathname + search` of the current request as recorded by the proxy, or null when unknown (e.g. /api). */
export async function currentRequestPath(): Promise<string | null> {
  try {
    const h = await headers();
    const value = h.get(PATHNAME_HEADER);
    return value && value.startsWith("/") ? value : null;
  } catch {
    return null;
  }
}

function pathnameOnly(path: string | null): string {
  if (!path) return "";
  const q = path.indexOf("?");
  return q === -1 ? path : path.slice(0, q);
}

export function isForcedPasswordChangeExempt(pathname: string): boolean {
  return FORCE_PASSWORD_EXEMPT_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`) || pathname.startsWith(`${p}?`));
}

export function loginUrl(next: string | null): string {
  const safe = next ? safeNext(next) : "/dashboard";
  return safe === "/dashboard" ? "/login" : `/login?next=${encodeURIComponent(safe)}`;
}

/**
 * Redirects `revoked` → `/logout?reason=revoked`, no session → `/login?next=<current path>`, and users who must
 * change their password → `/settings/profile?force=1` (except on that page, `/logout` and the change-password
 * action). Also performs sliding renewal (effective only from Server Actions / Route Handlers).
 */
export async function requireSession(opts: RequireSessionOptions = {}): Promise<Session> {
  const result = await getSession();
  if (result === null) {
    redirect(loginUrl(await currentRequestPath()));
  }
  if (result.status === "revoked") {
    redirect("/logout?reason=revoked");
  }
  const session: Session = { user: result.user, tenant: result.tenant };
  await renewSessionIfNeeded(session, await readSessionClaims());

  if (session.user.mustChangePassword && !opts.allowMustChangePassword) {
    const pathname = pathnameOnly(await currentRequestPath());
    if (!isForcedPasswordChangeExempt(pathname)) {
      redirect("/settings/profile?force=1");
    }
  }
  return session;
}

/** `requireSession()` + `can()`; throws `ForbiddenError` (pages: `forbidden()`, actions: `{ ok:false, error:"forbidden" }`). */
export async function requirePermission(
  permission: Permission,
  opts: RequireSessionOptions = {},
): Promise<{ session: Session; db: TenantDb }> {
  const session = await requireSession(opts);
  if (!can(session.user.role, permission)) {
    throw new ForbiddenError();
  }
  return { session, db: tenantDb(session.tenant.id) };
}

export function getTenantDb(session: Session): TenantDb {
  return tenantDb(session.tenant.id);
}

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const BLOCKED_PREFIXES = ["/logout", "/login", "/signup"];

/**
 * Open-redirect guard for `?next=`. Honoured only when `next` is a string starting with a single `/`, whose second
 * character is not `/` or `\`, contains no `\`, no scheme, no whitespace/control characters, is ≤ 512 chars and
 * does not start with /logout, /login or /signup. Otherwise `/dashboard`.
 */
export function safeNext(next: unknown): string {
  if (typeof next !== "string") return "/dashboard";
  if (next.length === 0 || next.length > 512) return "/dashboard";
  if (next[0] !== "/") return "/dashboard";
  if (next[1] === "/" || next[1] === "\\") return "/dashboard";
  if (next.includes("\\")) return "/dashboard";
  if (/[\s\u0000-\u001f\u007f]/.test(next)) return "/dashboard";
  if (SCHEME_RE.test(next)) return "/dashboard";
  if (BLOCKED_PREFIXES.some((p) => next === p || next.startsWith(p))) return "/dashboard";
  return next;
}
