import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Download, Info, Users } from "lucide-react";

import { EmptyState } from "@/components/data/EmptyState";
import { Pagination } from "@/components/data/Pagination";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { customerNameKey } from "@/lib/customers-normalize";
import { formatDate, formatQty } from "@/lib/format";
import { requirePagePermission } from "@/lib/orders/guard";
import { batchAgeMs, IMPORT_BATCH_MAX_AGE_MS, loadImportBatch, type ImportBatchRow } from "@/lib/orders/import";
import { cn } from "@/lib/utils";
import { MAX_IMPORT_ROWS } from "@/lib/validation/import-row";

import { FlashToast } from "../_components/FlashToast";
import { ImportActions } from "../_components/ImportActions";
import { ImportUploadForm } from "../_components/ImportUploadForm";

export const metadata: Metadata = { title: "Import orders" };

const PREVIEW_PAGE_SIZE = 100;

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

const STEPS = ["Upload", "Preview", "Done"] as const;

function Steps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol className="mb-6 flex flex-wrap items-center gap-2 text-sm" aria-label="Import steps">
      {STEPS.map((label, index) => {
        const n = (index + 1) as 1 | 2 | 3;
        const state = n < current ? "done" : n === current ? "current" : "todo";
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              aria-current={state === "current" ? "step" : undefined}
              className={cn(
                "flex size-7 items-center justify-center rounded-full text-xs font-semibold",
                state === "done" && "bg-green-100 text-green-700",
                state === "current" && "bg-primary text-primary-foreground",
                state === "todo" && "bg-muted text-muted-foreground",
              )}
            >
              {n}
            </span>
            <span className={cn(state === "current" ? "font-medium text-foreground" : "text-muted-foreground")}>{label}</span>
            {index < STEPS.length - 1 ? <span aria-hidden="true" className="mx-1 h-px w-6 bg-border" /> : null}
          </li>
        );
      })}
    </ol>
  );
}

function Chip({ tone, children }: { tone: "ok" | "error" | "warn" | "info"; children: React.ReactNode }) {
  const cls = {
    ok: "border-green-200 bg-green-50 text-green-700",
    error: "border-red-200 bg-red-50 text-red-700",
    warn: "border-amber-200 bg-amber-50 text-amber-800",
    info: "border-slate-200 bg-slate-100 text-slate-700",
  }[tone];
  return (
    <Badge variant="outline" className={cn("h-7 px-2.5 text-sm", cls)}>
      {children}
    </Badge>
  );
}

function summarize(rows: ImportBatchRow[]) {
  const newCustomers = new Set<string>();
  let valid = 0;
  let withErrors = 0;
  let withWarnings = 0;
  for (const r of rows) {
    if (r.ok) valid++;
    else withErrors++;
    if (r.warnings.length > 0) withWarnings++;
    if (r.ok && r.values?.isNewCustomer) newCustomers.add(customerNameKey(r.values.customerName));
  }
  return { valid, withErrors, withWarnings, newCustomers: newCustomers.size };
}

export default async function ImportOrdersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { session, db } = await requirePagePermission("orders:write");
  const sp = await searchParams;
  const batchId = first(sp.batch).trim();
  const errorsOnly = first(sp.errorsOnly) === "1";
  const pageRaw = Number.parseInt(first(sp.page), 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  const batch = batchId ? await loadImportBatch(db, session, batchId) : null;
  const expired = batch?.status === "PENDING" && batchAgeMs(batch) > IMPORT_BATCH_MAX_AGE_MS;

  // ---- Step 3: result ------------------------------------------------------------------------------------------
  if (batch && batch.status === "COMMITTED") {
    const rows = batch.parsedRows;
    const imported = rows.filter((r) => r.orderNumber);
    const skipped = rows.filter((r) => !r.orderNumber);
    return (
      <>
        <PageHeader title="Import orders" breadcrumbs={[{ label: "Orders", href: "/orders" }, { label: "Import CSV" }]} />
        <Steps current={3} />
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-green-600" aria-hidden="true" />
              Imported {batch.importedCount.toLocaleString("en-IN")} order{batch.importedCount === 1 ? "" : "s"} from {batch.fileName}
            </CardTitle>
            <CardDescription>
              {skipped.length > 0
                ? `${skipped.length.toLocaleString("en-IN")} row${skipped.length === 1 ? " was" : "s were"} skipped because ${skipped.length === 1 ? "it" : "they"} had errors.`
                : "Every valid row was imported."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <Chip tone="ok">{imported.length.toLocaleString("en-IN")} imported</Chip>
              {skipped.length > 0 ? <Chip tone="error">{skipped.length.toLocaleString("en-IN")} skipped</Chip> : null}
            </div>
            {imported.length > 0 ? (
              <p className="text-sm text-muted-foreground">
                Order numbers:{" "}
                <span className="font-mono text-foreground">
                  {imported
                    .slice(0, 12)
                    .map((r) => r.orderNumber)
                    .join(", ")}
                  {imported.length > 12 ? ` … +${imported.length - 12} more` : ""}
                </span>
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href={`/orders?batch=${encodeURIComponent(batch.id)}&status=all`}>View imported orders</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/orders/import">Import another file</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </>
    );
  }

  // ---- Step 2: preview ------------------------------------------------------------------------------------------
  if (batch && batch.status === "PENDING" && !expired) {
    const rows = batch.parsedRows;
    const summary = summarize(rows);
    const visible = errorsOnly ? rows.filter((r) => !r.ok) : rows;
    const total = visible.length;
    const pageRows = visible.slice((page - 1) * PREVIEW_PAGE_SIZE, page * PREVIEW_PAGE_SIZE);
    const previewHref = (patch: { page?: number; errorsOnly?: boolean }) => {
      const q = new URLSearchParams({ batch: batch.id });
      const eo = patch.errorsOnly ?? errorsOnly;
      if (eo) q.set("errorsOnly", "1");
      const p = patch.page ?? 1;
      if (p > 1) q.set("page", String(p));
      return `/orders/import?${q.toString()}`;
    };
    return (
      <>
        <PageHeader
          title="Import orders"
          description={`${batch.fileName} · ${batch.rowCount.toLocaleString("en-IN")} data row${batch.rowCount === 1 ? "" : "s"}`}
          breadcrumbs={[{ label: "Orders", href: "/orders" }, { label: "Import CSV" }]}
        />
        <Steps current={2} />
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            <Chip tone="ok">{summary.valid.toLocaleString("en-IN")} valid</Chip>
            <Chip tone={summary.withErrors > 0 ? "error" : "info"}>{summary.withErrors.toLocaleString("en-IN")} with errors</Chip>
            <Chip tone={summary.withWarnings > 0 ? "warn" : "info"}>{summary.withWarnings.toLocaleString("en-IN")} warnings</Chip>
            <Chip tone="info">
              <Users className="size-3.5" aria-hidden="true" />
              {summary.newCustomers.toLocaleString("en-IN")} new customer{summary.newCustomers === 1 ? "" : "s"}
            </Chip>
          </div>
          <Button variant={errorsOnly ? "secondary" : "outline"} asChild aria-pressed={errorsOnly}>
            <Link href={previewHref({ errorsOnly: !errorsOnly, page: 1 })}>{errorsOnly ? "Show all rows" : "Errors only"}</Link>
          </Button>
        </div>
        {summary.withErrors > 0 ? (
          <Alert className="mb-4">
            <Info aria-hidden="true" />
            <AlertTitle>Rows with errors are skipped</AlertTitle>
            <AlertDescription>
              Fix them in your spreadsheet and upload again, or import the valid rows now and add the rest later. Past due dates are
              only a warning: those orders import as overdue.
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
          {pageRows.length === 0 ? (
            <div className="p-6">
              <EmptyState title="No rows with errors" description="Every row in this file is valid." size="compact" />
            </div>
          ) : (
            <Table>
              <caption className="sr-only">Import preview, {total} rows</caption>
              <TableHeader className="bg-muted">
                <TableRow className="hover:bg-transparent">
                  <TableHead scope="col" className="w-14">Row</TableHead>
                  <TableHead scope="col">Order #</TableHead>
                  <TableHead scope="col">Customer</TableHead>
                  <TableHead scope="col" className="hidden md:table-cell">SKU</TableHead>
                  <TableHead scope="col" className="hidden text-right md:table-cell">Qty</TableHead>
                  <TableHead scope="col" className="hidden lg:table-cell">Priority</TableHead>
                  <TableHead scope="col">Due</TableHead>
                  <TableHead scope="col">Errors / warnings</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((r) => (
                  <TableRow key={r.rowNumber} className={cn(!r.ok && "bg-red-50/60", r.ok && r.warnings.length > 0 && "bg-amber-50/60")}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{r.rowNumber}</TableCell>
                    <TableCell className="font-mono">{r.raw.order_number?.trim() || <span className="text-muted-foreground">auto</span>}</TableCell>
                    <TableCell className="max-w-48 truncate">
                      {r.raw.customer}
                      {r.values?.isNewCustomer ? <Badge variant="outline" className="ml-1.5">New</Badge> : null}
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs md:table-cell">{r.raw.product_sku}</TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">{r.values ? formatQty(r.values.quantity) : r.raw.quantity}</TableCell>
                    <TableCell className="hidden lg:table-cell">{r.values?.priority ?? (r.raw.priority || "NORMAL")}</TableCell>
                    <TableCell>{r.values ? formatDate(r.values.dueDate) : r.raw.due_date}</TableCell>
                    <TableCell className="whitespace-normal">
                      {r.errors.length === 0 && r.warnings.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <ul className="flex flex-col gap-0.5 text-xs">
                          {r.errors.map((e) => (
                            <li key={e} className="text-red-700">{e}</li>
                          ))}
                          {r.warnings.map((w) => (
                            <li key={w} className="flex items-start gap-1 text-amber-800">
                              <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                              {w}
                            </li>
                          ))}
                        </ul>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
        <Pagination className="mt-4" page={page} pageSize={PREVIEW_PAGE_SIZE} total={total} makeHref={(p) => previewHref({ page: p })} />
        <div className="mt-6">
          <ImportActions batchId={batch.id} validCount={summary.valid} />
        </div>
      </>
    );
  }

  // ---- Step 1: upload -------------------------------------------------------------------------------------------
  return (
    <>
      <FlashToast />
      <PageHeader
        title="Import orders"
        description="Upload a CSV exported from your ERP or spreadsheet. You will see a full preview before anything is imported."
        breadcrumbs={[{ label: "Orders", href: "/orders" }, { label: "Import CSV" }]}
        actions={
          <Button variant="outline" asChild>
            <a href="/api/orders/template" download>
              <Download data-icon="inline-start" />
              Download template
            </a>
          </Button>
        }
      />
      <Steps current={1} />
      {batchId && !batch ? (
        <Alert className="mb-4">
          <Info aria-hidden="true" />
          <AlertTitle>That import preview is no longer available</AlertTitle>
          <AlertDescription>Upload the file again to continue.</AlertDescription>
        </Alert>
      ) : null}
      {expired ? (
        <Alert className="mb-4">
          <Info aria-hidden="true" />
          <AlertTitle>That preview is older than an hour</AlertTitle>
          <AlertDescription>Previews expire after 60 minutes so stale data is never imported. Upload the file again.</AlertDescription>
        </Alert>
      ) : null}
      {batch?.status === "DISCARDED" ? (
        <Alert className="mb-4">
          <Info aria-hidden="true" />
          <AlertTitle>That import was discarded</AlertTitle>
          <AlertDescription>Nothing was imported. Upload the file again when you are ready.</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>1. Choose your file</CardTitle>
            <CardDescription>
              Start from the template: it has the header row and 2 example rows. Delete the example rows before importing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ImportUploadForm />
          </CardContent>
        </Card>
        <Card className="self-start">
          <CardHeader>
            <CardTitle>Rules</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex list-disc flex-col gap-1.5 pl-4 text-sm text-muted-foreground">
              <li>
                Required columns: <code className="font-mono text-foreground">customer</code>, <code className="font-mono text-foreground">product_sku</code>,{" "}
                <code className="font-mono text-foreground">quantity</code>, <code className="font-mono text-foreground">due_date</code>. Headers are matched
                case-insensitively.
              </li>
              <li>
                <code className="font-mono text-foreground">order_number</code> is optional (blank = automatic SO-number). Custom numbers: 3–32 characters, letters,
                digits and <code className="font-mono">. _ / -</code>; must be unique.
              </li>
              <li>
                <code className="font-mono text-foreground">product_sku</code> must match an active product. Unknown customers are created automatically.
              </li>
              <li>
                <code className="font-mono text-foreground">quantity</code> &gt; 0 with up to 3 decimals. <code className="font-mono text-foreground">priority</code>: LOW,
                NORMAL (default), HIGH or URGENT.
              </li>
              <li>
                Dates as <code className="font-mono text-foreground">YYYY-MM-DD</code>. A past due date is a warning (the order imports as overdue);{" "}
                <code className="font-mono text-foreground">earliest_start_date</code> must not be after the due date.
              </li>
              <li>
                <code className="font-mono text-foreground">customer_po_ref</code> up to 64 characters, <code className="font-mono text-foreground">notes</code> up to
                2,000.
              </li>
              <li>Up to {MAX_IMPORT_ROWS.toLocaleString("en-IN")} data rows and 1 MB per file. Rows with errors are skipped; the rest can be imported.</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
