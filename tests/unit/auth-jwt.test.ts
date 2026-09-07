import { SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  JWT_ISSUER,
  SESSION_RENEW_BELOW_SEC,
  SESSION_TTL_SEC,
  appOrigin,
  authSecretKey,
  sessionCookieName,
  sessionCookieOptions,
  shouldRenewSession,
  signSessionToken,
  verifySessionToken,
} from "@/lib/auth/jwt";

const input = { userId: "user_1", tenantId: "tenant_1", role: "PLANNER" as const, tokenVersion: 3 };

const originalEnv = { APP_URL: process.env.APP_URL, AUTH_SECRET: process.env.AUTH_SECRET };

beforeEach(() => {
  process.env.APP_URL = "http://localhost:3000";
  process.env.AUTH_SECRET = "unit-test-secret-unit-test-secret-unit-test-secret";
});

afterEach(() => {
  process.env.APP_URL = originalEnv.APP_URL;
  process.env.AUTH_SECRET = originalEnv.AUTH_SECRET;
});

describe("session JWT", () => {
  it("round-trips the claims with iss/aud/exp per spec", async () => {
    const now = new Date("2026-09-05T10:00:00Z");
    const token = await signSessionToken(input, { now });
    const claims = await verifySessionToken(token, { now });
    expect(claims).toEqual({
      sub: "user_1",
      tid: "tenant_1",
      role: "PLANNER",
      tv: 3,
      iat: Math.floor(now.getTime() / 1000),
      exp: Math.floor(now.getTime() / 1000) + SESSION_TTL_SEC,
    });
    expect(SESSION_TTL_SEC).toBe(7 * 24 * 3600);

    const payload = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString()) as Record<string, unknown>;
    expect(payload.iss).toBe(JWT_ISSUER);
    expect(payload.aud).toBe("http://localhost:3000");
    expect(appOrigin()).toBe("http://localhost:3000");
  });

  it("rejects a tampered token", async () => {
    const token = await signSessionToken(input);
    const [h, p, s] = token.split(".");
    const forged = JSON.parse(Buffer.from(p!, "base64url").toString()) as Record<string, unknown>;
    forged.role = "ADMIN";
    const tampered = `${h}.${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${s}`;
    expect(await verifySessionToken(tampered)).toBeNull();
    expect(await verifySessionToken(`${token}x`)).toBeNull();
    expect(await verifySessionToken("not.a.jwt")).toBeNull();
    expect(await verifySessionToken(undefined)).toBeNull();
  });

  it("rejects a token signed for another audience or issuer", async () => {
    const key = authSecretKey();
    const wrongAud = await new SignJWT({ tid: "t", role: "ADMIN", tv: 0 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u")
      .setIssuer(JWT_ISSUER)
      .setAudience("https://other.example")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key);
    expect(await verifySessionToken(wrongAud)).toBeNull();

    const wrongIss = await new SignJWT({ tid: "t", role: "ADMIN", tv: 0 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u")
      .setIssuer("someone-else")
      .setAudience(appOrigin())
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key);
    expect(await verifySessionToken(wrongIss)).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signSessionToken(input);
    process.env.AUTH_SECRET = "another-secret-another-secret-another-secret";
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("rejects tokens with malformed claims", async () => {
    const key = authSecretKey();
    const noTid = await new SignJWT({ role: "ADMIN", tv: 0 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u")
      .setIssuer(JWT_ISSUER)
      .setAudience(appOrigin())
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key);
    expect(await verifySessionToken(noTid)).toBeNull();

    const badRole = await new SignJWT({ tid: "t", role: "SUPERUSER", tv: 0 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u")
      .setIssuer(JWT_ISSUER)
      .setAudience(appOrigin())
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key);
    expect(await verifySessionToken(badRole)).toBeNull();
  });

  it("expires after 7 days (with 30 s tolerance)", async () => {
    const issued = new Date("2026-09-05T10:00:00Z");
    const token = await signSessionToken(input, { now: issued });
    const justBefore = new Date(issued.getTime() + SESSION_TTL_SEC * 1000 - 1000);
    const withinTolerance = new Date(issued.getTime() + SESSION_TTL_SEC * 1000 + 20_000);
    const afterTolerance = new Date(issued.getTime() + SESSION_TTL_SEC * 1000 + 60_000);
    expect(await verifySessionToken(token, { now: justBefore })).not.toBeNull();
    expect(await verifySessionToken(token, { now: withinTolerance })).not.toBeNull();
    expect(await verifySessionToken(token, { now: afterTolerance })).toBeNull();
  });

  it("flags renewal when less than 3 days remain", async () => {
    const issued = new Date("2026-09-05T10:00:00Z");
    const token = await signSessionToken(input, { now: issued });
    const claims = (await verifySessionToken(token, { now: issued }))!;
    expect(SESSION_RENEW_BELOW_SEC).toBe(3 * 24 * 3600);
    expect(shouldRenewSession(claims, issued)).toBe(false);
    expect(shouldRenewSession(claims, new Date(issued.getTime() + 4 * 24 * 3600 * 1000 - 1000))).toBe(false);
    expect(shouldRenewSession(claims, new Date(issued.getTime() + 4 * 24 * 3600 * 1000 + 1000))).toBe(true);
  });

  it("fails fast when AUTH_SECRET is missing or short", () => {
    process.env.AUTH_SECRET = "short";
    expect(() => authSecretKey()).toThrow(/AUTH_SECRET/);
    delete process.env.AUTH_SECRET;
    expect(() => authSecretKey()).toThrow(/AUTH_SECRET/);
  });
});

describe("session cookie", () => {
  it("uses the __Host- prefix and secure flag only when APP_URL is https", () => {
    process.env.APP_URL = "http://localhost:3000";
    expect(sessionCookieName()).toBe("pp_session");
    expect(sessionCookieOptions()).toEqual({ httpOnly: true, sameSite: "lax", secure: false, path: "/", maxAge: SESSION_TTL_SEC });

    process.env.APP_URL = "https://prodplan-staging.netlify.app";
    expect(sessionCookieName()).toBe("__Host-pp_session");
    expect(sessionCookieOptions()).toEqual({ httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: SESSION_TTL_SEC });
    expect(sessionCookieOptions(0).maxAge).toBe(0);
    expect(appOrigin()).toBe("https://prodplan-staging.netlify.app");
  });

  it("tolerates a missing or malformed APP_URL", () => {
    delete process.env.APP_URL;
    expect(appOrigin()).toBe("http://localhost:3000");
    process.env.APP_URL = "not a url";
    expect(sessionCookieName()).toBe("pp_session");
  });
});
