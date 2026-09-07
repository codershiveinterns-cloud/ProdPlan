/**
 * CSV import of orders (docs/M1_SPEC.md §6.1 "CSV import").
 *
 * Step 2 `previewImport()`: parse + validate every row, store the result in `ImportBatch { PENDING, rows }` and
 * return the batch id. The preview page renders from the batch, so the client never posts row data again.
 * Step 3 `commitImport(batchId)`: re-validate every row against the CURRENT database state, then run the binding
 * commit algorithm in ONE transaction (timeout 20 s, maxWait 5 s) with a bounded number of statements:
 *   (1) customer.createMany({ skipDuplicates }) for distinct new names + one findMany to map names → ids;
 *   (2) one findMany of active products by sku, one of existing order numbers (part of the re-validation);
 *   (3) reserve N automatic order numbers with one tenant.update increment (+ one existence check);
 *   (4) order.createManyAndReturn in chunks of 500;
 *   (5) auditLog.createMany (one CREATE per order + one IMPORT), chunked;
 *   (6) update the batch to COMMITTED with importedCount.
 * ≈ 17 statements for 2,000 rows. `discardImport()` marks a PENDING batch DISCARDED.
 */
import type { ImportBatch, Prisma } from "@/generated/prisma/client";
import { audit, auditContext } from "@/lib/audit";
import type { Session } from "@/lib/auth/guards";
import { parseCsv } from "@/lib/csv";
import { findCustomersByNames } from "@/lib/customers";
import { customerNameKey } from "@/lib/customers-normalize";
import { fromDateOnly, todayInTz } from "@/lib/dates";
import type { TenantDb, TenantTx } from "@/lib/db";
import { DomainError, NotFoundError } from "@/lib/errors";
import { normalizeOrderNumber } from "@/lib/orders/numbers";
import { reserveOrderNumbers, withOrderNumberRetry } from "@/lib/orders/reserve";
import {
  checkImportHeaders,
  IMPORT_COLUMNS,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
  summarizeImport,
  validateImportRows,
  type ImportRowContext,
  type ImportRowValues,
  type ImportRowsResult,
} from "@/lib/validation/import-row";

export const IMPORT_BATCH_MAX_AGE_MS = 60 * 60 * 1000;
export const IMPORT_CHUNK_SIZE = 500;
export const IMPORT_TRANSACTION_OPTIONS = { timeout: 20_000, maxWait: 5_000 } as const;

/** One stored preview row: the raw cells (kept for re-validation) plus the validation outcome. */
export type ImportBatchRow = {
  rowNumber: number;
  raw: Record<string, string>;
  ok: boolean;
  errors: string[];
  warnings: string[];
  values: ImportRowValues | null;
  /** Set on commit: the order number this row produced, or null when it was skipped. */
  orderNumber?: string | null;
};

export type ImportSummary = ReturnType<typeof summarizeImport>;

export type ImportPreview = {
  batchId: string;
  fileName: string;
  summary: ImportSummary;
};

export type ImportCommitResult = {
  batchId: string;
  importedCount: number;
  /** Rows that were valid at preview time but failed re-validation at commit time. */
  skippedCount: number;
  errorCount: number;
  newCustomers: string[];
  orderNumbers: string[];
};

export type ImportFile = { name: string; size: number; text(): Promise<string> };

/** JSON round-trip so `undefined` values vanish and the payload satisfies Prisma's Json input type. */
function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function toBatchRows(raws: readonly Record<string, string>[], results: ImportRowsResult): ImportBatchRow[] {
  return results.map((r, i) => ({
    rowNumber: r.rowNumber,
    raw: raws[i] ?? {},
    ok: r.ok,
    errors: r.errors,
    warnings: r.warnings,
    values: r.values,
  }));
}

/** Reads the stored rows back (defensively — the column is Json). */
export function parseBatchRows(rows: unknown): ImportBatchRow[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter((r): r is ImportBatchRow => typeof r === "object" && r !== null && "rowNumber" in r);
}

function rawCells(row: ImportBatchRow): Record<string, string> {
  const out: Record<string, string> = {};
  for (const col of IMPORT_COLUMNS) out[col] = row.raw?.[col] ?? "";
  return out;
}

/** Tenant context needed by `validateImportRows`: active SKUs, existing numbers for the file's manual numbers, existing customers. */
async function buildRowContext(
  tx: TenantTx | TenantDb,
  raws: readonly Record<string, string>[],
  tz: string,
): Promise<Omit<ImportRowContext, "fileOrderNumbers">> {
  const manualNumbers = [...new Set(raws.map((r) => normalizeOrderNumber(r.order_number ?? "")).filter(Boolean))];
  const names = raws.map((r) => r.customer ?? "");
  const [products, existingOrders, customers] = await Promise.all([
    tx.product.findMany({ where: { isActive: true }, select: { id: true, sku: true } }),
    manualNumbers.length
      ? tx.order.findMany({ where: { orderNumber: { in: manualNumbers } }, select: { orderNumber: true } })
      : Promise.resolve([] as { orderNumber: string }[]),
    findCustomersByNames(tx, names),
  ]);
  return {
    today: todayInTz(tz),
    activeSkus: new Map(products.map((p) => [p.sku.toLowerCase(), p.id])),
    existingOrderNumbers: new Set(existingOrders.map((o) => o.orderNumber)),
    existingCustomers: new Set(customers.keys()),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Step 2: preview
// ---------------------------------------------------------------------------------------------------------------

export async function previewImport(db: TenantDb, session: Session, file: ImportFile): Promise<ImportPreview> {
  const fileName = file.name.trim() || "orders.csv";
  if (!/\.csv$/i.test(fileName)) throw new DomainError("Choose a .csv file");
  if (file.size > MAX_IMPORT_FILE_BYTES) throw new DomainError("The file is larger than 1 MB. Split it and import in parts.");
  if (file.size === 0) throw new DomainError("The file is empty");

  const text = await file.text();
  const parsed = parseCsv(text);
  const headerCheck = checkImportHeaders(parsed.headers);
  if (!headerCheck.ok) {
    throw new DomainError(
      `Missing required column${headerCheck.missing.length === 1 ? "" : "s"}: ${headerCheck.missing.join(", ")}. Download the template to see the expected header.`,
    );
  }
  if (parsed.rows.length === 0) throw new DomainError("The file has no data rows. Delete the example rows before importing? Then add your orders.");
  if (parsed.rows.length > MAX_IMPORT_ROWS) {
    throw new DomainError(
      `The file has ${parsed.rows.length.toLocaleString("en-IN")} data rows; the limit is ${MAX_IMPORT_ROWS.toLocaleString("en-IN")} per import.`,
    );
  }

  const raws = parsed.rows.map((r) => {
    const out: Record<string, string> = {};
    for (const col of IMPORT_COLUMNS) out[col] = r[col] ?? "";
    return out;
  });
  const ctx = await buildRowContext(db, raws, session.tenant.timezone);
  const results = validateImportRows(raws, ctx);

  // Structural CSV problems (field-count mismatches) are attached to the affected rows as errors.
  for (const e of parsed.errors) {
    const target = e.row !== null ? results[e.row - 1] : undefined;
    if (target) {
      target.errors.push(`CSV: ${e.message}`);
      target.ok = false;
      target.values = null;
    }
  }

  const summary = summarizeImport(results);
  const batch = await db.importBatch.create({
    data: {
      tenantId: session.tenant.id,
      fileName: fileName.slice(0, 200),
      status: "PENDING",
      rows: toJson(toBatchRows(raws, results)),
      rowCount: summary.total,
      validCount: summary.valid,
      errorCount: summary.withErrors,
      createdById: session.user.id,
    },
    select: { id: true },
  });
  return { batchId: batch.id, fileName, summary };
}

// ---------------------------------------------------------------------------------------------------------------
// Batch access
// ---------------------------------------------------------------------------------------------------------------

export type LoadedBatch = ImportBatch & { parsedRows: ImportBatchRow[] };

/** The actor's own batch, or null. */
export async function loadImportBatch(db: TenantDb, session: Session, batchId: string): Promise<LoadedBatch | null> {
  const batch = await db.importBatch.findFirst({ where: { id: batchId, createdById: session.user.id } });
  if (!batch) return null;
  return { ...batch, parsedRows: parseBatchRows(batch.rows) };
}

export function batchAgeMs(batch: Pick<ImportBatch, "createdAt">, now: Date = new Date()): number {
  return now.getTime() - batch.createdAt.getTime();
}

function assertCommittable(batch: ImportBatch | null, session: Session): asserts batch is ImportBatch {
  if (!batch) throw new NotFoundError("This import preview no longer exists. Upload the file again.");
  if (batch.createdById !== session.user.id) throw new DomainError("Only the user who uploaded this file can import it.");
  if (batch.status !== "PENDING") {
    throw new DomainError(
      batch.status === "COMMITTED" ? "This file has already been imported." : "This import was discarded. Upload the file again.",
    );
  }
  if (batchAgeMs(batch) > IMPORT_BATCH_MAX_AGE_MS) {
    throw new DomainError("This preview is older than an hour. Upload the file again to import it.");
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Step 3: commit
// ---------------------------------------------------------------------------------------------------------------

export async function commitImport(db: TenantDb, session: Session, batchId: string): Promise<ImportCommitResult> {
  const ctx = await auditContext(session);
  const batch = await db.importBatch.findUnique({ where: { id: batchId } });
  assertCommittable(batch, session);
  const storedRows = parseBatchRows(batch.rows);
  const raws = storedRows.map(rawCells);
  const previewValid = storedRows.filter((r) => r.ok).length;
  const tenantId = session.tenant.id;

  return withOrderNumberRetry(() =>
    db.$transaction(async (tx) => {
      // Re-validate against the current state (3 reads: products, existing numbers, existing customers).
      const rowCtx = await buildRowContext(tx, raws, session.tenant.timezone);
      const results = validateImportRows(raws, rowCtx);
      const valid = results.filter((r) => r.ok && r.values !== null);
      const values = valid.map((r) => r.values!);

      // (1) new customers: distinct by case-insensitive key, created with the first typed casing.
      const newNames = new Map<string, string>();
      for (const v of values) {
        const key = customerNameKey(v.customerName);
        if (!rowCtx.existingCustomers?.has(key) && !newNames.has(key)) newNames.set(key, v.customerName);
      }
      if (newNames.size > 0) {
        await tx.customer.createMany({
          data: [...newNames.values()].map((name) => ({ tenantId, name })),
          skipDuplicates: true,
        });
      }
      const customersByKey = await findCustomersByNames(
        tx,
        values.map((v) => v.customerName),
      );

      // (3) automatic numbers for rows without one, in file order.
      const autoRows = values.filter((v) => v.orderNumber === undefined);
      const autoNumbers = await reserveOrderNumbers(tx, tenantId, autoRows.length);

      // (4) orders in chunks of 500.
      let autoIndex = 0;
      const orderData = values.map((v) => {
        const customer = customersByKey.get(customerNameKey(v.customerName));
        if (!customer) throw new DomainError(`Customer "${v.customerName}" could not be created`);
        const orderNumber = v.orderNumber ?? autoNumbers[autoIndex++]!;
        return {
          tenantId,
          orderNumber,
          customerId: customer.id,
          productId: v.productId,
          quantity: v.quantity,
          priority: v.priority,
          dueDate: fromDateOnly(v.dueDate),
          earliestStartDate: v.earliestStartDate ? fromDateOnly(v.earliestStartDate) : null,
          status: "QUEUED" as const,
          customerPoRef: v.customerPoRef ?? null,
          notes: v.notes ?? null,
          importBatchId: batchId,
          createdById: session.user.id,
        };
      });
      const created: { id: string; orderNumber: string }[] = [];
      for (const part of chunk(orderData, IMPORT_CHUNK_SIZE)) {
        const rows = await tx.order.createManyAndReturn({ data: part, select: { id: true, orderNumber: true } });
        created.push(...rows);
      }
      const idByNumber = new Map(created.map((o) => [o.orderNumber, o.id]));
      const orderNumbers = orderData.map((o) => o.orderNumber);

      // (5) audit rows: one CREATE per order + one IMPORT.
      const auditRows = orderData.map((o) => ({
        tenantId,
        actorUserId: ctx.actor?.id ?? null,
        actorEmail: ctx.actor?.email ?? null,
        actorName: ctx.actor?.name ?? null,
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
        entityType: "Order",
        entityId: idByNumber.get(o.orderNumber) ?? "",
        entityLabel: o.orderNumber,
        action: "CREATE" as const,
        summary: `Order ${o.orderNumber} created via CSV import`,
        changedFields: [] as string[],
        after: toJson({
          orderNumber: o.orderNumber,
          customerId: o.customerId,
          productId: o.productId,
          quantity: o.quantity,
          priority: o.priority,
          dueDate: o.dueDate.toISOString().slice(0, 10),
          earliestStartDate: o.earliestStartDate ? o.earliestStartDate.toISOString().slice(0, 10) : null,
          status: o.status,
          customerPoRef: o.customerPoRef,
          notes: o.notes,
          importBatchId: batchId,
        }),
      }));
      for (const part of chunk(auditRows, IMPORT_CHUNK_SIZE)) {
        await tx.auditLog.createMany({ data: part });
      }
      const skippedCount = previewValid - values.length;
      const newCustomers = [...newNames.values()];
      await audit(tx, ctx, {
        entityType: "ImportBatch",
        entityId: batchId,
        entityLabel: batch.fileName,
        action: "IMPORT",
        after: {
          fileName: batch.fileName,
          rowCount: results.length,
          importedCount: values.length,
          skippedCount,
          errorCount: results.length - values.length,
          newCustomers,
          orderNumbers,
        },
        summary: `Imported ${values.length} order${values.length === 1 ? "" : "s"} from ${batch.fileName}`,
      });

      // (6) batch → COMMITTED with the re-validation outcome per row.
      const finalRows: ImportBatchRow[] = results.map((r, i) => ({
        rowNumber: r.rowNumber,
        raw: raws[i]!,
        ok: r.ok,
        errors: r.errors,
        warnings: r.warnings,
        values: r.values,
        orderNumber: r.ok && r.values ? (r.values.orderNumber ?? null) : null,
      }));
      // Fill the automatic numbers into the stored rows so the result page can list them.
      let k = 0;
      for (const row of finalRows) {
        if (row.ok && row.values && row.values.orderNumber === undefined) row.orderNumber = autoNumbers[k++] ?? null;
      }
      await tx.importBatch.update({
        where: { id: batchId },
        data: {
          status: "COMMITTED",
          importedCount: values.length,
          validCount: values.length,
          errorCount: results.length - values.length,
          rows: toJson(finalRows),
        },
      });

      return {
        batchId,
        importedCount: values.length,
        skippedCount,
        errorCount: results.length - values.length,
        newCustomers,
        orderNumbers,
      };
    }, IMPORT_TRANSACTION_OPTIONS),
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Discard
// ---------------------------------------------------------------------------------------------------------------

export async function discardImport(db: TenantDb, session: Session, batchId: string): Promise<void> {
  const batch = await db.importBatch.findFirst({ where: { id: batchId, createdById: session.user.id } });
  if (!batch) throw new NotFoundError("This import preview no longer exists.");
  if (batch.status !== "PENDING") return;
  await db.importBatch.update({ where: { id: batchId }, data: { status: "DISCARDED" } });
}
