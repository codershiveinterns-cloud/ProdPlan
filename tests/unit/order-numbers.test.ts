import { describe, expect, it } from "vitest";
import {
  formatOrderNumber,
  isReservedOrderNumber,
  isValidOrderNumber,
  normalizeOrderNumber,
  ORDER_NUMBER_FORMAT_MESSAGE,
  ORDER_NUMBER_RESERVED_MESSAGE,
  optionalOrderNumberSchema,
  orderNumberSchema,
  reservedOrderNumbers,
} from "@/lib/orders/numbers";

describe("formatOrderNumber", () => {
  it("zero-pads to 6 digits", () => {
    expect(formatOrderNumber(1)).toBe("SO-000001");
    expect(formatOrderNumber(123)).toBe("SO-000123");
    expect(formatOrderNumber(999999)).toBe("SO-999999");
    expect(formatOrderNumber(1234567)).toBe("SO-1234567");
  });

  it("rejects non-integers and negatives", () => {
    expect(() => formatOrderNumber(-1)).toThrow(RangeError);
    expect(() => formatOrderNumber(1.5)).toThrow(RangeError);
    expect(() => formatOrderNumber(Number.NaN)).toThrow(RangeError);
  });

  it("reservedOrderNumbers lists the numbers reserved by an increment", () => {
    expect(reservedOrderNumbers(5, 3)).toEqual(["SO-000003", "SO-000004", "SO-000005"]);
    expect(reservedOrderNumbers(1, 1)).toEqual(["SO-000001"]);
    expect(reservedOrderNumbers(10, 0)).toEqual([]);
    expect(() => reservedOrderNumbers(2, 3)).toThrow(RangeError);
  });
});

describe("normalizeOrderNumber / isReservedOrderNumber / isValidOrderNumber", () => {
  it("trims and upper-cases", () => {
    expect(normalizeOrderNumber("  ab-1 ")).toBe("AB-1");
    expect(normalizeOrderNumber("cust/2026.001")).toBe("CUST/2026.001");
    expect(normalizeOrderNumber("")).toBe("");
  });

  it("recognises the reserved automatic pattern case-insensitively", () => {
    expect(isReservedOrderNumber("SO-000123")).toBe(true);
    expect(isReservedOrderNumber("so-000123")).toBe(true);
    expect(isReservedOrderNumber(" SO-000123 ")).toBe(true);
    expect(isReservedOrderNumber("SO-00012")).toBe(false);
    expect(isReservedOrderNumber("SO-0001234")).toBe(false);
    expect(isReservedOrderNumber("PO-000123")).toBe(false);
    expect(isReservedOrderNumber("SO-ABC123")).toBe(false);
    expect(isReservedOrderNumber("SO000123")).toBe(false);
  });

  it("isValidOrderNumber applies both rules", () => {
    expect(isValidOrderNumber("abc")).toBe(true);
    expect(isValidOrderNumber("CUST/2026.001-A_B")).toBe(true);
    expect(isValidOrderNumber("ab")).toBe(false);
    expect(isValidOrderNumber("a".repeat(33))).toBe(false);
    expect(isValidOrderNumber("A B")).toBe(false);
    expect(isValidOrderNumber("A#1")).toBe(false);
    expect(isValidOrderNumber("SO-000001")).toBe(false);
    expect(isValidOrderNumber("")).toBe(false);
  });
});

describe("orderNumberSchema", () => {
  it("normalises then validates", () => {
    expect(orderNumberSchema.parse(" cust/2026.001 ")).toBe("CUST/2026.001");
    expect(orderNumberSchema.parse("abc")).toBe("ABC");
    expect(orderNumberSchema.parse("a".repeat(32))).toBe("A".repeat(32));
  });

  it.each([
    ["ab", ORDER_NUMBER_FORMAT_MESSAGE],
    ["a".repeat(33), ORDER_NUMBER_FORMAT_MESSAGE],
    ["A B", ORDER_NUMBER_FORMAT_MESSAGE],
    ["A#1", ORDER_NUMBER_FORMAT_MESSAGE],
    ["", ORDER_NUMBER_FORMAT_MESSAGE],
    ["SO-000001", ORDER_NUMBER_RESERVED_MESSAGE],
    ["so-999999", ORDER_NUMBER_RESERVED_MESSAGE],
  ])("rejects %j with the right message", (input, message) => {
    const r = orderNumberSchema.safeParse(input);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe(message);
  });

  it("rejects non-strings", () => {
    expect(orderNumberSchema.safeParse(123).success).toBe(false);
    expect(orderNumberSchema.safeParse(undefined).success).toBe(false);
  });
});

describe("optionalOrderNumberSchema", () => {
  it("treats blank as auto-number and validates anything else", () => {
    expect(optionalOrderNumberSchema.parse("")).toBeUndefined();
    expect(optionalOrderNumberSchema.parse("   ")).toBeUndefined();
    expect(optionalOrderNumberSchema.parse(undefined)).toBeUndefined();
    expect(optionalOrderNumberSchema.parse(null)).toBeUndefined();
    expect(optionalOrderNumberSchema.parse(" po-1 ")).toBe("PO-1");
    expect(optionalOrderNumberSchema.safeParse("SO-000002").success).toBe(false);
  });
});
