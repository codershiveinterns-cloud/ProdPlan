/**
 * Request interception (docs/M1_SPEC.md §3, docs/STACK_NOTES.md §3). Node.js runtime, `jose` only — this file
 * must never import Prisma or bcryptjs. The proxy is a fast pre-filter; `requireSession()`/`requirePermission()`
 * in every page and action remain the authority (they check isActive / tokenVersion against the DB).
 *
 * (a) no cookie or a token that fails signature/exp verification → /login?next=<path>
 * (b) a verifying cookie on /login, /signup or / → /dashboard
 * (c) /logout, /api/**, /_next/** and static assets pass untouched (matcher + explicit allow-list)
 * (d) /settings/users and /settings/tenant require the JWT role hint to be ADMIN
 */
import { NextResponse, type NextRequest } from "next/server";
import { sessionCookieName, sessionCookieOptions, verifySessionToken } from "@/lib/auth/jwt";

const PUBLIC_PATHS = new Set(["/login", "/signup"]);
const PASSTHROUGH_PREFIXES = ["/logout", "/api/"];
const ADMIN_ONLY_PREFIXES = ["/settings/users", "/settings/tenant"];
const PATHNAME_HEADER = "x-pp-pathname";

/** True when `pathname` equals a prefix or lives underneath it ("/api/" matches "/api/x", "/logout" matches "/logout/x"). */
function startsWithAny(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => {
    const bare = p.replace(/\/$/, "");
    return pathname === bare || pathname.startsWith(`${bare}/`);
  });
}

function withPathHeader(req: NextRequest, pathAndSearch: string): NextResponse {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(PATHNAME_HEADER, pathAndSearch);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export async function proxy(req: NextRequest): Promise<NextResponse> {
  const { pathname, search } = req.nextUrl;
  const pathAndSearch = `${pathname}${search}`;

  if (startsWithAny(pathname, PASSTHROUGH_PREFIXES)) {
    return withPathHeader(req, pathAndSearch);
  }

  const cookieName = sessionCookieName();
  const token = req.cookies.get(cookieName)?.value;
  const claims = await verifySessionToken(token);
  const isPublic = PUBLIC_PATHS.has(pathname);

  if (!claims) {
    if (isPublic) return withPathHeader(req, pathAndSearch);
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathAndSearch)}`;
    const res = NextResponse.redirect(url);
    if (token) {
      // Drop the unusable cookie so the browser stops sending it.
      res.cookies.set(cookieName, "", sessionCookieOptions(0));
    }
    return res;
  }

  if (isPublic) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  if (startsWithAny(pathname, ADMIN_ONLY_PREFIXES) && claims.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return withPathHeader(req, pathAndSearch);
}

export const config = {
  // Everything except /api (route handlers do their own auth), Next internals and static assets.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml|woff2?)$).*)",
  ],
};
