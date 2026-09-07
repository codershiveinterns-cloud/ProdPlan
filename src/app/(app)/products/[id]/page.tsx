import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, ArchiveRestore, Boxes, Pencil, Plus, Route, Trash2 } from "lucide-react";

import { AuditList, type AuditListEntry } from "@/components/data/AuditList";
import { ConfirmDialog } from "@/components/data/ConfirmDialog";
import { DataTable, type DataTableColumn } from "@/components/data/DataTable";
import { EmptyState } from "@/components/data/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime, formatInt, formatNumber, formatPercent, formatQty, formatRelative } from "@/lib/format";
import { requirePagePermission } from "@/lib/products/page-guard";
import {
  getProductDetail,
  listMaterialOptions,
  listProductActivity,
  listRoutingOptions,
  type BomLineDTO,
  type MachineOption,
  type MaterialOption,
  type OperationDTO,
  type ProductDetail,
  type WorkCenterOption,
} from "@/lib/products/queries";
import { can } from "@/lib/rbac";
import { canMove } from "@/lib/routing";

import { BomItemDialog } from "../_components/BomItemDialog";
import { FlashToast } from "../_components/FlashToast";
import { MoveButtons } from "../_components/MoveButtons";
import { OperationDialog } from "../_components/OperationDialog";
import {
  deleteProductAction,
  removeBomItemAction,
  removeOperationAction,
  setProductActiveAction,
} from "../actions";

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { db } = await requirePagePermission("products:read");
  const { id } = await params;
  const product = await db.product.findUnique({ where: { id }, select: { sku: true } });
  return { title: product ? product.sku : "Product" };
}

// ---------------------------------------------------------------------------------------------------------------
// BOM
// ---------------------------------------------------------------------------------------------------------------

function bomColumns(product: ProductDetail, canWrite: boolean, materials: MaterialOption[]): DataTableColumn<BomLineDTO>[] {
  const cols: DataTableColumn<BomLineDTO>[] = [
    {
      key: "material",
      header: "Material",
      priority: 1,
      render: (l) => (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link
            href={`/materials/${l.materialId}`}
            className="font-mono font-medium underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {l.materialCode}
          </Link>
          <span className="truncate">{l.materialName}</span>
          {!l.materialActive ? <Badge variant="outline">Inactive</Badge> : null}
          {l.isLimiting ? (
            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
              Limiting
            </Badge>
          ) : null}
        </span>
      ),
    },
    {
      key: "qty",
      header: "Qty / unit",
      priority: 1,
      className: "text-right tabular-nums",
      render: (l) => (
        <>
          {formatQty(l.quantityPerUnit, l.materialUnit)}
          <span className="text-muted-foreground"> / {product.unit}</span>
        </>
      ),
    },
    {
      key: "scrap",
      header: "Scrap %",
      priority: 3,
      className: "text-right tabular-nums",
      render: (l) => (l.scrapPercent === 0 ? <span className="text-muted-foreground">0%</span> : formatPercent(l.scrapPercent)),
    },
    {
      key: "required",
      header: "Required / unit",
      priority: 2,
      className: "text-right tabular-nums",
      render: (l) => formatQty(l.requiredPerUnit, l.materialUnit),
    },
    {
      key: "onHand",
      header: "On hand",
      priority: 2,
      className: "text-right tabular-nums",
      render: (l) => formatQty(l.onHand, l.materialUnit),
    },
    {
      key: "buildable",
      header: "Buildable",
      priority: 1,
      className: "text-right tabular-nums",
      render: (l) =>
        l.buildable === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className={l.isLimiting ? "font-semibold text-amber-800" : undefined}>{formatQty(l.buildable, product.unit)}</span>
        ),
    },
    {
      key: "note",
      header: "Note",
      priority: 3,
      className: "max-w-[16rem]",
      render: (l) => (l.note ? <span className="block truncate text-muted-foreground">{l.note}</span> : null),
    },
  ];
  if (canWrite) {
    cols.push({
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      priority: 1,
      className: "w-24 text-right",
      render: (l) => (
        <span className="flex justify-end gap-1">
          <BomItemDialog
            productId={product.id}
            productUnit={product.unit}
            materials={materials}
            item={l}
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label={`Edit ${l.materialCode}`}>
                <Pencil />
              </Button>
            }
          />
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label={`Remove ${l.materialCode} from the BOM`}>
                <Trash2 />
              </Button>
            }
            title={`Remove ${l.materialCode} from the BOM?`}
            description={`${product.sku} will no longer require ${l.materialName}. Material requirement and buildable figures update immediately.`}
            confirmLabel="Remove"
            destructive
            action={removeBomItemAction.bind(null, product.id, l.id)}
            successMessage="Material removed from the BOM"
          />
        </span>
      ),
    });
  }
  return cols;
}

function BomSection({
  product,
  canWrite,
  materials,
}: {
  product: ProductDetail;
  canWrite: boolean;
  materials: MaterialOption[];
}) {
  const { items, buildable, limitingMaterialId } = product.bom;
  const limiting = items.find((l) => l.materialId === limitingMaterialId) ?? null;
  const addTrigger =
    canWrite && materials.length > 0 ? (
      <BomItemDialog
        productId={product.id}
        productUnit={product.unit}
        materials={materials}
        trigger={
          <Button variant="outline">
            <Plus />
            Add material
          </Button>
        }
      />
    ) : canWrite ? (
      <Button variant="outline" asChild>
        <Link href={`/materials/new?return=${encodeURIComponent(`/products/${product.id}`)}`}>No materials yet — Create one</Link>
      </Button>
    ) : null;

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>Bill of materials</CardTitle>
            <CardDescription>
              Quantities are in the material&apos;s unit per one {product.unit} of {product.sku}. Required / unit includes scrap.
            </CardDescription>
          </div>
          {addTrigger}
        </div>
        <div className="mt-3 flex flex-col gap-0.5 rounded-lg bg-muted/60 px-3 py-2">
          <p className="text-sm">
            <span className="text-muted-foreground">Buildable from stock: </span>
            {buildable === null ? (
              <span className="font-semibold">—</span>
            ) : (
              <span className={buildable === 0 ? "text-base font-semibold text-amber-800" : "text-base font-semibold"}>
                {formatQty(buildable, product.unit)}
              </span>
            )}
            {limiting ? (
              <span className="text-muted-foreground">
                {" "}
                · limited by <span className="font-mono text-foreground">{limiting.materialCode}</span>
              </span>
            ) : null}
          </p>
          <p className="text-xs text-muted-foreground">
            vs unallocated stock on hand (does not net other open orders)
          </p>
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-0 [&>div]:rounded-none [&>div]:ring-0">
        <DataTable
          columns={bomColumns(product, canWrite, materials)}
          rows={items}
          rowKey={(l) => l.id}
          rowClassName={(l) => (l.isLimiting ? "bg-amber-50 hover:bg-amber-100/60" : undefined)}
          caption={`Bill of materials for ${product.sku}, ${items.length} lines`}
          emptyState={
            <EmptyState
              size="compact"
              icon={Boxes}
              title="No materials in this BOM yet"
              description={`Add the materials one ${product.unit} of ${product.sku} consumes.`}
              action={addTrigger ?? undefined}
            />
          }
        />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------------------------------------------

function routingColumns(
  product: ProductDetail,
  canWrite: boolean,
  options: { workCenters: WorkCenterOption[]; machines: MachineOption[] },
): DataTableColumn<OperationDTO>[] {
  const rows = product.operations;
  const cols: DataTableColumn<OperationDTO>[] = [
    {
      key: "seq",
      header: "Seq",
      priority: 1,
      className: "w-16 text-right font-mono tabular-nums",
      render: (op) => op.sequence,
    },
    {
      key: "workCenter",
      header: "Work center",
      priority: 1,
      render: (op) => (
        <span className="flex items-center gap-2">
          <span className="font-mono font-medium">{op.workCenterCode}</span>
          <span className="truncate">{op.workCenterName}</span>
        </span>
      ),
    },
    {
      key: "machine",
      header: "Fixed machine",
      priority: 2,
      render: (op) =>
        op.machineId ? (
          <span className="flex items-center gap-2">
            <Link
              href={`/machines/${op.machineId}`}
              className="font-mono underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {op.machineCode}
            </Link>
            <span className="truncate text-muted-foreground">{op.machineName}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">Any machine</span>
        ),
    },
    {
      key: "setup",
      header: "Setup min",
      priority: 2,
      className: "text-right tabular-nums",
      render: (op) => formatInt(op.setupMinutes),
    },
    {
      key: "run",
      header: `Run min / ${product.unit}`,
      priority: 1,
      className: "text-right tabular-nums",
      render: (op) => formatNumber(op.runMinutesPerUnit, 3),
    },
  ];
  if (canWrite) {
    cols.push(
      {
        key: "order",
        header: "Order",
        priority: 1,
        className: "w-28",
        render: (op) => (
          <MoveButtons
            productId={product.id}
            operationId={op.id}
            label={`step ${op.sequence} ${op.workCenterCode}`}
            canMoveUp={canMove(rows, op.id, "up")}
            canMoveDown={canMove(rows, op.id, "down")}
          />
        ),
      },
      {
        key: "actions",
        header: <span className="sr-only">Actions</span>,
        priority: 1,
        className: "w-24 text-right",
        render: (op) => (
          <span className="flex justify-end gap-1">
            <OperationDialog
              productId={product.id}
              productUnit={product.unit}
              workCenters={options.workCenters}
              machines={options.machines}
              operation={op}
              trigger={
                <Button variant="ghost" size="icon-sm" aria-label={`Edit step ${op.sequence} ${op.workCenterCode}`}>
                  <Pencil />
                </Button>
              }
            />
            <ConfirmDialog
              trigger={
                <Button variant="ghost" size="icon-sm" aria-label={`Remove step ${op.sequence} ${op.workCenterCode}`}>
                  <Trash2 />
                </Button>
              }
              title={`Remove step ${op.sequence} · ${op.workCenterCode}?`}
              description="The remaining steps are renumbered 10, 20, 30 …"
              confirmLabel="Remove"
              destructive
              action={removeOperationAction.bind(null, product.id, op.id)}
              successMessage="Routing step removed"
            />
          </span>
        ),
      },
    );
  }
  return cols;
}

function RoutingSection({
  product,
  canWrite,
  options,
}: {
  product: ProductDetail;
  canWrite: boolean;
  options: { workCenters: WorkCenterOption[]; machines: MachineOption[] };
}) {
  const addTrigger =
    canWrite && options.workCenters.length > 0 ? (
      <OperationDialog
        productId={product.id}
        productUnit={product.unit}
        workCenters={options.workCenters}
        machines={options.machines}
        trigger={
          <Button variant="outline">
            <Plus />
            Add step
          </Button>
        }
      />
    ) : canWrite ? (
      <Button variant="outline" asChild>
        <Link href={`/work-centers?return=${encodeURIComponent(`/products/${product.id}`)}`}>No work centers yet — Create one</Link>
      </Button>
    ) : null;

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>Routing</CardTitle>
            <CardDescription>
              Work centers this product passes through, in order. Duration on a machine = (setup + qty × run / unit) × 100 / efficiency %.
            </CardDescription>
          </div>
          {addTrigger}
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-0 [&>div]:rounded-none [&>div]:ring-0">
        <DataTable
          columns={routingColumns(product, canWrite, options)}
          rows={product.operations}
          rowKey={(op) => op.id}
          caption={`Routing for ${product.sku}, ${product.operations.length} steps`}
          emptyState={
            <EmptyState
              size="compact"
              icon={Route}
              title="No routing steps yet"
              description="Add the work centers this product passes through, in order."
              action={addTrigger ?? undefined}
            />
          }
        />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------------------------

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { session, db } = await requirePagePermission("products:read");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const product = await getProductDetail(db, id);
  if (!product) notFound();

  const canWrite = can(session.user.role, "products:write");
  const tz = session.tenant.timezone;
  const referencedMachineIds = product.operations.map((op) => op.machineId).filter((m): m is string => m !== null);
  const [materials, routingOptions, activityRows] = await Promise.all([
    canWrite ? listMaterialOptions(db) : Promise.resolve([] as MaterialOption[]),
    canWrite
      ? listRoutingOptions(db, referencedMachineIds)
      : Promise.resolve({ workCenters: [] as WorkCenterOption[], machines: [] as MachineOption[] }),
    listProductActivity(db, product.id),
  ]);

  const activity: AuditListEntry[] = activityRows.map((r) => ({
    id: r.id,
    summary: r.summary,
    actorName: r.actorName ?? r.actorEmail,
    createdAtIso: r.createdAt.toISOString(),
    relative: formatRelative(r.createdAt, undefined, tz),
    absolute: formatDateTime(r.createdAt, tz),
    // Every row is about this product (or a child without its own page), so nothing to link to from here.
    href: null,
  }));

  const orderNote =
    product.orderCount > 0
      ? `Used by ${formatInt(product.orderCount)} order${product.orderCount === 1 ? "" : "s"}`
      : "Not used by any order yet";

  return (
    <>
      <FlashToast flash={first(sp.flash)} />
      <PageHeader
        title={<span className="font-mono">{product.sku}</span>}
        description={product.name}
        breadcrumbs={[{ label: "Products", href: "/products" }, { label: product.sku }]}
        meta={product.isActive ? undefined : <Badge variant="outline">Inactive</Badge>}
        actions={
          canWrite ? (
            <>
              <Button variant="outline" asChild>
                <Link href={`/products/${product.id}/edit`}>
                  <Pencil />
                  Edit
                </Link>
              </Button>
              {product.isActive ? (
                <ConfirmDialog
                  trigger={
                    <Button variant="outline">
                      <Archive />
                      Deactivate
                    </Button>
                  }
                  title={`Deactivate ${product.sku}?`}
                  description="The product is hidden from order forms and CSV imports. Existing orders keep referencing it, and you can reactivate it any time."
                  confirmLabel="Deactivate"
                  action={setProductActiveAction.bind(null, product.id, false)}
                  successMessage={`Product ${product.sku} deactivated`}
                />
              ) : (
                <ConfirmDialog
                  trigger={
                    <Button variant="outline">
                      <ArchiveRestore />
                      Reactivate
                    </Button>
                  }
                  title={`Reactivate ${product.sku}?`}
                  description="The product becomes available in order forms and CSV imports again."
                  confirmLabel="Reactivate"
                  action={setProductActiveAction.bind(null, product.id, true)}
                  successMessage={`Product ${product.sku} reactivated`}
                />
              )}
              {product.orderCount === 0 ? (
                <ConfirmDialog
                  trigger={
                    <Button variant="destructive">
                      <Trash2 />
                      Delete
                    </Button>
                  }
                  title={`Delete ${product.sku}?`}
                  description={`This removes the product together with its ${product.bom.items.length} BOM line${product.bom.items.length === 1 ? "" : "s"} and ${product.operations.length} routing step${product.operations.length === 1 ? "" : "s"}. This cannot be undone.`}
                  confirmLabel="Delete product"
                  destructive
                  action={deleteProductAction.bind(null, product.id)}
                  successMessage="Product deleted"
                />
              ) : null}
            </>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-6">
        <Card size="sm">
          <CardContent>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-muted-foreground">Name</dt>
                <dd className="font-medium">{product.name}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Unit</dt>
                <dd className="font-medium">{product.unit}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Orders</dt>
                <dd className="font-medium">{orderNote}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Created</dt>
                <dd className="font-medium">{formatDateTime(product.createdAt, tz)}</dd>
              </div>
              {product.description ? (
                <div className="sm:col-span-2 lg:col-span-4">
                  <dt className="text-muted-foreground">Description</dt>
                  <dd className="whitespace-pre-line">{product.description}</dd>
                </div>
              ) : null}
            </dl>
            {canWrite && product.orderCount > 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Products referenced by orders cannot be deleted — use Deactivate to hide them from pickers.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <BomSection product={product} canWrite={canWrite} materials={materials} />
        <RoutingSection product={product} canWrite={canWrite} options={routingOptions} />

        <Card>
          <CardHeader className="border-b">
            <CardTitle>Activity</CardTitle>
            <CardDescription>Changes to this product, its BOM and its routing.</CardDescription>
          </CardHeader>
          <CardContent>
            <AuditList entries={activity} emptyTitle="No changes recorded yet" />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
