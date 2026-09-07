import { describe, expect, it } from "vitest";
import { RESERVED_SLUGS, SLUG_MAX_LENGTH, slugCandidate, slugify } from "@/lib/auth/slug";

describe("slugify (docs/M1_SPEC.md §3)", () => {
  it("lower-cases and joins words with single dashes", () => {
    expect(slugify("Acme Precision Works")).toBe("acme-precision-works");
    expect(slugify("  Beta   Fabrication  ")).toBe("beta-fabrication");
    expect(slugify("Foo & Bar, Ltd.")).toBe("foo-bar-ltd");
  });

  it("folds diacritics and strips anything outside a-z0-9", () => {
    expect(slugify("Über Fabrik GmbH")).toBe("uber-fabrik-gmbh");
    expect(slugify("Café Métal")).toBe("cafe-metal");
    expect(slugify("Ünïcödé!!")).toBe("unicode");
  });

  it("falls back to 'company' when nothing usable remains", () => {
    expect(slugify("")).toBe("company");
    expect(slugify("###")).toBe("company");
    expect(slugify("工厂")).toBe("company");
  });

  it("caps at 40 characters without a trailing dash", () => {
    const long = "Very Long Company Name That Goes On And On Forever Incorporated";
    const slug = slugify(long);
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(slug.endsWith("-")).toBe(false);
    expect(slug).toBe("very-long-company-name-that-goes-on-and");
    expect(slugify("a".repeat(100))).toBe("a".repeat(40));
  });

  it("never returns a reserved route name", () => {
    for (const reserved of RESERVED_SLUGS) {
      const slug = slugify(reserved);
      expect(RESERVED_SLUGS.has(slug)).toBe(false);
      expect(slug.startsWith(reserved)).toBe(true);
    }
    expect(slugify("Admin")).toBe("admin-1");
    expect(slugify("API")).toBe("api-1");
  });

  it("only ever produces a-z0-9 and dashes", () => {
    for (const name of ["Hello World", "x_y.z", "ÅÄÖ", "123 Go!", "-lead-trail-"]) {
      expect(slugify(name)).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });
});

describe("slugCandidate", () => {
  it("returns the base on attempt 1 and numbered suffixes afterwards", () => {
    expect(slugCandidate("acme", 1)).toBe("acme");
    expect(slugCandidate("acme", 2)).toBe("acme-2");
    expect(slugCandidate("acme", 5)).toBe("acme-5");
  });

  it("keeps the total length within 40 characters", () => {
    const base = "a".repeat(40);
    expect(slugCandidate(base, 2)).toBe(`${"a".repeat(38)}-2`);
    expect(slugCandidate(base, 10)).toBe(`${"a".repeat(37)}-10`);
    expect(slugCandidate(base, 2).length).toBe(40);
  });

  it("does not leave a double dash when truncation lands on a dash", () => {
    const base = `${"a".repeat(37)}-bcd`;
    expect(slugCandidate(base, 2)).toBe(`${"a".repeat(37)}-2`);
  });
});
