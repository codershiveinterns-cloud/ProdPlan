import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signSessionToken } from "@/lib/auth/jwt";
import { config, proxy } from "@/proxy";

const originalEnv = { APP_URL: process.env.APP_URL, AUTH_SECRET: process.env.AUTH_SECRET };

beforeEach(() => {
  process.env.APP_URL = "http://localhost:3000";
  process.env.AUTH_SECRET = "unit-test-secret-unit-test-secret-unit-test-secret";
});
afterEach(() => {
  process.env.APP_URL = originalEnv.APP_URL;
  process.env.AUTH_SECRET = originalEnv.AUTH_SECRET;
});

function request(path: string, cookie?: string): NextRequest {
  const headers = new Headers();
  if (cookie) headers.set("cookie", `pp_session=${cookie}`);
  return new NextRequest(`http://localhost:3000${path}`, { headers });
}

async function tokenFor(role: "ADMIN" | "PLANNER" | "SUPERVISOR" | "VIEWER") {
  return signSessionToken({ userId: "u1", tenantId: "t1", role, tokenVersion: 0 });
}

describe("src/proxy.ts (docs/M1_SPEC.md §3)", () => {
  it("redirects anonymous requests to /login with an encoded next", async () => {
    const res = await proxy(request("/orders?status=all"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/login?next=%2Forders%3Fstatus%3Dall");
  });

  it("lets anonymous / through (landing page) without a redirect", async () => {
    const res = await proxy(request("/"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-request-x-pp-pathname")).toBe("/");
  });

  it("lets anonymous users reach /login and /signup and records the path header", async () => {
    for (const path of ["/login", "/signup", "/login?reason=revoked"]) {
      const res = await proxy(request(path));
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
      expect(res.headers.get("x-middleware-request-x-pp-pathname")).toBe(path);
    }
  });

  it("clears an invalid cookie when redirecting to /login", async () => {
    const res = await proxy(request("/dashboard", "garbage.token.value"));
    expect(res.headers.get("location")).toContain("/login?next=%2Fdashboard");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/^pp_session=;/);
    expect(setCookie).toMatch(/Max-Age=0/i);
  });

  it("rejects a token signed with another secret (revoked-secret case)", async () => {
    const token = await tokenFor("ADMIN");
    process.env.AUTH_SECRET = "another-secret-another-secret-another-secret";
    const res = await proxy(request("/dashboard", token));
    expect(res.headers.get("location")).toContain("/login");
  });

  it("bounces signed-in users away from /login and /signup", async () => {
    const token = await tokenFor("VIEWER");
    for (const path of ["/login", "/signup"]) {
      const res = await proxy(request(path, token));
      expect(res.headers.get("location")).toBe("http://localhost:3000/dashboard");
    }
  });

  it("lets signed-in users through on / (the landing page shows them an \"Open dashboard\" link)", async () => {
    const token = await tokenFor("VIEWER");
    const res = await proxy(request("/", token));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("passes signed-in users through with the path header", async () => {
    const token = await tokenFor("VIEWER");
    const res = await proxy(request("/orders/abc?x=1", token));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-request-x-pp-pathname")).toBe("/orders/abc?x=1");
  });

  it("pre-filters /settings/users and /settings/tenant to ADMIN using the role hint", async () => {
    const planner = await tokenFor("PLANNER");
    const admin = await tokenFor("ADMIN");
    for (const path of ["/settings/users", "/settings/tenant", "/settings/users/invite"]) {
      expect((await proxy(request(path, planner))).headers.get("location")).toBe("http://localhost:3000/dashboard");
      expect((await proxy(request(path, admin))).headers.get("location")).toBeNull();
    }
    expect((await proxy(request("/settings/profile", planner))).headers.get("location")).toBeNull();
  });

  it("never touches /logout, /api or the generated metadata images", async () => {
    for (const path of ["/logout", "/logout?reason=revoked", "/api/health", "/api/orders/template", "/opengraph-image", "/opengraph-image?abc123", "/twitter-image"]) {
      const res = await proxy(request(path));
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    }
  });

  it("matcher excludes api, Next internals and static assets", () => {
    const re = new RegExp(`^${config.matcher[0]!.replace(/^\//, "").replace(/\/$/, "")}$`);
    const matches = (p: string) => re.test(p.replace(/^\//, ""));
    expect(matches("/dashboard")).toBe(true);
    expect(matches("/settings/users")).toBe(true);
    expect(matches("/logout")).toBe(true);
    expect(matches("/api/health")).toBe(false);
    expect(matches("/_next/static/chunk.js")).toBe(false);
    expect(matches("/_next/image?url=x")).toBe(false);
    expect(matches("/favicon.ico")).toBe(false);
    expect(matches("/logo.svg")).toBe(false);
    expect(matches("/fonts/inter.woff2")).toBe(false);
  });
});
