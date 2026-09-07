import { describe, expect, it } from "vitest";
import { BOM, escapeCsvField, formatCsvCell, guardFormula, normalizeHeader, parseCsv, toCsv } from "@/lib/csv";

describe("parseCsv", () => {
  it("strips the BOM, normalises headers and returns string records", () => {
    const text = `${BOM} Order Number ,Customer,Product SKU\r\nA-1,Acme,HB-200\r\n`;
    const r = parseCsv(text);
    expect(r.headers).toEqual(["order_number", "customer", "product_sku"]);
    expect(r.rows).toEqual([{ order_number: "A-1", customer: "Acme", product_sku: "HB-200" }]);
    expect(r.errors).toEqual([]);
  });

  it("handles quoted fields, embedded commas/quotes/newlines and skips blank lines", () => {
    const text = 'customer,notes\n"Acme, Inc.","He said ""hi""\nnext line"\n\n\nBeta,\n';
    const r = parseCsv(text);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toEqual({ customer: "Acme, Inc.", notes: 'He said "hi"\nnext line' });
    expect(r.rows[1]).toEqual({ customer: "Beta", notes: "" });
  });

  it("fills missing cells with '' and reports field-count mismatches with 1-based data rows", () => {
    const r = parseCsv("a,b,c\n1,2\n1,2,3,4\n");
    expect(r.headers).toEqual(["a", "b", "c"]);
    expect(r.rows[0]).toEqual({ a: "1", b: "2", c: "" });
    expect(r.rows[1]).toEqual({ a: "1", b: "2", c: "3" });
    expect(r.rows[1]).not.toHaveProperty("__parsed_extra");
    const rows = r.errors.map((e) => e.row).sort();
    expect(rows).toEqual([1, 2]);
    expect(r.errors.every((e) => typeof e.message === "string" && e.code.length > 0)).toBe(true);
  });

  it("does not report the undetectable-delimiter notice as an error and tolerates an empty file", () => {
    expect(parseCsv("customer\nAcme\n").errors).toEqual([]);
    const empty = parseCsv("");
    expect(empty.rows).toEqual([]);
    expect(empty.headers).toEqual([]);
  });

  it("normalizeHeader collapses whitespace and case", () => {
    expect(normalizeHeader("  Due   Date ")).toBe("due_date");
    expect(normalizeHeader(`${BOM}Customer`)).toBe("customer");
    expect(normalizeHeader("earliest_start_date")).toBe("earliest_start_date");
  });
});

describe("toCsv", () => {
  it("writes BOM + CRLF lines with RFC 4180 quoting", () => {
    const csv = toCsv(["a", "b"], [{ a: "plain", b: 'say "hi"' }, { a: "x,y", b: "line1\nline2" }, ["arr1", null]]);
    expect(csv.startsWith(BOM)).toBe(true);
    const body = csv.slice(1);
    expect(body).toBe('a,b\r\nplain,"say ""hi"""\r\n"x,y","line1\nline2"\r\narr1,\r\n');
    expect(body.endsWith("\r\n")).toBe(true);
  });

  it.each(["=", "+", "-", "@", "\t", "\r", "|", "%"])("guards cells starting with %j against formula injection", (ch) => {
    const cell = `${ch}SUM(A1:A9)`;
    expect(guardFormula(cell)).toBe(`'${cell}`);
    const csv = toCsv(["v"], [[cell]]);
    const line = csv.slice(1).split("\r\n")[1];
    // The apostrophe is the first character of the (possibly quoted) field.
    expect(line.startsWith("'") || line.startsWith('"\'')).toBe(true);
    expect(line).toContain(`'${ch}SUM`);
  });

  it("does not guard JS numbers (negative numbers stay numeric) but guards numeric-looking strings", () => {
    expect(formatCsvCell(-5)).toBe("-5");
    expect(formatCsvCell(12.5)).toBe("12.5");
    expect(formatCsvCell("-5")).toBe("'-5");
    expect(formatCsvCell("+91 98765")).toBe("'+91 98765");
    expect(formatCsvCell("hello")).toBe("hello");
    expect(formatCsvCell("")).toBe("");
  });

  it("stringifies null/undefined/boolean/Date/Decimal-like values", () => {
    expect(formatCsvCell(null)).toBe("");
    expect(formatCsvCell(undefined)).toBe("");
    expect(formatCsvCell(true)).toBe("true");
    expect(formatCsvCell(false)).toBe("false");
    expect(formatCsvCell(new Date("2026-09-05T00:00:00.000Z"))).toBe("2026-09-05T00:00:00.000Z");
    expect(formatCsvCell(new Date("nope"))).toBe("");
    expect(formatCsvCell(Number.NaN)).toBe("");
    expect(formatCsvCell({ toString: () => "12.500" })).toBe("12.500");
  });

  it("escapeCsvField quotes only when needed", () => {
    expect(escapeCsvField("abc")).toBe("abc");
    expect(escapeCsvField("a,b")).toBe('"a,b"');
    expect(escapeCsvField('a"b')).toBe('"a""b"');
    expect(escapeCsvField("a\r\nb")).toBe('"a\r\nb"');
    expect(escapeCsvField(" lead")).toBe('" lead"');
    expect(escapeCsvField("")).toBe("");
  });

  it("round-trips through parseCsv (object rows and array rows)", () => {
    const headers = ["order_number", "customer", "quantity", "notes"];
    const rows = [
      { order_number: "A-1", customer: "Acme, Inc.", quantity: 12.5, notes: 'multi\nline "quoted"' },
      ["B-2", "Beta", 3, ""],
    ];
    const parsed = parseCsv(toCsv(headers, rows));
    expect(parsed.headers).toEqual(headers);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toEqual([
      { order_number: "A-1", customer: "Acme, Inc.", quantity: "12.5", notes: 'multi\nline "quoted"' },
      { order_number: "B-2", customer: "Beta", quantity: "3", notes: "" },
    ]);
  });

  it("guards header cells too", () => {
    const csv = toCsv(["=cmd", "ok"], []);
    expect(csv.slice(1)).toBe("'=cmd,ok\r\n");
  });
});
