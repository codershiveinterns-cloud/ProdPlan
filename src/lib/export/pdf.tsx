/**
 * PDF report builder (docs/M3_SPEC.md §8), using `@react-pdf/renderer` — pure JS, no native deps, runs fine in a
 * Vercel serverless (Node runtime) function. One shared `ReportDocument` (header: ProdPlan branding + tenant name
 * + generated-at + report title; a table; a footer with page numbers) reused by all four export kinds.
 *
 * Safety note: every cell is passed to `<Text>` as a plain string CHILD, never as markup (no
 * `dangerouslySetInnerHTML`-equivalent in react-pdf). React-pdf's layout engine does not parse cell text as
 * markup/HTML, so a customer name or order note containing `<`, `&`, quotes, etc. is rendered as literal text and
 * cannot inject into the document structure — unlike the CSV path, no separate escaping step is needed here.
 *
 * Colours approximate the app's oklch teal/stone tokens (`src/app/globals.css`) as hex, since PDF styling has no
 * oklch support.
 */
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { ReactElement } from "react";

import { formatDateTime } from "@/lib/format";
import type { AuditLogListRow } from "@/lib/audit-log-list";
import type { OrderListRow } from "@/lib/orders/list";

import type { ExportData, ProductionStatusExportRow, ScheduleExportRow } from "./query";
import { EXPORT_KIND_LABEL } from "./types";

const TEAL_900 = "#134e4a";
const TEAL_700 = "#0f766e";
const STONE_500 = "#78716c";
const STONE_200 = "#e7e5e4";
const STONE_50 = "#fafaf9";

const styles = StyleSheet.create({
  page: { paddingTop: 96, paddingBottom: 48, paddingHorizontal: 32, fontSize: 9, fontFamily: "Helvetica" },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 80,
    paddingHorizontal: 32,
    paddingTop: 24,
    borderBottomWidth: 2,
    borderBottomColor: TEAL_700,
  },
  brand: { fontSize: 14, fontWeight: 700, color: TEAL_900, marginBottom: 6 },
  title: { fontSize: 12, fontWeight: 700, color: "#1c1917" },
  meta: { fontSize: 8, color: STONE_500, marginTop: 2 },
  table: { display: "flex", flexDirection: "column", width: "100%" },
  tableRowHeader: {
    flexDirection: "row",
    backgroundColor: TEAL_900,
    paddingVertical: 5,
    paddingHorizontal: 3,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: STONE_200,
    paddingVertical: 4,
    paddingHorizontal: 3,
  },
  tableRowAlt: { backgroundColor: STONE_50 },
  th: { flex: 1, fontSize: 8, fontWeight: 700, color: "#ffffff", paddingHorizontal: 2 },
  td: { flex: 1, fontSize: 8, color: "#1c1917", paddingHorizontal: 2 },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 32,
    right: 32,
    fontSize: 8,
    color: STONE_500,
    textAlign: "center",
  },
});

export type ReportDocumentProps = {
  title: string;
  tenantName: string;
  generatedAt: string;
  headers: readonly string[];
  rows: readonly (readonly string[])[];
};

/** One shared table report layout, reused by all four export kinds (docs/M3_SPEC.md §8). */
export function ReportDocument({ title, tenantName, generatedAt, headers, rows }: ReportDocumentProps): ReactElement {
  return (
    <Document title={title}>
      <Page size="A4" orientation="landscape" style={styles.page} wrap>
        <View style={styles.header} fixed>
          <Text style={styles.brand}>ProdPlan</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.meta}>
            {tenantName} · Generated {generatedAt}
          </Text>
        </View>
        <View style={styles.table}>
          <View style={styles.tableRowHeader} fixed>
            {headers.map((h, i) => (
              <Text key={i} style={styles.th}>
                {h}
              </Text>
            ))}
          </View>
          {rows.map((cells, ri) => (
            <View key={ri} style={ri % 2 === 1 ? [styles.tableRow, styles.tableRowAlt] : styles.tableRow} wrap={false}>
              {cells.map((c, ci) => (
                <Text key={ci} style={styles.td}>
                  {c}
                </Text>
              ))}
            </View>
          ))}
        </View>
        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) => `${tenantName} · Page ${pageNumber} of ${totalPages}`}
        />
      </Page>
    </Document>
  );
}

function ordersRows(rows: readonly OrderListRow[]): string[][] {
  return rows.map((r) => [
    r.orderNumber,
    r.customerName,
    r.customerPoRef ?? "",
    r.productSku,
    String(r.quantity),
    r.priority,
    r.dueDate,
    r.status,
    r.deliveryRisk,
  ]);
}

function scheduleRows(rows: readonly ScheduleExportRow[], tz: string): string[][] {
  return rows.map((r) => [
    `${r.workCenterCode} · ${r.workCenterName}`,
    `${r.machineCode} · ${r.machineName}`,
    r.orderNumber,
    r.productSku,
    String(r.sequence),
    formatDateTime(r.plannedStartAt, tz),
    formatDateTime(r.plannedEndAt, tz),
    r.status,
    r.conflictSeverity ?? "—",
  ]);
}

function productionStatusRows(rows: readonly ProductionStatusExportRow[], tz: string): string[][] {
  return rows.map((r) => [
    `${r.machineCode} · ${r.machineName}`,
    r.orderNumber,
    r.productSku,
    String(r.quantity),
    formatDateTime(r.plannedStartAt, tz),
    formatDateTime(r.plannedEndAt, tz),
    r.status,
    r.overdue ? "Yes" : "No",
  ]);
}

function auditLogRows(rows: readonly AuditLogListRow[], tz: string): string[][] {
  return rows.map((r) => [
    formatDateTime(r.createdAt, tz),
    r.actorName ?? r.actorEmail ?? "System",
    r.action,
    r.entityType,
    r.entityLabel ?? r.entityId,
    r.summary,
  ]);
}

const HEADERS: Record<ExportData["kind"], readonly string[]> = {
  ORDERS: ["Order #", "Customer", "PO Ref", "Product SKU", "Qty", "Priority", "Due Date", "Status", "Risk"],
  SCHEDULE: ["Work Center", "Machine", "Order #", "Product SKU", "Seq", "Planned Start", "Planned End", "Status", "Conflict"],
  PRODUCTION_STATUS: ["Machine", "Order #", "Product SKU", "Qty", "Planned Start", "Planned End", "Status", "Overdue"],
  AUDIT_LOG: ["When", "Actor", "Action", "Entity Type", "Entity", "Summary"],
};

function toRows(data: ExportData, tz: string): string[][] {
  switch (data.kind) {
    case "ORDERS":
      return ordersRows(data.rows);
    case "SCHEDULE":
      return scheduleRows(data.rows, tz);
    case "PRODUCTION_STATUS":
      return productionStatusRows(data.rows, tz);
    case "AUDIT_LOG":
      return auditLogRows(data.rows, tz);
  }
}

/** Renders one export kind to a PDF buffer. */
export async function buildExportPdf(data: ExportData, opts: { tenantName: string; tz: string; generatedAt: Date }): Promise<Buffer> {
  const title = `${EXPORT_KIND_LABEL[data.kind]} export`;
  const doc = (
    <ReportDocument
      title={title}
      tenantName={opts.tenantName}
      generatedAt={formatDateTime(opts.generatedAt, opts.tz)}
      headers={HEADERS[data.kind]}
      rows={toRows(data, opts.tz)}
    />
  );
  return renderToBuffer(doc);
}
