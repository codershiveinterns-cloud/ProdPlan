import { describe, expect, it } from "vitest";
import { coverageFor, requiredPerUnit, requirementFor, round3, roundTo, toNumber } from "@/lib/bom";

describe("toNumber / round3", () => {
  it("accepts numbers, numeric strings and Decimal-like objects", () => {
    expect(toNumber(2.5)).toBe(2.5);
    expect(toNumber("2.500")).toBe(2.5);
    expect(toNumber(" 10 ")).toBe(10);
    expect(toNumber({ toString: () => "0.333" })).toBe(0.333);
    expect(() => toNumber("abc")).toThrow(RangeError);
    expect(() => toNumber("")).toThrow(RangeError);
    expect(() => toNumber(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it("rounds to 3 dp half-up and strips float noise", () => {
    expect(round3(1.0005)).toBe(1.001);
    expect(round3(0.1 * 3)).toBe(0.3);
    expect(round3(2.75)).toBe(2.75);
    expect(round3(1.23456)).toBe(1.235);
    expect(round3(1.2344)).toBe(1.234);
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(123.456, 0)).toBe(123);
    expect(() => round3(Number.NaN)).toThrow(RangeError);
  });
});

describe("requiredPerUnit", () => {
  it("applies the scrap allowance: 2.5 with 10 % scrap → 2.75", () => {
    expect(requiredPerUnit(2.5, 10)).toBe(2.75);
    expect(requiredPerUnit("2.5", "10")).toBe(2.75);
    expect(requiredPerUnit({ toString: () => "2.500" }, { toString: () => "10.00" })).toBe(2.75);
  });

  it("defaults scrap to 0 and rounds to 3 dp", () => {
    expect(requiredPerUnit(1)).toBe(1);
    expect(requiredPerUnit(0.3333, 0)).toBe(0.333);
    expect(requiredPerUnit(1, 2.5)).toBe(1.025);
    expect(requiredPerUnit(0.1, 3)).toBe(0.103);
    expect(requiredPerUnit(0, 50)).toBe(0);
  });
});

describe("requirementFor", () => {
  it("computes gross requirement, shortage and the isShort flag per line", () => {
    const out = requirementFor(100, [
      { materialId: "al", quantityPerUnit: 2.5, scrapPercent: 10, stockOnHand: 200 },
      { materialId: "bolt", quantityPerUnit: 4, scrapPercent: 0, stockOnHand: "1000" },
      { materialId: "paint", quantityPerUnit: "0.05", scrapPercent: null, stockOnHand: { toString: () => "5.000" } },
    ]);
    expect(out).toEqual([
      { materialId: "al", requiredPerUnit: 2.75, required: 275, onHand: 200, shortBy: 75, isShort: true },
      { materialId: "bolt", requiredPerUnit: 4, required: 400, onHand: 1000, shortBy: 0, isShort: false },
      { materialId: "paint", requiredPerUnit: 0.05, required: 5, onHand: 5, shortBy: 0, isShort: false },
    ]);
  });

  it("rounds to 3 dp and accepts fractional order quantities", () => {
    const [line] = requirementFor("12.5", [{ materialId: "m", quantityPerUnit: 0.333, scrapPercent: 5, stockOnHand: 0 }]);
    // 0.333 × 1.05 = 0.34965 → 0.35 per unit; 12.5 × 0.35 = 4.375
    expect(line.requiredPerUnit).toBe(0.35);
    expect(line.required).toBe(4.375);
    expect(line.shortBy).toBe(4.375);
  });

  it("returns an empty array for an empty BOM", () => {
    expect(requirementFor(10, [])).toEqual([]);
  });
});

describe("coverageFor", () => {
  it("returns floor(min(onHand / requiredPerUnit)) and the limiting material", () => {
    const cov = coverageFor([
      { materialId: "al", quantityPerUnit: 2.5, scrapPercent: 10, stockOnHand: 200 }, // 200 / 2.75 = 72.7 → 72
      { materialId: "bolt", quantityPerUnit: 4, scrapPercent: 0, stockOnHand: 1000 }, // 250
      { materialId: "paint", quantityPerUnit: 0.05, scrapPercent: 0, stockOnHand: 3 }, // 60
    ]);
    expect(cov.buildable).toBe(60);
    expect(cov.limitingMaterialId).toBe("paint");
    expect(cov.lines.map((l) => l.buildable)).toEqual([72, 250, 60]);
  });

  it("is exact on float-noisy divisions (2.75 / 0.275 = 10)", () => {
    const cov = coverageFor([{ materialId: "m", quantityPerUnit: 0.25, scrapPercent: 10, stockOnHand: 2.75 }]);
    expect(cov.buildable).toBe(10);
  });

  it("ignores lines that need nothing and returns null when nothing constrains", () => {
    expect(coverageFor([])).toEqual({ buildable: null, limitingMaterialId: null, lines: [] });
    const cov = coverageFor([{ materialId: "free", quantityPerUnit: 0, scrapPercent: 0, stockOnHand: 5 }]);
    expect(cov.buildable).toBeNull();
    expect(cov.limitingMaterialId).toBeNull();
    expect(cov.lines[0].buildable).toBeNull();
  });

  it("reports 0 when a material is out of stock and keeps the first limiting line on ties", () => {
    const cov = coverageFor([
      { materialId: "a", quantityPerUnit: 1, stockOnHand: 0 },
      { materialId: "b", quantityPerUnit: 1, stockOnHand: 0 },
    ]);
    expect(cov.buildable).toBe(0);
    expect(cov.limitingMaterialId).toBe("a");
  });
});
