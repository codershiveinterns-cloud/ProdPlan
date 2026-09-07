import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { toPlain, type Plain } from "@/lib/serialize";

describe("toPlain", () => {
  it("converts Prisma.Decimal to number and Date to ISO string", () => {
    const when = new Date("2026-09-05T14:30:00.000Z");
    const out = toPlain({ qty: new Prisma.Decimal("12.500"), cost: new Prisma.Decimal("0.1"), when });
    expect(out).toEqual({ qty: 12.5, cost: 0.1, when: "2026-09-05T14:30:00.000Z" });
    expect(typeof out.qty).toBe("number");
  });

  it("recurses through arrays and nested objects", () => {
    const out = toPlain({
      rows: [{ n: new Prisma.Decimal(1), inner: { d: new Date("2026-01-01T00:00:00Z"), list: [new Prisma.Decimal("2.25")] } }],
    });
    expect(out).toEqual({ rows: [{ n: 1, inner: { d: "2026-01-01T00:00:00.000Z", list: [2.25] } }] });
  });

  it("strips passwordHash and tokenVersion at any depth but keeps other user fields", () => {
    const out = toPlain({
      user: {
        id: "u1",
        name: "Priya",
        passwordHash: "$2b$12$secret",
        tokenVersion: 3,
        mustChangePassword: true,
        nested: [{ passwordHash: "x", ok: 1 }, { tokenVersion: 9 }],
      },
      passwordHash: "top",
    });
    expect(out).toEqual({
      user: { id: "u1", name: "Priya", mustChangePassword: true, nested: [{ ok: 1 }, {}] },
    });
    expect(JSON.stringify(out)).not.toMatch(/passwordHash|tokenVersion|secret/);
  });

  it("passes primitives, null and undefined through", () => {
    expect(toPlain(null)).toBeNull();
    expect(toPlain(undefined)).toBeUndefined();
    expect(toPlain(5)).toBe(5);
    expect(toPlain("s")).toBe("s");
    expect(toPlain(true)).toBe(true);
    expect(toPlain({ a: null, b: undefined })).toEqual({ a: null, b: undefined });
  });

  it("converts bigint to number and invalid dates to null", () => {
    expect(toPlain({ big: BigInt(42) })).toEqual({ big: 42 });
    expect(toPlain({ d: new Date("garbage") })).toEqual({ d: null });
  });

  it("does not mutate its input", () => {
    const input = { qty: new Prisma.Decimal("1.5"), user: { passwordHash: "x", name: "n" } };
    toPlain(input);
    expect(input.qty).toBeInstanceOf(Prisma.Decimal);
    expect(input.user.passwordHash).toBe("x");
  });

  it("produces JSON-safe output for Client Components", () => {
    const out = toPlain({ qty: new Prisma.Decimal("3"), when: new Date(0), tags: ["a"], nested: { n: null } });
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });

  it("Plain<T> mirrors the runtime conversion at the type level", () => {
    type Row = { id: string; qty: Prisma.Decimal; when: Date; maybe: Date | null; passwordHash: string; tokenVersion: number; items: { d: Prisma.Decimal }[] };
    type P = Plain<Row>;
    const p: P = { id: "x", qty: 1, when: "2026-01-01T00:00:00.000Z", maybe: null, items: [{ d: 2 }] };
    const qty: number = p.qty;
    const when: string = p.when;
    const maybe: string | null = p.maybe;
    // @ts-expect-error passwordHash / tokenVersion are removed from the plain type
    const stripped: [unknown, unknown] = [p.passwordHash, p.tokenVersion];
    expect(stripped).toEqual([undefined, undefined]);
    expect([qty, when, maybe]).toBeTruthy();
  });
});
