/**
 * CSV import row validation (docs/M1_SPEC.md §6.1 step 2).
 *
 * Columns: `order_number?, customer, product_sku, quantity, priority?, due_date, earliest_start_date?,
 * customer_po_ref?, notes?`. Cells are trimmed. Errors block the row; warnings (past due date) do not.
 * `validateImportRow` is pure — it never mutates the context sets; `validateImportRows` handles a whole file including
 * duplicate order numbers across rows.
 */
import { z } from "zod";
import { OrderPriority } from "@/generated/prisma/enums";
import { customerNameKey, normalizeCustomerName } from "@/lib/customers-normalize";
import { compareDateOnly } from "@/lib/dates";
import { normalizeOrderNumber, orderNumberSchema } from "@/lib/orders/numbers";
import { CUSTOMER_NAME_MAX } from "./customers";
import { emptyToUndefined, hasControlChars } from "./common";

export const IMPORT_REQUIRED_COLUMNS = ["customer", "product_sku", "quantity", "due_date"] as const;
export const IMPORT_OPTIONAL_COLUMNS = [
  "order_number",
  "priority",
  "earliest_start_date",
  "customer_po_ref",
  "notes",
] as const;
export const IMPORT_COLUMNS = [
  "order_number",
  "customer",
  "product_sku",
  "quantity",
  "priority",
  "due_date",
  "earliest_start_date",
  "customer_po_ref",
  "notes",
] as const;

export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_FILE_BYTES = 1_048_576;

/** Template served by `/api/orders/template`: header + 2 example rows ("Delete the example rows before importing"). */
export const IMPORT_TEMPLATE_EXAMPLES: Record<ImportColumn, string>[] = [
  {
    order_number: "",
    customer: "Bharat Motors",
    product_sku: "HB-200",
    quantity: "250",
    priority: "HIGH",
    due_date: "2026-10-15",
    earliest_start_date: "2026-10-01",
    customer_po_ref: "PO-4471",
    notes: "Pack in sets of 10",
  },
  {
    order_number: "CUST-2026-001",
    customer: "Bharat Motors",
    product_sku: "GX-40",
    quantity: "120.5",
    priority: "",
    due_date: "2026-10-20",
    earliest_start_date: "",
    customer_po_ref: "",
    notes: "",
  },
];

/** Header check for step 1: which required columns are missing and which columns are not recognised. */
export function checkImportHeaders(headers: readonly string[]): { missing: string[]; unknown: string[]; ok: boolean } {
  const set = new Set(headers);
  const missing = IMPORT_REQUIRED_COLUMNS.filter((c) => !set.has(c));
  const unknown = headers.filter((h) => !(IMPORT_COLUMNS as readonly string[]).includes(h));
  return { missing, unknown, ok: missing.length === 0 };
}

const PLAIN_DECIMAL_RE = /^\d+(\.\d{1,3})?$/;
const QUANTITY_MESSAGE = "quantity must be a plain number greater than 0 with at most 3 decimals (e.g. 12.5)";

function cell(v: unknown): unknown {
  return typeof v === "string" ? v.trim() : v === null ? undefined : v;
}

function optionalCell(label: string, max: number, multiline = false) {
  return z.preprocess(
    (v) => emptyToUndefined(cell(v)),
    z
      .string({ error: `${label} must be text` })
      .max(max, { error: `${label} must be at most ${max} characters` })
      .refine((s) => !hasControlChars(s, multiline), { error: `${label} contains invalid characters` })
      .optional(),
  );
}

export const importRowSchema = z.object({
  order_number: z.preprocess((v) => emptyToUndefined(cell(v)), orderNumberSchema.optional()),
  customer: z.preprocess(
    (v) => (typeof v === "string" ? normalizeCustomerName(v) : v),
    z
      .string({ error: "customer is required" })
      .min(1, { error: "customer is required" })
      .max(CUSTOMER_NAME_MAX, { error: `customer must be at most ${CUSTOMER_NAME_MAX} characters` })
      .refine((s) => !hasControlChars(s), { error: "customer contains invalid characters" }),
  ),
  product_sku: z.preprocess(
    cell,
    z
      .string({ error: "product_sku is required" })
      .min(1, { error: "product_sku is required" })
      .max(64, { error: "product_sku must be at most 64 characters" })
      .refine((s) => !hasControlChars(s), { error: "product_sku contains invalid characters" }),
  ),
  quantity: z.preprocess(
    cell,
    z
      .string({ error: QUANTITY_MESSAGE })
      .regex(PLAIN_DECIMAL_RE, { error: QUANTITY_MESSAGE })
      .transform((s) => Number(s))
      .refine((n) => n > 0, { error: QUANTITY_MESSAGE }),
  ),
  priority: z.preprocess(
    (v) => {
      const c = emptyToUndefined(cell(v));
      return typeof c === "string" ? c.toUpperCase().replace(/[\s-]+/g, "_") : c;
    },
    z.enum(OrderPriority, { error: "priority must be one of LOW, NORMAL, HIGH, URGENT" }).default("NORMAL"),
  ),
  due_date: z.preprocess(cell, z.iso.date({ error: "due_date must be a valid date in YYYY-MM-DD format" })),
  earliest_start_date: z.preprocess(
    (v) => emptyToUndefined(cell(v)),
    z.iso.date({ error: "earliest_start_date must be a valid date in YYYY-MM-DD format" }).optional(),
  ),
  customer_po_ref: optionalCell("customer_po_ref", 64),
  notes: optionalCell("notes", 2000, true),
});

export type ImportRowInput = z.infer<typeof importRowSchema>;

export type ImportRowContext = {
  /** `todayInTz(tenant.timezone)`. */
  today: string;
  /** Upper-cased order numbers already in the tenant. */
  existingOrderNumbers: ReadonlySet<string>;
  /** Upper-cased order numbers used by OTHER rows of the same file (the caller maintains this set). */
  fileOrderNumbers: ReadonlySet<string>;
  /** lower-cased sku → productId for ACTIVE products. */
  activeSkus: ReadonlyMap<string, string>;
  /** Optional: `customerNameKey(name)` of existing customers, to flag rows that will create a new customer. */
  existingCustomers?: ReadonlySet<string>;
};

export type ImportRowValues = {
  orderNumber: string | undefined;
  customerName: string;
  productSku: string;
  productId: string;
  quantity: number;
  priority: OrderPriority;
  dueDate: string;
  earliestStartDate: string | undefined;
  customerPoRef: string | undefined;
  notes: string | undefined;
  /** True when the customer does not exist yet (only when `ctx.existingCustomers` was provided). */
  isNewCustomer: boolean | null;
};

export type ImportRowResult = {
  ok: boolean;
  values: ImportRowValues | null;
  errors: string[];
  warnings: string[];
};

export const PAST_DUE_WARNING = "Due date is in the past — the order will be imported as overdue";

/** Validates one CSV row (raw string cells) against the schema and the tenant context. Pure. */
export function validateImportRow(raw: Record<string, string | undefined>, ctx: ImportRowContext): ImportRowResult {
  const parsed = importRowSchema.safeParse(raw);
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!parsed.success) {
    for (const issue of parsed.error.issues) errors.push(issue.message);
  }
  const d = parsed.success ? parsed.data : null;

  let productId: string | undefined;
  if (d) {
    productId = ctx.activeSkus.get(d.product_sku.toLowerCase());
    if (!productId) errors.push(`product_sku "${d.product_sku}" does not match an active product`);

    if (d.order_number !== undefined) {
      const n = normalizeOrderNumber(d.order_number);
      if (ctx.existingOrderNumbers.has(n)) errors.push(`order_number ${n} already exists`);
      else if (ctx.fileOrderNumbers.has(n)) errors.push(`order_number ${n} is used by another row in this file`);
    }

    if (d.earliest_start_date !== undefined && compareDateOnly(d.earliest_start_date, d.due_date) > 0) {
      errors.push("earliest_start_date must be on or before due_date");
    }

    if (compareDateOnly(d.due_date, ctx.today) < 0) warnings.push(PAST_DUE_WARNING);
  }

  if (errors.length > 0 || !d || !productId) {
    return { ok: false, values: null, errors, warnings };
  }

  const isNewCustomer = ctx.existingCustomers ? !ctx.existingCustomers.has(customerNameKey(d.customer)) : null;

  return {
    ok: true,
    values: {
      orderNumber: d.order_number,
      customerName: d.customer,
      productSku: d.product_sku,
      productId,
      quantity: d.quantity,
      priority: d.priority,
      dueDate: d.due_date,
      earliestStartDate: d.earliest_start_date,
      customerPoRef: d.customer_po_ref,
      notes: d.notes,
      isNewCustomer,
    },
    errors,
    warnings,
  };
}

export type ImportRowsResult = (ImportRowResult & { rowNumber: number })[];

/**
 * Validates a whole file. `rowNumber` is 1-based (data rows, header excluded). Order numbers that appear on more
 * than one row are flagged on every such row.
 */
export function validateImportRows(
  rows: readonly Record<string, string | undefined>[],
  ctx: Omit<ImportRowContext, "fileOrderNumbers">,
): ImportRowsResult {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const n = normalizeOrderNumber(row.order_number ?? "");
    if (n) counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  return rows.map((row, i) => {
    const n = normalizeOrderNumber(row.order_number ?? "");
    const duplicated = n !== "" && (counts.get(n) ?? 0) > 1;
    const fileOrderNumbers: ReadonlySet<string> = duplicated ? new Set([n]) : new Set();
    return { rowNumber: i + 1, ...validateImportRow(row, { ...ctx, fileOrderNumbers }) };
  });
}

/** Summary chips for the preview step. */
export function summarizeImport(results: ImportRowsResult): {
  total: number;
  valid: number;
  withErrors: number;
  withWarnings: number;
  newCustomers: number;
} {
  const newCustomerKeys = new Set<string>();
  let valid = 0;
  let withErrors = 0;
  let withWarnings = 0;
  for (const r of results) {
    if (r.ok) valid++;
    else withErrors++;
    if (r.warnings.length > 0) withWarnings++;
    if (r.ok && r.values?.isNewCustomer) newCustomerKeys.add(customerNameKey(r.values.customerName));
  }
  return { total: results.length, valid, withErrors, withWarnings, newCustomers: newCustomerKeys.size };
}
