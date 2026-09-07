/** Unit: CSV template (header + 2 example rows, formula-safe) and the import batch row helpers. */
import { describe, expect, it } from "vitest";
import { BOM, parseCsv } from "@/lib/csv";
import { batchAgeMs, IMPORT_BATCH_MAX_AGE_MS, parseBatchRows } from "@/lib/orders/import";
import { buildOrdersTemplateCsv, TEMPLATE_FILE_NAME } from "@/lib/orders/template";
import { checkImportHeaders, IMPORT_COLUMNS, IMPORT_TEMPLATE_EXAMPLES } from "@/lib/validation/import-row";

describe("orders import template", () => {
  it("is a BOM-prefixed CSV with the 9 columns and exactly 2 example rows", () => {
    const csv = buildOrdersTemplateCsv();
    expect(TEMPLATE_FILE_NAME).toBe("orders-import-template.csv");
    expect(csv.startsWith(BOM)).toBe(true);
    const lines = csv.slice(1).split("\r\n").filter(Boolean);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(IMPORT_COLUMNS.join(","));
    const parsed = parseCsv(csv);
    expect(parsed.errors).toEqual([]);
    expect(checkImportHeaders(parsed.headers).ok).toBe(true);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toEqual(IMPORT_TEMPLATE_EXAMPLES[0]);
    expect(parsed.rows[1]).toEqual(IMPORT_TEMPLATE_EXAMPLES[1]);
  });

  it("round-trips through the parser without formula triggers", () => {
    const csv = buildOrdersTemplateCsv();
    for (const line of csv.slice(1).split("\r\n").slice(1)) {
      for (const cell of line.split(",")) expect(/^[=+\-@\t\r|%]/.test(cell)).toBe(false);
    }
  });
});

describe("import batch helpers", () => {
  it("parseBatchRows tolerates a null/garbage Json column", () => {
    expect(parseBatchRows(null)).toEqual([]);
    expect(parseBatchRows("x")).toEqual([]);
    expect(parseBatchRows([{ rowNumber: 1, raw: {}, ok: true, errors: [], warnings: [], values: null }, 3, null])).toHaveLength(1);
  });

  it("batchAgeMs measures against the batch creation time", () => {
    const createdAt = new Date("2026-09-07T10:00:00.000Z");
    expect(batchAgeMs({ createdAt }, new Date("2026-09-07T10:30:00.000Z"))).toBe(30 * 60 * 1000);
    expect(IMPORT_BATCH_MAX_AGE_MS).toBe(60 * 60 * 1000);
  });
});
