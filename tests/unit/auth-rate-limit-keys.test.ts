import { describe, expect, it } from "vitest";
import {
  RATE_LIMITS,
  clientIp,
  loginEmailKey,
  loginIpKey,
  sha256,
  signupIpKey,
  tooManyAttemptsMessage,
} from "@/lib/rate-limit";

describe("rate-limit keys and client IP (docs/M1_SPEC.md §3)", () => {
  it("uses the spec limits", () => {
    expect(RATE_LIMITS.loginIp).toEqual({ limit: 20, windowSec: 15 * 60 });
    expect(RATE_LIMITS.loginEmail).toEqual({ limit: 10, windowSec: 15 * 60 });
    expect(RATE_LIMITS.signupIp).toEqual({ limit: 5, windowSec: 60 * 60 });
  });

  it("hashes emails in bucket keys", () => {
    expect(loginEmailKey("priya@acme.test")).toBe(`login:email:${sha256("priya@acme.test")}`);
    expect(loginEmailKey("priya@acme.test")).not.toContain("priya");
    expect(loginIpKey("1.2.3.4")).toBe("login:ip:1.2.3.4");
    expect(signupIpKey("1.2.3.4")).toBe("signup:ip:1.2.3.4");
  });

  it("prefers the Netlify header, then the LAST x-forwarded-for hop, else unknown", () => {
    expect(clientIp(new Headers({ "x-nf-client-connection-ip": "9.9.9.9", "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe("9.9.9.9");
    expect(clientIp(new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe("2.2.2.2");
    expect(clientIp(new Headers({ "x-forwarded-for": "  5.5.5.5 " }))).toBe("5.5.5.5");
    expect(clientIp(new Headers({ "x-real-ip": "7.7.7.7" }))).toBe("7.7.7.7");
    expect(clientIp(new Headers())).toBe("unknown");
  });

  it("phrases the retry hint in whole minutes", () => {
    const base = { limited: true, count: 21, limit: 20, remaining: 0, resetAt: new Date() };
    expect(tooManyAttemptsMessage({ ...base, retryAfterSec: 30, retryAfterMinutes: 1 })).toBe("Too many attempts, try again in 1 minute.");
    expect(tooManyAttemptsMessage({ ...base, retryAfterSec: 700, retryAfterMinutes: 12 })).toBe("Too many attempts, try again in 12 minutes.");
  });
});
