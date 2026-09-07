import { describe, expect, it } from "vitest";
import { isForcedPasswordChangeExempt, loginUrl, safeNext } from "@/lib/auth/guards";

describe("safeNext (docs/M1_SPEC.md §3)", () => {
  it("honours plain in-app paths", () => {
    expect(safeNext("/orders")).toBe("/orders");
    expect(safeNext("/orders/abc?status=all&page=2")).toBe("/orders/abc?status=all&page=2");
    expect(safeNext("/settings/profile?force=1")).toBe("/settings/profile?force=1");
    expect(safeNext("/")).toBe("/");
  });

  it("falls back to /dashboard for non-strings and empty values", () => {
    expect(safeNext(undefined)).toBe("/dashboard");
    expect(safeNext(null)).toBe("/dashboard");
    expect(safeNext(42)).toBe("/dashboard");
    expect(safeNext(["/orders"])).toBe("/dashboard");
    expect(safeNext("")).toBe("/dashboard");
  });

  it("rejects protocol-relative and backslash tricks", () => {
    expect(safeNext("//evil.example")).toBe("/dashboard");
    expect(safeNext("/\\evil.example")).toBe("/dashboard");
    expect(safeNext("/orders\\..\\x")).toBe("/dashboard");
    expect(safeNext("\\\\evil")).toBe("/dashboard");
  });

  it("rejects absolute URLs and schemes", () => {
    expect(safeNext("https://evil.example/")).toBe("/dashboard");
    expect(safeNext("javascript:alert(1)")).toBe("/dashboard");
    expect(safeNext("evil.example/orders")).toBe("/dashboard");
    expect(safeNext("orders")).toBe("/dashboard");
  });

  it("rejects paths that do not start with a single slash", () => {
    expect(safeNext(" /orders")).toBe("/dashboard");
    expect(safeNext("./orders")).toBe("/dashboard");
  });

  it("rejects overly long values and control characters", () => {
    expect(safeNext(`/${"a".repeat(511)}`)).toHaveLength(512);
    expect(safeNext(`/${"a".repeat(512)}`)).toBe("/dashboard");
    expect(safeNext("/orders\nSet-Cookie: x")).toBe("/dashboard");
    expect(safeNext("/orders\r")).toBe("/dashboard");
    expect(safeNext("/orders with space")).toBe("/dashboard");
  });

  it("never bounces back into the auth pages", () => {
    expect(safeNext("/login")).toBe("/dashboard");
    expect(safeNext("/login?next=/orders")).toBe("/dashboard");
    expect(safeNext("/logout")).toBe("/dashboard");
    expect(safeNext("/logout?reason=revoked")).toBe("/dashboard");
    expect(safeNext("/signup")).toBe("/dashboard");
    expect(safeNext("/signup/extra")).toBe("/dashboard");
  });
});

describe("loginUrl", () => {
  it("adds an encoded next only when it is worth keeping", () => {
    expect(loginUrl(null)).toBe("/login");
    expect(loginUrl("/dashboard")).toBe("/login");
    expect(loginUrl("//evil")).toBe("/login");
    expect(loginUrl("/orders?status=all")).toBe("/login?next=%2Forders%3Fstatus%3Dall");
  });
});

describe("isForcedPasswordChangeExempt", () => {
  it("exempts the profile page and /logout only", () => {
    expect(isForcedPasswordChangeExempt("/settings/profile")).toBe(true);
    expect(isForcedPasswordChangeExempt("/logout")).toBe(true);
    expect(isForcedPasswordChangeExempt("/settings/users")).toBe(false);
    expect(isForcedPasswordChangeExempt("/dashboard")).toBe(false);
    expect(isForcedPasswordChangeExempt("")).toBe(false);
  });
});
