import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";
import {
  BCRYPT_COST,
  DUMMY_HASH,
  emailSchema,
  hashPassword,
  normalizeEmail,
  passwordDiffersFromEmail,
  passwordSchema,
  verifyPassword,
} from "@/lib/auth/password";
import { loginSchema, signupSchema } from "@/lib/auth/schemas";

describe("passwordSchema", () => {
  it("requires 8–72 characters", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("12345678").success).toBe(true);
    expect(passwordSchema.safeParse("x".repeat(72)).success).toBe(true);
    expect(passwordSchema.safeParse("x".repeat(73)).success).toBe(false);
  });

  it("has friendly messages", () => {
    expect(passwordSchema.safeParse("short").error?.issues[0]?.message).toBe("Use at least 8 characters");
    expect(passwordSchema.safeParse(undefined).error?.issues[0]?.message).toBe("Enter a password");
  });
});

describe("emailSchema / normalizeEmail", () => {
  it("trims and lower-cases before validating", () => {
    expect(emailSchema.parse("  Priya@Acme.TEST ")).toBe("priya@acme.test");
    expect(normalizeEmail("  Priya@Acme.TEST ")).toBe("priya@acme.test");
  });

  it("rejects malformed and overly long addresses", () => {
    expect(emailSchema.safeParse("nope").success).toBe(false);
    expect(emailSchema.safeParse(`${"a".repeat(250)}@x.io`).success).toBe(false);
    expect(emailSchema.safeParse("").error?.issues[0]?.message).toBe("Enter a valid email address");
  });
});

describe("password must not equal the email", () => {
  it("compares case-insensitively after trimming", () => {
    expect(passwordDiffersFromEmail({ email: "a@b.co", password: "A@B.CO" })).toBe(false);
    expect(passwordDiffersFromEmail({ email: "a@b.co", password: "different1" })).toBe(true);
  });

  it("surfaces as a password field error on the signup schema", () => {
    const res = signupSchema.safeParse({
      company: "Acme",
      timezone: "Asia/Kolkata",
      name: "Priya",
      email: "priya@acme.test",
      password: "Priya@Acme.TEST",
    });
    expect(res.success).toBe(false);
    const issue = res.error?.issues.find((i) => i.path[0] === "password");
    expect(issue?.message).toBe("Password must not be the same as your email");
  });
});

describe("signupSchema", () => {
  it("accepts a well-formed signup and normalises the email", () => {
    const res = signupSchema.parse({
      company: "  Acme Precision Works ",
      timezone: "Asia/Kolkata",
      name: " Priya ",
      email: " Priya@Acme.test ",
      password: "Password123!",
    });
    expect(res).toEqual({
      company: "Acme Precision Works",
      timezone: "Asia/Kolkata",
      name: "Priya",
      email: "priya@acme.test",
      password: "Password123!",
    });
  });

  it("rejects unknown timezones and accepts legacy ICU aliases", () => {
    const base = { company: "Acme", name: "P", email: "p@acme.test", password: "Password123!" };
    expect(signupSchema.safeParse({ ...base, timezone: "Mars/Olympus" }).success).toBe(false);
    expect(signupSchema.safeParse({ ...base, timezone: "Asia/Calcutta" }).success).toBe(true);
    expect(signupSchema.safeParse({ ...base, timezone: "UTC" }).success).toBe(true);
  });
});

describe("loginSchema", () => {
  it("does not apply the length policy to the login password (any non-empty value)", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "" }).error?.issues[0]?.message).toBe(
      "Enter your password",
    );
  });
});

describe("bcrypt helpers", () => {
  it("hashes at cost 12 and verifies round-trip", async () => {
    const hash = await hashPassword("Password123!");
    expect(hash.startsWith(`$2b$${BCRYPT_COST}$`)).toBe(true);
    expect(await verifyPassword("Password123!", hash)).toBe(true);
    expect(await verifyPassword("Password123?", hash)).toBe(false);
  });

  it("DUMMY_HASH is a real cost-12 hash that never matches", async () => {
    expect(DUMMY_HASH.startsWith("$2b$12$")).toBe(true);
    expect(bcrypt.getRounds(DUMMY_HASH)).toBe(12);
    expect(await verifyPassword("", DUMMY_HASH)).toBe(false);
    expect(await verifyPassword("Password123!", DUMMY_HASH)).toBe(false);
  });

  it("verifyPassword never throws on garbage hashes", async () => {
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
  });
});
