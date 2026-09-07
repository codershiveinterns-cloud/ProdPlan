# ProdPlan UI kit (M1)

Reference for every shared component under `src/components/**`, with the three page recipes module authors need
(list page, form page, dialog form). Product rules come from `docs/M1_SPEC.md` §5; this document only describes the
building blocks. Everything here is light-theme only for M1.

## 0. Ground rules

* **Density.** `Button`, `Input`, `SelectTrigger`, `Combobox`, `DateInput`, `DateTimeInput`, `UnitInput` are 44 px
  (`h-11`) by default. The 36 px variant (`size="sm"` / `inputSize="sm"`) is only for dense desktop tables. Icon
  buttons: `size="icon"` (44), `"icon-sm"` (36), `"icon-xs"` (32, row kebabs). `Checkbox` is a 20 px box with a
  44 px hit area. Table rows are 48 px. Dropdown / Select / Command items are ≥ 40 px.
* **Server first.** `DataTable`, `Pagination`, `PageHeader`, `Breadcrumbs`, badges, `DueHint`, `EmptyState`,
  `StatCard`, `AuditList`, `FormField`, `FieldErrors`, `DateInput`, `UnitInput` are Server Components (no hooks). The
  client islands are `SearchInput`, `FilterBar`, `ConfirmDialog`, `Combobox`, `DateTimeInput`, `SubmitButton`,
  `ToastOnResult`, and the shell menus.
* **Formatting happens in Server Components.** Pass strings (`formatDate`, `formatDateTime`, `formatRelative`,
  `formatQty` from `src/lib/format.ts`) down to components; never format a `Date` inside a client component.
  `today` for `DueHint` is always `todayInTz(session.tenant.timezone)`.
* **Colour semantics** live in one place each: `StatusBadge`, `PriorityBadge`, `MachineStatusBadge`,
  `DowntimeTypeBadge`, `DueHint`. Pages must not re-declare status colours. Each badge module also exports its
  label map (`ORDER_STATUS_META`, `ORDER_STATUSES`, `orderStatusLabel()`, …) for Select options.
* **Tokens** (`src/app/globals.css`): slate surfaces (`bg-background` page, `bg-card` panels), indigo `primary`,
  `muted`/`muted-foreground` for secondary text, `destructive`, plus semantic `success`/`warning`/`info`/`danger`.
  Fonts: Inter via `next/font` (`font-sans`), system monospace (`font-mono`) for codes and order numbers.
* Imports: `import { X } from "@/components/<group>/<X>"`. `cn` comes from `@/lib/utils`.

## 1. Layout (`src/components/layout`)

### `AppShell`
```tsx
<AppShell tenantName={session.tenant.name} user={{ name, email, role }} logoutAction={logoutAction}>
  {children}
</AppShell>
```
| Prop | Type | Notes |
|---|---|---|
| `tenantName` | `string` | Shown in the sidebar brand and the topbar. |
| `user` | `{ name: string; email: string; role: Role }` | `Role` from `@/generated/prisma/enums`. |
| `logoutAction` | `(formData: FormData) => void \| Promise<void>` | A zero-arg Server Action `logoutAction()` is assignable. Submitted by "Sign out". |
| `children` | `ReactNode` | Page content, rendered inside `<main id="main">` with a `max-w-7xl` container. |

Sidebar is fixed at ≥ lg (`w-64`), a left `Sheet` below (trigger in the topbar). Groups Plan / Master data /
Settings from `layout/nav.ts` (`NAV_GROUPS`, `NEW_MENU_ITEMS`, `isActivePath()`), filtered with `can(role, permission)`.
Active item = pathname prefix. Topbar: menu trigger (< lg), tenant name, `NewMenu` ("+ New": Order, Customer,
Product, Material, Machine — hidden when the role can create nothing), `UserMenu` (name, email, `ROLE_LABELS` badge,
Profile, Sign out). A "Skip to content" link is the first focusable element.

Used by `src/app/(app)/layout.tsx` (auth-core) after `requireSession()`.

### `PageHeader`
```tsx
<PageHeader
  title="Orders"
  description="Customer orders and their production status."
  breadcrumbs={[{ label: "Orders", href: "/orders" }, { label: order.orderNumber }]}
  meta={<><StatusBadge status={order.status} /><PriorityBadge priority={order.priority} /></>}
  actions={<Button asChild><Link href="/orders/new">New order</Link></Button>}
/>
```
`title: ReactNode`, `description?`, `breadcrumbs?: { label; href? }[]` (render for depth ≥ 2), `meta?` (badges after
the title), `actions?` (wrap below the title on narrow screens), `className?`.

### `Breadcrumbs`
`<Breadcrumbs items={[{ label: "Orders", href: "/orders" }, { label: "SO-000123" }]} />` — `nav[aria-label=Breadcrumb]`,
last item `aria-current="page"`. `PageHeader` renders it for you.

### `StatusPage`, `PageSkeleton`
Used by `app/forbidden.tsx`, `not-found.tsx`, `error.tsx`, `loading.tsx`. `PageSkeleton({ rows? })` is also handy as
a segment `loading.tsx` for list pages.

## 2. Data (`src/components/data`)

### `DataTable<T>` (Server Component)
```tsx
<DataTable
  columns={[
    { key: "number", header: "Order #", priority: 1, sortKey: "orderNumber",
      render: (o) => <Link href={`/orders/${o.id}`} className="font-mono font-medium">{o.orderNumber}</Link> },
    { key: "customer", header: "Customer", priority: 2, render: (o) => o.customerName },
    { key: "due", header: "Due", priority: 1, sortKey: "dueDate",
      render: (o) => <><span>{o.dueDateLabel}</span> <DueHint dueDate={o.dueDate} today={today} /></> },
    { key: "actions", header: <span className="sr-only">Actions</span>, priority: 1, className: "w-12 text-right",
      render: (o) => <OrderRowMenu order={o} /> },
  ]}
  rows={orders}
  rowKey={(o) => o.id}
  sort={{ sort, dir, makeHref: (s, d) => listHref({ ...params, sort: s, dir: d, page: 1 }) }}
  rowClassName={(m) => (m.belowThreshold ? "bg-amber-50 hover:bg-amber-100/60" : undefined)}
  caption={`Orders, ${orders.length} of ${total}`}
  emptyState={<EmptyState … />}
/>
```
| Prop | Notes |
|---|---|
| `columns[]` | `{ key; header; priority: 1 \| 2 \| 3; className?; render(row); sortKey? }`. Priority 3 → `hidden lg:table-cell`, 2 → `hidden md:table-cell`, 1 always. First column is sticky. |
| `rows`, `rowKey(row)` | Plain DTOs (already `toPlain()`ed). |
| `emptyState` | Rendered inside the table frame when `rows` is empty. |
| `sort?` | `{ sort, dir, makeHref(sort, dir) }` — headers with `sortKey` become links; clicking the active column flips the direction; `aria-sort` is set. |
| `rowClassName?(row)` | Row tint (materials at/below reorder). |
| `caption?` | Screen-reader caption. |

No client handlers: row actions go in a kebab `DropdownMenu` (`size="icon-xs"` trigger) rendered by the page.
Wide tables scroll inside the frame; the body never scrolls horizontally.

### `Pagination`
`<Pagination page={page} pageSize={25} total={total} makeHref={(p) => listHref({ ...params, page: p })} />`
Shows "Showing 26–50 of 312", previous/next (44 px), a windowed page list (first, last, current ±1). Helper
`pageWindow(page, totalPages)` is exported.

### `SearchInput` (client)
`<SearchInput placeholder="Search orders, customers, SKUs…" defaultValue={q} />`
Debounced 300 ms; writes `?q=` (prop `name`, default `"q"`), deletes `page`, keeps every other parameter, Enter
applies immediately, clear button removes `q`.

### `FilterBar` (client)
```tsx
<FilterBar activeCount={activeFilterCount} clearHref="/orders">
  <FormField label="Status" htmlFor="status">
    <select name="status" id="status" defaultValue={status} className="h-11 rounded-lg border border-input bg-card px-3 text-sm">…</select>
  </FormField>
  <FormField label="Due from" htmlFor="dueFrom"><DateInput name="dueFrom" defaultValue={dueFrom} /></FormField>
  <label className="flex h-11 items-center gap-2 text-sm"><Checkbox name="includeInactive" value="1" defaultChecked={includeInactive} /> Include inactive</label>
</FilterBar>
```
Children are plain form controls with `name`s. On md+ they render inline in a GET form (Apply button, Clear link)
that submits to the current path; below md they live in a bottom `Sheet` behind a "Filters (n)" trigger. `q`, `sort`,
`dir` are carried over as hidden inputs (`preserve` prop); `page` is always reset. shadcn `Select` works too (it
renders a hidden native select when given a `name`).

### Badges
* `<StatusBadge status={order.status} />` — QUEUED slate · IN_PROGRESS blue · ON_HOLD amber · COMPLETED green · CANCELLED gray outline.
* `<PriorityBadge priority={order.priority} />` — LOW gray outline · NORMAL neutral · HIGH orange · URGENT red filled.
* `<MachineStatusBadge status={m.status} activeDowntime={m.activeDowntime /* { type, until: "12:00" } | null */} />` —
  ACTIVE green · INACTIVE gray · MAINTENANCE amber, plus the red "Down · Maintenance until 12:00" badge.
* `<DowntimeTypeBadge type={w.type} />` — MAINTENANCE amber · BREAKDOWN red · OTHER gray.

Each module exports `*_META`, the enum list (`ORDER_STATUSES` …) and a `*Label()` helper. Generic inactive rows use
`<Badge variant="outline">Inactive</Badge>`; "Below reorder" / "At reorder" use
`<Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">`.

### `DueHint`
`<DueHint dueDate={order.dueDate} today={today} />` with both values as `YYYY-MM-DD` strings. Renders "Overdue 3d"
(red), "Due today"/"Due tomorrow" (amber), "Due in 5d" (default, ≤ 7 days) or the muted date ("13 Sep 2026").
Pure helper `dueHint(due, today): { label, tone, days }` and `formatIsoDateLabel(iso)` are exported for KPI tiles
and tests.

### `EmptyState`
```tsx
<EmptyState
  icon={ClipboardList}
  title="No orders yet"
  description="Create your first order or import a CSV from your ERP."
  action={<><Button asChild><Link href="/orders/new">New order</Link></Button><Button variant="outline" asChild><Link href="/orders/import">Import CSV</Link></Button></>}
/>
```
`size="compact"` for cards inside detail pages. For a filtered list with no results use title "No results for
“…”" and a Clear filters link as the action.

### `ConfirmDialog` (client)
```tsx
<ConfirmDialog
  trigger={<Button variant="destructive">Delete</Button>}
  title="Delete work center CNC?"
  description="This cannot be undone."
  confirmLabel="Delete"
  destructive
  action={deleteWorkCenterAction.bind(null, wc.id)}   // (formData) => Promise<ActionState>
  successMessage="Work center deleted"
/>
```
| Prop | Notes |
|---|---|
| `trigger` | One focusable element (Button, or a `DropdownMenuItem` with `onSelect={(e) => e.preventDefault()}`). |
| `action` | `(formData: FormData) => Promise<ActionState> \| ActionState`. A zero-arg closure is fine. `null`/`undefined` (e.g. the action redirected) closes silently. |
| `children?` | Extra fields inside the form (a reason `Textarea`, a Select of legal statuses). |
| `confirmLabel`, `cancelLabel?`, `destructive?`, `successMessage?`, `onSuccess?` | |

Shows a pending spinner, an error `Alert` (with flattened `fieldErrors`) and a success toast; the form is remounted
on every open so stale errors never show.

### `AuditList`
```tsx
<AuditList entries={rows.map((r) => ({ id: r.id, summary: describeAudit(r).text, href: describeAudit(r).href,
  actorName: r.actorName, createdAtIso: r.createdAt, relative: formatRelative(r.createdAt),
  absolute: formatDateTime(r.createdAt, tz) }))} />
```
`AuditListEntry = { id; summary; actorName: string | null; createdAtIso; relative; absolute?; href: string | null }`.
Filter `entityType in (User, Tenant)` out for roles without `audit:read-all` before passing rows.

### `StatCard`
`<StatCard label="Overdue" value={kpis.overdue} tone={kpis.overdue > 0 ? "danger" : "default"} href="/orders?status=open&dueTo=…" icon={AlertTriangle} hint="vs open orders" />`
`tone: "default" | "warn" | "danger"`; with `href` the whole tile is a link.

## 3. Forms (`src/components/forms`)

### `ActionState` (`forms/action-state.ts`)
```ts
type ActionState<T = unknown> = null | { ok: true; message?: string; data?: T } | { ok: false; error: string; fieldErrors?: Record<string, string[]> };
fieldErrorsFor(state, "quantity")   // string[] | undefined
actionErrorMessage(error)           // "forbidden" → friendlier text
```
Structurally identical to `ActionState` in `src/lib/action.ts`; import either.

### `FormField`
```tsx
<FormField label="Quantity" htmlFor="quantity" required errors={fieldErrorsFor(state, "quantity")}
  description="Enter a quantity greater than 0" hint={unit}>
  <Input name="quantity" type="number" inputMode="decimal" step="0.001" min="0" defaultValue={order?.quantity} />
</FormField>
```
When the child is a single element, `FormField` injects `id={htmlFor}`, `aria-invalid`, `aria-required` and
`aria-describedby` (`${htmlFor}-description`, `${htmlFor}-error`). Works with `Input`, `Textarea`, `SelectTrigger`,
`Combobox`, `DateInput`, `DateTimeInput`, `UnitInput`.

### `FieldErrors`
`<FieldErrors id="quantity-error" errors={errors} />` — `role="alert"`, de-duplicated, renders nothing when empty.
Use it standalone for form-level errors (`state.error`).

### `SubmitButton` (client)
`<SubmitButton pendingText="Saving…">Save order</SubmitButton>` — `useFormStatus()`; accepts Button props
(`variant`, `size`, `className`).

### `Combobox` (client)
```tsx
<Combobox name="customerId" options={customers.map((c) => ({ value: c.id, label: c.name, hint: c.code ?? undefined }))}
  defaultValue={order?.customerId} placeholder="Select customer" allowCreate
  createLabel={(typed) => `Create "${typed}"`} required />
```
Popover + cmdk, searchable (label + hint), hidden `<input name>` for plain form posts, 44 px trigger. With
`allowCreate`, choosing `Create "X"` submits `new:X`; on the server use `parseCreateValue(value)` (exported) →
`findOrCreateCustomer(tx, name)`. `onValueChange(value, option)` lets a parent client component update e.g. a unit
suffix. `CREATE_PREFIX = "new:"`.

Empty source lists: render the spec's "No {entity} yet — Create one" link instead of an empty Combobox.

### `DateInput`
`<DateInput name="dueDate" defaultValue={order?.dueDate} min={today} required />` — native date input, values
are `YYYY-MM-DD` strings. Server Component friendly.

### `DateTimeInput` (client)
`<DateTimeInput name="startsAt" tz={session.tenant.timezone} defaultValue={window?.startsAt} required />`
Date + time (15-minute step, `stepMinutes`) fields interpreted in the tenant timezone; the submitted hidden value is
the ISO UTC instant ("" until both parts are filled — validate with `z.iso.datetime()`). Helpers
`zonedFieldsToUtcIso(date, time, tz)` and `utcToZonedFields(value, tz)` are exported.

### `UnitInput`
`<UnitInput name="unit" defaultValue={product?.unit ?? "pcs"} />` — Input + datalist of `COMMON_UNITS`
(pcs, nos, kg, g, m, mm, l, ml, set, box). The action trims + lower-cases.

### `ToastOnResult` (client)
`<ToastOnResult state={state} successMessage="Order saved" />` — sonner toast whenever the `useActionState` result
changes (success → `state.message`; error → `state.error`). Place it once inside the form component.

## 4. Recipes

### 4.1 List page (`PageHeader` + `SearchInput` + `FilterBar` + `DataTable` + `Pagination`)
```tsx
// src/app/(app)/orders/page.tsx  (Server Component)
export default async function OrdersPage({ searchParams }: PageProps<"/orders">) {
  const { session, db } = await requirePermission("orders:read");
  const params = parseListParams(await searchParams);          // q, page, sort, dir, status, …
  const today = todayInTz(session.tenant.timezone);
  const { rows, total } = await listOrders(db, params);
  const listHref = (patch: Partial<typeof params>) => `/orders?${toQuery({ ...params, ...patch })}`;
  const activeFilters = countActiveFilters(params);

  return (
    <>
      <PageHeader title="Orders" actions={can(session.user.role, "orders:write") && (
        <><Button variant="outline" asChild><Link href="/orders/import">Import CSV</Link></Button>
          <Button asChild><Link href="/orders/new">New order</Link></Button></>)} />
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <SearchInput placeholder="Search order #, customer, SKU, PO ref" defaultValue={params.q} />
        <FilterBar activeCount={activeFilters} clearHref="/orders">…filter controls…</FilterBar>
      </div>
      <DataTable
        columns={columns(today)}
        rows={rows.map(toOrderRow)}
        rowKey={(o) => o.id}
        sort={{ sort: params.sort, dir: params.dir, makeHref: (sort, dir) => listHref({ sort, dir, page: 1 }) }}
        caption={`Orders, page ${params.page}`}
        emptyState={
          activeFilters > 0 || params.q
            ? <EmptyState title={`No results for “${params.q}”`} action={<Button variant="outline" asChild><Link href="/orders">Clear filters</Link></Button>} />
            : <EmptyState icon={ClipboardList} title="No orders yet" description="Create your first order or import a CSV." action={…} />
        }
      />
      <Pagination className="mt-4" page={params.page} pageSize={25} total={total} makeHref={(page) => listHref({ page })} />
    </>
  );
}
```

### 4.2 Form page (`useActionState` + `withAction` + `FormField` + `FieldErrors` + `SubmitButton` + `ToastOnResult`)
```tsx
// actions.ts
"use server";
export const createOrderAction = withAction(async (formData) => {
  const { session, db } = await requirePermission("orders:write");
  const input = parseForm(orderCreateSchema, formData);       // throws ZodError → fieldErrors
  const order = await createOrder(db, session, input);
  redirect(`/orders/${order.id}`);                            // NEXT_REDIRECT is rethrown by withAction
});

// OrderForm.tsx
"use client";
export function OrderForm({ customers, products, today, tz }: Props) {
  const [state, formAction] = useActionState(createOrderAction, null);
  return (
    <form action={formAction} className="flex flex-col gap-6">
      <ToastOnResult state={state} />
      {state && !state.ok && !state.fieldErrors ? <FieldErrors errors={[actionErrorMessage(state.error)]} /> : null}
      <div className="grid gap-5 md:grid-cols-2">
        <FormField label="Customer" htmlFor="customerId" required errors={fieldErrorsFor(state, "customerId")}>
          <Combobox name="customerId" options={customers} allowCreate placeholder="Select or create a customer" />
        </FormField>
        <FormField label="Customer PO ref" htmlFor="customerPoRef" errors={fieldErrorsFor(state, "customerPoRef")}>
          <Input name="customerPoRef" maxLength={64} />
        </FormField>
        <FormField label="Due date" htmlFor="dueDate" required errors={fieldErrorsFor(state, "dueDate")}>
          <DateInput name="dueDate" min={today} />
        </FormField>
        …
      </div>
      {/* sticky bottom action bar below md */}
      <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <Button variant="outline" asChild><Link href="/orders">Cancel</Link></Button>
        <SubmitButton pendingText="Saving…">Create order</SubmitButton>
      </div>
    </form>
  );
}
```
Forms are single column below md and two columns from md (`grid md:grid-cols-2`). Success = toast + redirect from
the action; validation errors render inline under each field.

### 4.3 Dialog form (`ConfirmDialog` with extra fields)
```tsx
// Status change with a required reason for ON_HOLD (client component on the order detail page)
<ConfirmDialog
  trigger={<Button variant="outline">Put on hold</Button>}
  title={`Put ${order.orderNumber} on hold?`}
  description="The order stays visible in open lists and can be resumed later."
  confirmLabel="Put on hold"
  action={changeStatusAction.bind(null, order.id, "ON_HOLD")}   // (id, status, formData) => Promise<ActionState>
  successMessage="Order put on hold"
>
  <FormField label="Reason" htmlFor="reason" required>
    <Textarea name="reason" rows={3} placeholder="Why is this order on hold?" />
  </FormField>
</ConfirmDialog>
```
For richer dialogs (BomItemDialog, ShiftDialog, WorkCenterDialog) compose `Dialog` + `useActionState` directly: put
the form inside `DialogContent`, render `FormField`s with `fieldErrorsFor(state, …)`, a `SubmitButton` in
`DialogFooter`, and close the dialog in an effect when `state.ok` (same pattern as `ConfirmDialog`'s inner form).

## 5. Shell files owned by the kit

`src/app/layout.tsx` (Inter font, `TooltipProvider`, `<Toaster richColors position="top-right" />`, metadata
title "ProdPlan"), `src/app/page.tsx` (→ `/dashboard`), `forbidden.tsx` (403; needs
`experimental.authInterrupts: true` in `next.config.ts` for `forbidden()`), `not-found.tsx`, `error.tsx`,
`loading.tsx`, `src/app/globals.css`, `src/hooks/use-debounced-callback.ts`.
