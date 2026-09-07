/**
 * GET/POST /logout — clears the session cookie (maxAge 0, same attributes) and redirects to /login?reason=…
 * Idempotent; touches no other state. `requireSession()` sends revoked sessions here so the stale cookie is
 * removed before the user sees /login (no proxy ↔ layout redirect loop).
 */
import { NextResponse, type NextRequest } from "next/server";
import { sessionCookieName, sessionCookieOptions } from "@/lib/auth/jwt";

const REASONS = new Set(["revoked", "signed-out", "expired", "demo-reset"]);

function handle(req: NextRequest): NextResponse {
  const requested = req.nextUrl.searchParams.get("reason") ?? "signed-out";
  const reason = REASONS.has(requested) ? requested : "signed-out";
  const url = new URL(`/login?reason=${encodeURIComponent(reason)}`, req.url);
  const res = NextResponse.redirect(url, 303);
  res.cookies.set(sessionCookieName(), "", sessionCookieOptions(0));
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return handle(req);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handle(req);
}
