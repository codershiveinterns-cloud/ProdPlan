import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Layers, ListOrdered } from "lucide-react";

import type { StockMovementType } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuditList, type AuditListEntry } from "@/components/data/AuditList";
import { DataTable, type DataTableColumn } from "@/components/data/DataTable";
import { EmptyState } from "@/components/data/EmptyState";
import { Pagination } from "@/components/data/Pagination";
import { PageHeader } from "@/components/layout/PageHeader";
import { describeAudit } from "@/lib/audit";
import { formatDateTime, formatNumber, formatPercent, formatQty, formatRelative, formatSignedQty } from "@/lib/format";
import { reorderState, toMaterialDTO } from "@/lib/materials/dto";
import { requirePagePermission } from "@/lib/materials/page-guard";
import { getMaterial, listLedger, materialAuditRows, whereUsed, type LedgerRow } from "@/lib/materials/queries";
import { describeReferences, isDeletable, materialReferences } from "@/lib/materials/service";
import { can } from "@/lib/rbac";
import { cn } from "@/lib/utils";

import { FlashToast } from "../_components/FlashToast";
import { MaterialActions } from "../_components/MaterialActions";
import { MovementDialog } from "../_components/MovementDialog";
import { MovementTypeBadge } from "../_components/MovementTypeBadge";
import { ReorderBadge } from "../_components/ReorderBadge";
import { flashMessage } from "../_components/flash";

type Params = { id: string };
type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  // getSession() is React.cache'd, so this shares the page's session lookup; only the material query is extra.
  const { db } = await requirePagePermission("materials:read");
  const { id } = await params;
  const material = await db.material.findUnique({ where: { id }, select: { code: true } });
  return { title: material ? `Material ${material.code}` : "Material" };
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function pageParam(value: string | string[] | undefined): number {
  const n = Number.parseInt(first(value) ?? "", 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/** Ledger row with every value pre-formatted for the tenant timezone. */
type LedgerViewRow = {
  id: string;
  when: string;
  relative: string;
  createdAtIso: string;
  type: StockMovementType;
  quantity: number;
  quantityLabel: string;
  balanceLabel: string;
  reference: string | null;
  note: string | null;
  by: string;
};

function toLedgerRow(row: LedgerRow, unit: string, tz: string, now: Date): LedgerViewRow {
  const quantity = Number(String(row.quantity));
  return {
    id: row.id,
    when: formatDateTime(row.createdAt, tz),
    relative: formatRelative(row.createdAt, now, tz),
    createdAtIso: row.createdAt.toISOString(),
    type: row.type,
    quantity,
    quantityLabel: formatSignedQty(quantity, unit),
    balanceLabel: formatQty(row.balanceAfter, unit),
    reference: row.reference,
    note: row.note,
    by: row.createdBy.name || row.createdBy.email,
  };
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={cn("text-right text-sm font-medium text-foreground", mono && "font-mono")}>{value}</dd>
    </div>
  );
}

export default async function MaterialDetailPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
}) {
  const { session, db } = await requirePagePermission("materials:read");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const material = await getMaterial(db, id);
  if (!material) notFound();

  const tz = session.tenant.timezone;
  const now = new Date();
  const dto = toMaterialDTO(material);
  const reorder = reorderState(material);
  const canWrite = can(session.user.role, "materials:write");
  const canMove = can(session.user.role, "stock:move");
  const canAdjust = can(session.user.role, "stock:adjust");

  const [ledger, used, auditRows, refs] = await Promise.all([
    listLedger(db, id, pageParam(sp.lpage)),
    whereUsed(db, id),
    materialAuditRows(db, id),
    materialReferences(db, id),
  ]);

  const onHandLabel = formatQty(dto.stockOnHand, dto.unit);
  const ledgerRows = ledger.rows.map((row) => toLedgerRow(row, dto.unit, tz, now));
  const lastMovement = ledgerRows[0] && ledger.page === 1 ? ledgerRows[0] : null;

  const auditEntries: AuditListEntry[] = auditRows.map((row) => {
    const { text, href } = describeAudit(row);
    const actor = row.actorName?.trim() || row.actorEmail?.trim() || "System";
    return {
      id: row.id,
      summary: text.startsWith(`${actor} `) ? text.slice(actor.length + 1) : text,
      actorName: row.actorName ?? row.actorEmail ?? null,
      createdAtIso: row.createdAt.toISOString(),
      relative: formatRelative(row.createdAt, now, tz),
      absolute: formatDateTime(row.createdAt, tz),
      href: row.entityType === "StockMovement" ? null : href,
    };
  });

  const ledgerColumns: DataTableColumn<LedgerViewRow>[] = [
    {
      key: "when",
      header: "When",
      priority: 1,
      render: (r) => (
        <time dateTime={r.createdAtIso} title={r.relative} className="whitespace-nowrap">
          {r.when}
        </time>
      ),
    },
    { key: "type", header: "Type", priority: 1, render: (r) => <MovementTypeBadge type={r.type} /> },
    {
      key: "quantity",
      header: "Quantity",
      priority: 1,
      className: "text-right tabular-nums",
      render: (r) => (
        <span className={cn("font-medium", r.quantity > 0 && "text-green-700", r.quantity < 0 && "text-red-700")}>
          {r.quantityLabel}
        </span>
      ),
    },
    {
      key: "balance",
      header: "Balance after",
      priority: 2,
      className: "text-right tabular-nums",
      render: (r) => r.balanceLabel,
    },
    {
      key: "reference",
      header: "Reference",
      priority: 3,
      className: "max-w-56",
      render: (r) => (
        <span className="flex flex-col">
          {r.reference ? <span className="truncate font-mono">{r.reference}</span> : null}
          {r.note ? (
            <span className="truncate text-xs text-muted-foreground" title={r.note}>
              {r.note}
            </span>
          ) : null}
          {!r.reference && !r.note ? <span className="text-muted-foreground">—</span> : null}
        </span>
      ),
    },
    { key: "by", header: "By", priority: 2, className: "max-w-40 truncate", render: (r) => r.by },
  ];

  const usedColumns: DataTableColumn<(typeof used)[number]>[] = [
    {
      key: "product",
      header: "Product",
      priority: 1,
      render: (u) => (
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link
            href={`/products/${u.productId}`}
            className="font-mono font-medium underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {u.sku}
          </Link>
          <span className="text-muted-foreground">·</span>
          <span>{u.productName}</span>
          {!u.productActive ? <Badge variant="outline">Inactive</Badge> : null}
        </span>
      ),
    },
    {
      key: "qty",
      header: `Qty per ${dto.unit === "pcs" ? "unit" : "product unit"}`,
      priority: 1,
      className: "text-right tabular-nums",
      render: (u) => `${formatQty(u.quantityPerUnit, dto.unit)} / ${u.productUnit}`,
    },
    {
      key: "scrap",
      header: "Scrap",
      priority: 2,
      className: "text-right tabular-nums",
      render: (u) => formatPercent(u.scrapPercent),
    },
    {
      key: "required",
      header: "Required / unit",
      priority: 2,
      className: "text-right tabular-nums",
      render: (u) => `${formatQty(u.requiredPerUnit, dto.unit)} / ${u.productUnit}`,
    },
    {
      key: "note",
      header: "Note",
      priority: 3,
      className: "max-w-56 truncate text-muted-foreground",
      render: (u) => <span title={u.note ?? undefined}>{u.note ?? ""}</span>,
    },
  ];

  const ledgerHref = (p: number) => `/materials/${dto.id}${p > 1 ? `?lpage=${p}` : ""}#ledger`;

  return (
    <>
      <FlashToast message={flashMessage(sp.flash)} />
      <PageHeader
        title={<span className="font-mono">{dto.code}</span>}
        description={dto.name}
        breadcrumbs={[{ label: "Materials", href: "/materials" }, { label: dto.code }]}
        meta={
          <>
            {!dto.isActive ? <Badge variant="outline">Inactive</Badge> : null}
            <ReorderBadge state={reorder} />
          </>
        }
        actions={
          canMove || canWrite ? (
            <>
              {canMove && dto.isActive ? (
                <MovementDialog
                  materialId={dto.id}
                  materialCode={dto.code}
                  unit={dto.unit}
                  onHandLabel={onHandLabel}
                  canAdjust={canAdjust}
                  defaultOpen={first(sp.move) === "1"}
                />
              ) : null}
              {canWrite ? (
                <MaterialActions
                  material={{ id: dto.id, code: dto.code, name: dto.name, isActive: dto.isActive }}
                  referencesLabel={describeReferences(refs)}
                  deletable={isDeletable(refs)}
                />
              ) : null}
            </>
          ) : undefined
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className={cn("lg:col-span-1", dto.isActive && reorder && "ring-amber-200")}>
          <CardHeader>
            <CardDescription>Stock on hand</CardDescription>
            <CardTitle className="text-3xl font-semibold tracking-tight tabular-nums">{onHandLabel}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              <Detail label="Reorder threshold" value={formatQty(dto.reorderThreshold, dto.unit)} />
              <Detail label="Reorder lead time" value={dto.reorderLeadTimeDays > 0 ? `${dto.reorderLeadTimeDays} days` : "—"} />
              <Detail label="Unit cost" value={dto.unitCost === null ? "—" : `${formatNumber(dto.unitCost, 2)} per ${dto.unit}`} />
              <Detail label="Supplier" value={dto.supplier ?? "—"} />
              <Detail
                label="Last movement"
                value={lastMovement ? `${lastMovement.quantityLabel} · ${lastMovement.relative}` : ledger.total > 0 ? "—" : "None yet"}
              />
              <Detail label="Status" value={dto.isActive ? "Active" : "Inactive"} />
            </dl>
            {reorder && dto.isActive ? (
              <p className="mt-3 text-sm text-amber-800">
                {reorder === "below" ? "Below" : "At"} the reorder threshold
                {dto.reorderLeadTimeDays > 0 ? ` — allow ${dto.reorderLeadTimeDays} days for delivery.` : "."}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Where used</CardTitle>
            <CardDescription>
              Products whose bill of materials includes this material. Required per unit includes the scrap allowance.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={usedColumns}
              rows={used}
              rowKey={(u) => u.bomItemId}
              caption={`Products using ${dto.code}, ${used.length}`}
              emptyState={
                <EmptyState
                  icon={Layers}
                  size="compact"
                  title="Not used in any BOM yet"
                  description="Add it to a product's bill of materials from the product page."
                />
              }
            />
          </CardContent>
        </Card>
      </div>

      <Card id="ledger" className="mt-6 scroll-mt-20">
        <CardHeader>
          <CardTitle>Ledger</CardTitle>
          <CardDescription>Every stock movement, newest first. Stock on hand only changes through this ledger.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <DataTable
            columns={ledgerColumns}
            rows={ledgerRows}
            rowKey={(r) => r.id}
            caption={`Stock movements for ${dto.code}, page ${ledger.page}`}
            emptyState={
              <EmptyState
                icon={ListOrdered}
                size="compact"
                title="No movements yet"
                description={
                  canMove && dto.isActive
                    ? "Record a receipt to bring stock on hand up from 0."
                    : "Stock movements will appear here."
                }
              />
            }
          />
          {ledger.total > 0 ? (
            <Pagination page={ledger.page} pageSize={ledger.pageSize} total={ledger.total} makeHref={ledgerHref} />
          ) : null}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Activity</CardTitle>
          <CardDescription>Master-data changes and recorded movements for this material.</CardDescription>
        </CardHeader>
        <CardContent>
          <AuditList entries={auditEntries} />
        </CardContent>
      </Card>
    </>
  );
}
