/**
 * CSV parsing (papaparse) and RFC 4180 writing with a formula-injection guard (docs/M1_SPEC.md §1, §6.1).
 *
 * `parseCsv` strips a UTF-8 BOM, normalises headers (trim, lowercase, whitespace → underscore) and returns every data
 * row as `Record<header, string>` (missing cells become "").
 * `toCsv` writes CRLF-terminated lines with a leading BOM (so Excel opens UTF-8 correctly), quotes per RFC 4180, and
 * prefixes cells that start with `= + - @ TAB CR | %` with an apostrophe so spreadsheets never evaluate them.
 */
import Papa from "papaparse";

export type CsvParseError = { row: number | null; code: string; message: string };

export type ParsedCsv = {
  /** Normalised header names in file order (duplicates are suffixed by papaparse, e.g. `customer_1`). */
  headers: string[];
  /** One record per data row; every header key is present (missing cells are ""). */
  rows: Record<string, string>[];
  /** Structural problems (quote/field-count mismatches). `row` is the 1-based DATA row number when known. */
  errors: CsvParseError[];
};

export const BOM = "\uFEFF";

/** `" Order Number "` → `order_number`. */
export function normalizeHeader(h: string): string {
  return h.replace(BOM, "").trim().toLowerCase().replace(/\s+/g, "_");
}

const EXTRA_KEY = "__parsed_extra";

export function parseCsv(text: string): ParsedCsv {
  const clean = text.startsWith(BOM) ? text.slice(1) : text;
  const result = Papa.parse<Record<string, string | undefined>>(clean, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: normalizeHeader,
  });
  const headers = (result.meta.fields ?? []).filter((h) => h !== EXTRA_KEY);
  const rows = result.data.map((raw) => {
    const row: Record<string, string> = {};
    for (const h of headers) {
      const v = raw[h];
      row[h] = v === undefined || v === null ? "" : String(v);
    }
    return row;
  });
  const errors: CsvParseError[] = result.errors
    // "Unable to auto-detect delimiting character" is emitted for tiny inputs and is not a data problem.
    .filter((e) => e.code !== "UndetectableDelimiter")
    .map((e) => ({
      row: typeof e.row === "number" ? e.row + 1 : null,
      code: String(e.code ?? e.type ?? "ParseError"),
      message: e.message,
    }));
  return { headers, rows, errors };
}

/** Characters that make a spreadsheet interpret a cell as a formula (OWASP CSV injection list). */
const FORMULA_TRIGGERS = new Set(["=", "+", "-", "@", "\t", "\r", "|", "%"]);

export type CsvCell = string | number | boolean | Date | null | undefined | { toString(): string };

/** Applies the formula-injection guard to a string cell: `=SUM(A1)` → `'=SUM(A1)`. */
export function guardFormula(s: string): string {
  return s.length > 0 && FORMULA_TRIGGERS.has(s[0]) ? `'${s}` : s;
}

/**
 * Stringifies a cell. JS numbers are written as-is (a negative number cannot be a formula); every other value goes
 * through the injection guard.
 */
export function formatCsvCell(v: CsvCell): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString();
  return guardFormula(String(v));
}

const NEEDS_QUOTES = /[",\r\n]/;

/** RFC 4180 quoting: wrap in quotes when the cell contains a quote, comma or line break; double embedded quotes. */
export function escapeCsvField(s: string): string {
  if (s === "") return s;
  if (NEEDS_QUOTES.test(s) || s.startsWith(" ") || s.endsWith(" ")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export type CsvRow = Record<string, CsvCell> | CsvCell[];

/**
 * Builds a CSV document: BOM + header line + one line per row, CRLF line endings, trailing CRLF.
 * Rows may be arrays (positional) or objects keyed by header.
 */
export function toCsv(headers: readonly string[], rows: readonly CsvRow[]): string {
  const line = (cells: readonly CsvCell[]) => cells.map((c) => escapeCsvField(formatCsvCell(c))).join(",");
  const out: string[] = [line(headers)];
  for (const row of rows) {
    const cells: CsvCell[] = Array.isArray(row)
      ? headers.map((_, i) => row[i])
      : headers.map((h) => (row as Record<string, CsvCell>)[h]);
    out.push(line(cells));
  }
  return BOM + out.join("\r\n") + "\r\n";
}
