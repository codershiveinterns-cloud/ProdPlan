# ProdPlan — Milestone 1 Build Specification

Source: `ProdPlan_PRD.pdf` (client PRD). This document is the binding contract for the M1 build.
Anything not listed here is out of scope for M1 unless it is required to make an M1 item work.

## 0. Milestone 1 scope (from the PRD)

1. Multi-tenant architecture with per-tenant data isolation.
2. Authentication (email/password signup + login) and role-based access control: Admin, Planner, Supervisor, Viewer.
3. Order management: create, edit, and CSV-import customer orders (product, quantity, priority, delivery deadline).
4. Machine & work-center master data: capacity, shift calendar, downtime/maintenance windows.
5. Material master & inventory with per-product bill of materials (BOM).
6. Base admin dashboard with order and machine list views.
7. Staging deployment for early client review.

Acceptance (PRD): modules complete, responsive, tested, deployed (staging for M1), delivered with source,
environment setup instructions, and handover notes.

Non-functional requirements that M1 must already honour: encryption in transit (HTTPS on staging), per-tenant
isolation, role-enforced API/server-action access, audit logging of order/master-data changes (basic), fast pages,
architecture that scales to many tenants and does not need a redesign to add scheduling (M2), AI (M3), or billing.

## 1. Stack (fixed)

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router, `src/` dir, TypeScript strict, Turbopack). React 19. Server Components + Server Actions. |
| Styling / UI | Tailwind CSS v4 + shadcn/ui components (Radix primitives) + `lucide-react` icons + `sonner` toasts. |
| Database | PostgreSQL 15 locally (`scripts/db-local.sh`, port 5433). Neon Postgres on staging (provisioned by Netlify DB). |
| ORM | Prisma 7 (`prisma@7`, `@prisma/client@7`, `@prisma/adapter-pg@7`, `pg`). Generator `prisma-client`, output `src/generated/prisma`. Config in `prisma.config.ts`. Migrations committed in `prisma/migrations`. |
| Auth | Custom email/password. `bcryptjs` (cost 12). Session = signed JWT (`jose`, HS256, `AUTH_SECRET`) in httpOnly cookie `pp_session`, 7-day expiry. |
| Validation | `zod` (v4) for every form / action / import row. |
| CSV | `papaparse` for parsing, own writer for template download. |
| Tests | `vitest` (unit) + integration tests against `prodplan_test` database. |
| Hosting (staging) | Netlify (Next.js runtime `@netlify/plugin-nextjs`), Netlify DB (Neon). `netlify.toml` committed. Also a `Dockerfile` + `docker-compose.yml` for VPS portability (M3 production target per PRD). |
| Package manager | npm (lockfile committed). |

Environment variables: `DATABASE_URL` (falls back to `NETLIFY_DATABASE_URL`), `AUTH_SECRET` (>= 32 chars),
`APP_URL`. `.env.example` documents them; `.env` is git-ignored.

Next.js 16 notes: `params`, `searchParams`, `cookies()`, `headers()` are async. Request interception file is
`src/proxy.ts` (the Next 16 name for middleware; `middleware.ts` is deprecated). Route handlers live in `src/app/api/**`.

## 2. Multi-tenancy model

* A **Tenant** = one manufacturing unit / company. Signup creates a Tenant and its first Admin user in a single
  transaction.
* Every domain table carries `tenantId` (FK -> Tenant, `onDelete: Cascade`). A user belongs to exactly one tenant.
  Email is globally unique across the platform (documented decision; memberships across tenants are future scope).
* **Application-layer scoping (mandatory):** `tenantDb(tenantId)` in `src/lib/db.ts` returns a Prisma client
  extension (`$extends` -> `query.$allModels.$allOperations`) that, for every model in `TENANT_SCOPED_MODELS`:
  * reads (`findMany`, `findFirst`, `findFirstOrThrow`, `count`, `aggregate`, `groupBy`, `updateMany`,
    `deleteMany`): rewrites `where` to `{ AND: [callerWhere ?? {}, { tenantId }] }`;
  * unique ops (`findUnique`, `findUniqueOrThrow`, `update`, `delete`, `upsert`): spreads `tenantId` into the
    unique `where` (Prisma extended-where-unique) and, for `upsert`, sets `create.tenantId`;
  * `create`: sets `data.tenantId`; `createMany`: sets `tenantId` on each row;
  * throws for `$queryRaw`/`$executeRaw` style escape hatches used through the scoped client — raw SQL is not used in
    M1 outside migrations.
  Module code MUST obtain its client via `getTenantDb()` (derived from the session) and MUST NOT import the raw
  `prisma` client, except `src/lib/auth/**` (login lookup by email, signup) and `prisma/seed.ts`.
  Creates MUST use scalar FK fields (`productId: ...`), never `connect`, so that the injected `tenantId` scalar is
  valid. Nested writes (e.g. product + bomItems) MUST set `tenantId` on every nested record explicitly.
* **Database-layer isolation (defense in depth):** every referenced model has `@@unique([tenantId, id])` and every
  intra-tenant relation is a composite FK `@relation(fields: [tenantId, xId], references: [tenantId, id])`. A row can
  therefore never reference another tenant's row even if application code has a bug.
* All business unique constraints are composite with `tenantId` (e.g. `@@unique([tenantId, orderNumber])`).
* Tests (integration, `tests/integration/tenant-isolation.test.ts`): create two tenants with data, assert that
  `tenantDb(A)` cannot read, update, delete, or count tenant B rows via any operation, and that a create through
  `tenantDb(A)` referencing a B product fails at the DB (composite FK).

## 3. Authentication & RBAC

Roles (enum `Role`): `ADMIN`, `PLANNER`, `SUPERVISOR`, `VIEWER`.

| Capability | ADMIN | PLANNER | SUPERVISOR | VIEWER |
|---|---|---|---|---|
| View dashboard, orders, machines, materials, products, calendars | ✓ | ✓ | ✓ | ✓ |
| Create / edit / cancel orders, CSV import | ✓ | ✓ | – | – |
| Update order status (QUEUED / IN_PROGRESS / ON_HOLD / COMPLETED) | ✓ | ✓ | ✓ | – |
| Products, BOM, routing (create/edit/delete) | ✓ | ✓ | – | – |
| Materials master + stock movements | ✓ | ✓ | ✓ (stock movements only) | – |
| Work centers, machines, shift calendars | ✓ | ✓ | – | – |
| Downtime / maintenance windows | ✓ | ✓ | ✓ | – |
| Users (invite, change role, deactivate) | ✓ | – | – | – |
| Tenant settings (name, timezone) | ✓ | – | – | – |
| Own profile (name, password) | ✓ | ✓ | ✓ | ✓ |

Implementation:
* `src/lib/rbac.ts`: `Permission` union + `can(role, permission)` matrix. Server actions call
  `const { session, db } = await requireRole(['ADMIN','PLANNER'])` (throws/redirects). UI hides controls via `can()`
  but the server check is the authority.
* `src/lib/auth/session.ts`: `createSession(user)`, `getSession()` (verifies JWT, then loads the user + tenant from DB
  once per request via `React.cache`; rejects if `isActive=false` or `tokenVersion` mismatch), `destroySession()`.
* `src/proxy.ts`: verifies the cookie signature with `jose` (edge-safe), redirects unauthenticated users hitting
  `/(app)` routes to `/login?next=…`, redirects authenticated users away from `/login` and `/signup`, and blocks
  `/settings/users` for non-admins. The DB check happens in the layout/actions (proxy is a fast pre-filter only).
* Passwords: min 8 chars; bcrypt cost 12; generic "Invalid email or password" errors; simple in-memory rate limit on
  login (10 attempts / 15 min per IP + email) — documented as to be replaced by a shared store in M3.
* Signup form: company (tenant) name, timezone (default `Asia/Kolkata`), your name, email, password. Creates
  tenant + ADMIN user, logs in.
* Admin creates additional users from Settings → Users with name, email, role, temporary password (email delivery is
  M3). Cannot deactivate or demote the last active admin. Changing a user's role/password bumps `tokenVersion`.
* Cookies: `httpOnly`, `sameSite=lax`, `secure` in production, `path=/`. Server Actions rely on Next's built-in
  origin check for CSRF.

## 4. Data model (Prisma) — all M1 tables

Conventions: `id String @id @default(cuid())`, `createdAt`, `updatedAt`. Quantities are `Decimal @db.Decimal(14,3)`.
Money is not modelled in M1 (optional `unitCost` only). Dates that are calendar dates use `@db.Date`.
Serialize `Decimal`/`Date` to plain JSON (`number`/ISO string) before passing to client components — use the
`toPlain()` helper in `src/lib/serialize.ts`.

```
Tenant        id, name, slug (unique), timezone (default "Asia/Kolkata"), orderSeq Int (default 0), createdAt, updatedAt
User          id, tenantId, email (unique), name, passwordHash, role Role, isActive Bool(true), tokenVersion Int(0), lastLoginAt?, createdAt, updatedAt
Customer      id, tenantId, name, code?, email?, phone?, notes?            @@unique([tenantId, name])
Product       id, tenantId, sku, name, description?, unit (default "pcs"), isActive   @@unique([tenantId, sku])
ProductOperation id, tenantId, productId, sequence Int, workCenterId, setupMinutes Int, runMinutesPerUnit Decimal   @@unique([tenantId, productId, sequence])   (routing — needed by the M2 scheduler)
Material      id, tenantId, code, name, unit, stockOnHand Decimal(0), reorderThreshold Decimal(0), reorderLeadTimeDays Int(0), unitCost Decimal?, supplier?, isActive   @@unique([tenantId, code])
BomItem       id, tenantId, productId, materialId, quantityPerUnit Decimal, scrapPercent Decimal(0), note?   @@unique([tenantId, productId, materialId])
StockMovement id, tenantId, materialId, type StockMovementType (RECEIPT|ISSUE|ADJUSTMENT|RETURN), quantity Decimal (signed delta applied to stockOnHand), reference?, note?, createdById, createdAt
WorkCenter    id, tenantId, code, name, description?     @@unique([tenantId, code])
ShiftCalendar id, tenantId, name, isDefault Bool         @@unique([tenantId, name])
Shift         id, tenantId, calendarId, name, startTime "HH:MM", endTime "HH:MM" (may cross midnight), daysOfWeek Int[] (0=Sun..6=Sat), breakMinutes Int(0)
CalendarException id, tenantId, calendarId, date @db.Date, isWorking Bool, note?   @@unique([tenantId, calendarId, date])
Machine       id, tenantId, workCenterId, calendarId?, code, name, status MachineStatus (ACTIVE|INACTIVE|MAINTENANCE), efficiencyPercent Int(100), ratedCapacityPerShift Decimal?, capacityUnit? (e.g. "pcs"), notes?   @@unique([tenantId, code])
DowntimeWindow id, tenantId, machineId, startsAt, endsAt, type DowntimeType (MAINTENANCE|BREAKDOWN|OTHER), reason?, createdById, createdAt
Order         id, tenantId, orderNumber, customerId, productId, quantity Decimal, priority OrderPriority (LOW|NORMAL|HIGH|URGENT), dueDate @db.Date, status OrderStatus (QUEUED|IN_PROGRESS|ON_HOLD|COMPLETED|CANCELLED), customerPoRef?, notes?, importBatchId?, createdById, createdAt, updatedAt   @@unique([tenantId, orderNumber])  @@index([tenantId, dueDate]) @@index([tenantId, status])
ImportBatch   id, tenantId, fileName, rowCount, successCount, errorCount, createdById, createdAt
AuditLog      id, tenantId, actorUserId?, entityType, entityId, action (CREATE|UPDATE|DELETE|STATUS_CHANGE|IMPORT|LOGIN), before Json?, after Json?, createdAt   @@index([tenantId, createdAt])
```

Semantics:
* One Order = one product line (PRD: product, quantity, priority, deadline). Multi-line customer POs are several
  orders sharing `customerPoRef`. `orderNumber` auto-generated as `SO-000123` from `Tenant.orderSeq` inside a
  transaction when left blank; user-provided numbers must be unique within the tenant.
* Machine capacity per shift (minutes) = shift duration − breaks, × `efficiencyPercent/100`. `ratedCapacityPerShift`
  is an optional informational "units per shift" figure shown in lists. The machine uses its own calendar or the
  tenant default calendar (exactly one calendar has `isDefault=true`; enforce in code).
* `Material.stockOnHand` changes only through StockMovement rows (transaction: insert movement + increment stock;
  reject if the result would go negative unless type is ADJUSTMENT).
* Deleting master data referenced by orders is blocked (FK `Restrict`); offer deactivate (`isActive=false`) instead.
* Every create/update/delete/status change/import writes an AuditLog row via `audit()` (`src/lib/audit.ts`).

## 5. Application structure

```
src/
  proxy.ts
  app/
    layout.tsx, globals.css, page.tsx (redirect → /dashboard or /login)
    (auth)/login/page.tsx, (auth)/signup/page.tsx  (+ actions.ts)
    (app)/layout.tsx           ← requires session; sidebar + topbar shell; tenant name; role badge; user menu
    (app)/dashboard/page.tsx
    (app)/orders/{page.tsx,new/page.tsx,import/page.tsx,[id]/page.tsx,[id]/edit/page.tsx,actions.ts}
    (app)/products/{page.tsx,new/page.tsx,[id]/page.tsx,[id]/edit/page.tsx,actions.ts}   ← includes BOM + routing editors
    (app)/materials/{page.tsx,new/page.tsx,[id]/page.tsx,[id]/edit/page.tsx,actions.ts}  ← includes stock movements
    (app)/machines/{page.tsx,new/page.tsx,[id]/page.tsx,[id]/edit/page.tsx,actions.ts}   ← work centers + machines + downtime
    (app)/calendars/{page.tsx,new/page.tsx,[id]/page.tsx,actions.ts}                    ← shift calendars
    (app)/settings/{page.tsx (tenant), users/page.tsx, profile/page.tsx, actions.ts}
    api/health/route.ts       ← { ok: true, db: true, version }
    api/orders/template/route.ts ← CSV template download
  lib/
    db.ts (prisma + tenantDb + TENANT_SCOPED_MODELS)  auth/{password.ts,session.ts,guards.ts,rate-limit.ts}
    rbac.ts  audit.ts  serialize.ts  format.ts (dates, numbers, tenant timezone)  csv.ts  order-number.ts
    calendar.ts (shift minutes, capacity per shift, is-working-day)  validation/*.ts (zod schemas per module)
  components/ui/*  (shadcn)   components/layout/* (AppShell, Sidebar, Topbar, PageHeader)
  components/data/* (DataTable, Pagination, SearchInput, StatusBadge, PriorityBadge, EmptyState, ConfirmDialog)
  components/forms/* (FormField, SubmitButton, FieldErrors)
  generated/prisma  (git-ignored, generated at build)
prisma/schema.prisma, prisma/migrations/**, prisma/seed.ts
tests/unit/**, tests/integration/**, vitest.config.ts
docs/*.md, README.md, .env.example, netlify.toml, Dockerfile, docker-compose.yml
```

UI conventions: list pages are server-rendered tables with search (`?q=`), filters, sort, and pagination (25/page)
driven by `searchParams`. Forms are Server Actions with `useActionState`, zod field errors shown inline, success toast
and redirect. Destructive actions use a confirm dialog. Every page has a `PageHeader` (title, description, primary
action). Layout is responsive: sidebar collapses to a sheet below `lg`; tables scroll horizontally inside their
container; touch targets ≥ 40px for floor/tablet use.

## 6. Module requirements

### 6.1 Orders
* List: columns order #, customer, product (sku · name), qty + unit, priority badge, due date (with "overdue" /
  "due in N days" hint), status badge, created. Filters: status, priority, customer, due-date range; search on
  order #, customer, product; sort by due date (default asc), priority, created.
* Create/Edit: customer (select existing or type new name → created), product (searchable select, active only),
  quantity (> 0), priority, due date (today or later on create), customer PO ref, notes. Order number optional.
* Detail: all fields, product BOM requirement for this order (qty × quantityPerUnit incl. scrap) vs stock on hand
  with a "short" indicator, routing preview, audit history. Status change control (per RBAC). Cancel action.
* CSV import (`/orders/import`): download template; upload; server parses + validates every row
  (`order_number?, customer, product_sku, quantity, priority, due_date YYYY-MM-DD, customer_po_ref?, notes?`);
  preview table with per-row errors; "Import N valid rows" (invalid rows skipped and reported) — creates customers
  by name if missing, creates orders in one transaction, writes an ImportBatch + audit entry. Max 2,000 rows.

### 6.2 Machines & work centers
* Work centers: CRUD (code, name, description). List shows machine count.
* Machines: CRUD (work center, code, name, status, calendar (default = tenant default), efficiency %, rated
  capacity/unit, notes). List: code, name, work center, status badge, calendar, available min/shift, active downtime.
* Machine detail: capacity summary (shift-by-shift minutes for the next 7 days from its calendar), downtime windows
  list (upcoming/past) with add/edit/delete (start, end, type, reason; end > start; warn on overlap), audit history.

### 6.3 Shift calendars
* CRUD calendars; each has ≥1 shift (name, start, end, weekdays, break minutes) and optional exceptions
  (date, working/non-working, note). Mark default. Working-day/minutes helpers in `lib/calendar.ts` are unit tested
  (incl. shift crossing midnight, break subtraction, exceptions, efficiency).

### 6.4 Materials & inventory
* Materials CRUD (code, name, unit, reorder threshold, reorder lead time days, unit cost, supplier, active).
  List highlights rows at/below reorder threshold. Filter: below threshold.
* Detail: stock on hand, movements ledger (paginated), "Record movement" form (type, qty, reference, note) — server
  applies delta in a transaction and blocks negative stock for ISSUE. Where-used list (products whose BOM uses it).

### 6.5 Products & BOM
* Products CRUD (sku, name, description, unit, active). Detail has two editors:
  * BOM items: material (searchable), qty per unit, scrap %, note; add/edit/remove; shows on-hand and coverage
    (how many units can be built from stock).
  * Routing operations: sequence, work center, setup min, run min/unit; add/edit/remove/reorder.

### 6.6 Dashboard (base admin dashboard)
* KPI tiles: open orders, due in next 7 days, overdue, in progress, machines active / in maintenance / with active
  downtime, materials at/below reorder threshold.
* "Upcoming orders" table (next 10 by due date, with priority + status) and "Machines" table (all machines with work
  center, status, calendar, current downtime) — both link to the full list pages.
* Recent activity (last 10 AuditLog rows, human-readable).
* Loads in one round trip with a handful of aggregate queries; target < 2 s on staging.

### 6.7 Settings
* Tenant: name, timezone. Users (ADMIN): list, invite (name, email, role, temp password), edit role, reset password,
  deactivate/reactivate; guard last admin. Profile: name, change password (requires current password).

## 7. Seed data (`npm run db:seed`)

Tenant "Acme Precision Works" (slug `acme`, Asia/Kolkata) with users `admin@acme.test`, `planner@acme.test`,
`supervisor@acme.test`, `viewer@acme.test` (password `Password123!`); a second tenant "Beta Fabrication" with
`admin@beta.test` (same password) and a little data to demonstrate isolation. Acme gets: default calendar with two
shifts (06:00–14:00, 14:00–22:00, Mon–Sat, 30-min break) + one holiday exception; 3 work centers (CNC, Assembly,
Paint); 6 machines (one in MAINTENANCE, one with an upcoming downtime window); 12 materials (3 below threshold);
5 products with BOMs and 2–3 routing operations each; 24 orders across priorities, statuses, and due dates (some
overdue, some this week); stock movements history; audit entries.

## 8. Quality bar

* `npm run typecheck` (tsc --noEmit), `npm run lint`, `npm test`, and `npm run build` all pass.
* Unit tests: tenantDb query rewriting, rbac matrix, calendar helpers, order-number generation, CSV row validation.
  Integration tests: tenant isolation (see §2), signup→login flow helpers, stock movement transaction.
* No `any` escape hatches without a comment; no raw prisma import outside allowed files (grep-checked in review).
* Accessible forms (labels, error text linked via `aria-describedby`), keyboard-usable dialogs and menus.

## 9. Deliverables

* Source in `~/Desktop/prodplan` (git, sensible commit history).
* `README.md`: local setup (Postgres script, env, migrate, seed, dev), scripts table, test instructions, demo logins.
* `docs/ARCHITECTURE.md` (tenancy, auth, data model diagram, how M2/M3 plug in), `docs/DEPLOYMENT.md` (staging on
  Netlify + Netlify DB, how to claim the Neon DB, env vars, running migrations, Docker/VPS alternative),
  `docs/HANDOVER_M1.md` (what was delivered vs PRD, decisions, known limitations, demo script).
* Staging URL live with seeded demo tenant and `/api/health` green.
