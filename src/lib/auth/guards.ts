/**
 * Authorization guards (docs/M1_SPEC.md §3). EVERY `(app)` page and EVERY Server Action calls
 * `requirePermission()` itself — the layout and the proxy are never the authority.
 */
import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { can, type Permission } from "@/lib/rbac";
import { ForbiddenError } from "@/lib/errors";
import { tenantDb, type TenantDb } from "@/lib/db";
import { getSession, readSessionClaims, renewSessionIfNeeded, type Session, type SessionTenant } from "@/lib/auth/session";

export type { Session, SessionTenant } from "@/lib/auth/session";

/** Request header set by `src/proxy.ts` with the original `pathname + search`. */
export const PATHNAME_HEADER = "x-pp-pathname";

/** Slug of the shared demo plant (docs/M1_SPEC.md §6.9). Defined here so guards stay free of the demo module. */
export const DEMO_TENANT_SLUG = "demo";

/**
 * Permissions that are refused inside the demo plant even for its ADMIN, so one visitor cannot lock the others out
 * (spec §6.9: no Settings › Users, no tenant name/timezone changes). Everything else is fully usable.
 */
export const DEMO_LOCKED_PERMISSIONS: ReadonlySet<Permission> = new Set<Permission>(["users:manage", "tenant:manage"]);

export const DEMO_LOCKED_MESSAGE = "This is the shared demo plant: team and plant settings are locked. Create your own workspace to manage them.";

export function isDemoTenant(tenant: Pick<SessionTenant, "slug">): boolean {
  return tenant.slug === DEMO_TENANT_SLUG;
}

/** True when `permission` is available to `role` in `tenant` (the demo plant hides users:manage / tenant:manage). */
export function canInTenant(role: Session["user"]["role"], tenant: Pick<SessionTenant, "slug">, permission: Permission): boolean {
  if (isDemoTenant(tenant) && DEMO_LOCKED_PERMISSIONS.has(permission)) return false;
  return can(role, permission);
}

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
  if (isDemoTenant(session.tenant) && DEMO_LOCKED_PERMISSIONS.has(permission)) {
    throw new ForbiddenError(DEMO_LOCKED_MESSAGE);
  }
  return { session, db: tenantDb(session.tenant.id) };
}

/**
 * `requirePermission()` for Server Component pages: a `ForbiddenError` becomes Next's `forbidden()` interrupt
 * (renders src/app/forbidden.tsx with HTTP 403; needs `experimental.authInterrupts`), while the redirects thrown by
 * `requireSession()` propagate untouched. Server Actions keep using `requirePermission()` inside `withAction()`,
 * which maps the error to `{ ok: false, error: "forbidden" }`.
 */
export async function requirePagePermission(
  permission: Permission,
  opts: RequireSessionOptions = {},
): Promise<{ session: Session; db: TenantDb }> {
  try {
    return await requirePermission(permission, opts);
  } catch (err) {
    if (err instanceof ForbiddenError) forbidden();
    throw err;
  }
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
