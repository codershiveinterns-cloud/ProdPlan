# ProdPlan — Architecture (Milestone 1)

## 1. Overview

ProdPlan is a Next.js 16 (App Router) application with Server Components and Server Actions, PostgreSQL via Prisma 7,
and a custom email/password session layer. One deployable serves every tenant (manufacturing unit); isolation is
enforced in the application data-access layer **and** in the database schema.

```
Browser ──HTTPS──▶ Next.js (proxy.ts → Server Components / Server Actions / Route Handlers)
                        │
                        ├── src/lib/auth   session JWT (jose) · bcrypt passwords · RBAC guards
                        ├── src/lib/db.ts  tenantDb(tenantId) — Prisma client extension that scopes every query
                        └── PostgreSQL     composite tenant FKs, per-tenant unique constraints, audit log
```

## 2. Multi-tenancy

* Every domain table has `tenantId`. Reads and writes go through `tenantDb(tenantId)`
  (`src/lib/db.ts`), a Prisma `$extends` client with a **default-deny** rule: every `(model, operation)` pair is
  either explicitly scoped (where-clauses AND-ed with `tenantId`, unique lookups spread with `tenantId`, create data
  forced to the session tenant, relation `connect`/`set` rejected) or it throws `TenantScopeError`.
* The `Tenant` model itself is pinned to the session tenant; append-only models (`AuditLog`, `StockMovement`)
  reject updates and deletes; users are never deleted, only deactivated.
* **Database-level defence:** every referenced model has `@@unique([tenantId, id])` and every required intra-tenant
  relation is a composite foreign key on `[tenantId, xId] → [tenantId, id]`. A row cannot reference another tenant's
  row even if application code has a bug. Optional relations (`Order.importBatchId`, `ProductOperation.machineId`,
  `AuditLog.actorUserId`, `Tenant.defaultCalendarId`) are plain FKs checked in code (Prisma cannot express a
  composite FK mixing a required and an optional column).
* Raw SQL is forbidden outside migrations/tests (ESLint rule); the raw `prisma` client may only be imported by the
  auth layer, rate limiting, the health route, the seed and tests (ESLint rule + unit test).
* Postgres Row-Level Security is **deferred to M3 hardening**: because all access flows through `tenantDb()`, RLS can
  be added inside that extension (SET LOCAL per transaction) without touching module code.
* Integration tests (`tests/integration/tenant-isolation.test.ts`) create two tenants and assert that no operation
  class can read, update, delete, count or re-parent another tenant's rows.

## 3. Authentication and authorization

* Signup creates a tenant, its first Admin, and a default shift calendar in one transaction. Emails are unique
  platform-wide and normalised to lower case.
* Sessions are HS256 JWTs (`jose`) in an `HttpOnly`/`Secure`/`SameSite=Lax` cookie (`__Host-` prefixed on HTTPS)
  with claims `sub`, `tid`, `role` (hint), `tv` (token version), `iss`, `aud`, 7-day expiry and sliding renewal.
  `tokenVersion` on the user revokes sessions on role/password changes and deactivation.
* `src/proxy.ts` (Next 16 request interception, Node runtime) only verifies the signature and redirects; the
  database check (`isActive`, `tokenVersion`, `mustChangePassword`) happens in `requireSession()` on every page and
  action. Revoked sessions are routed to `/logout` which clears the cookie (no redirect loop).
* RBAC is a permission matrix in `src/lib/rbac.ts` (`can(role, permission)`); every page and action calls
  `requirePermission()` which returns the session and the tenant-scoped client. The UI hides controls with the same
  matrix, but the server is the authority.
* Login/signup rate limits use a database bucket (`RateLimitBucket`) so they hold across serverless instances;
  unknown emails still pay a bcrypt compare so timing does not reveal account existence.

## 4. Data model

```
Tenant ─┬─ User (role, tokenVersion, mustChangePassword)
        ├─ Customer ──┐
        ├─ Product ───┼─ Order (orderNumber, quantity, priority, dueDate, status, importBatchId?)
        │    ├─ BomItem ── Material ── StockMovement (signed delta, balanceAfter)
        │    └─ ProductOperation (sequence, workCenter, machine?, setup, run/unit)
        ├─ WorkCenter ── Machine (status, efficiency, calendar) ── DowntimeWindow
        ├─ ShiftCalendar ── Shift (HH:MM, daysOfWeek, break) / CalendarException (date, isWorking)
        ├─ ImportBatch (PENDING → COMMITTED, preview rows)
        └─ AuditLog (actor snapshot, action, summary, changedFields, before/after)
```

Key rules (full detail in `M1_SPEC.md` §4): one order = one product line; order numbers `SO-000123` come from a
per-tenant sequence; status transitions are a fixed state machine with role gates; stock changes only through the
ledger and can never go negative (atomic conditional update); capacity is time-based (shift minutes × efficiency −
downtime); BOM requirement = quantity × qty-per-unit × (1 + scrap%); calendar maths runs in the tenant timezone
and calendar dates cross the app boundary as `YYYY-MM-DD` strings.

## 5. Application structure

* `src/app/(marketing)` — public landing page. `src/app/(auth)` — login/signup. `src/app/(app)` — the product,
  wrapped by `AppShell` after `requireSession()`. `src/app/api/health` — health probe.
* Lists are server-rendered with a shared URL contract (`q`, `page`, `sort`, `dir`, module filters). Forms are
  Server Actions with `useActionState`, zod validation (`src/lib/validation`), inline field errors and toasts.
* Every mutation runs in a transaction that also writes its `AuditLog` row (`src/lib/audit.ts`).
* Design system: Tailwind v4 tokens in `globals.css`, shadcn/ui (Radix) primitives at 44 px density, shared data
  components (`DataTable` with responsive column priorities, badges with fixed colour semantics, `EmptyState`).

## 6. How Milestone 2 and 3 plug in (no redesign needed)

| Milestone | Addition | Where it attaches |
|---|---|---|
| M2 scheduling engine | `OrderOperation`/`ScheduleEntry` rows (order × routing step → machine, planned start/end, status) and `MaterialReservation` | Uses `ProductOperation` routing, `Machine` + `ShiftCalendar` capacity (`src/lib/calendar.ts availableMinutes`), `Order.priority/dueDate/earliestStartDate`, BOM maths in `src/lib/bom.ts` |
| M2 planning board | Gantt over `ScheduleEntry` per machine per day; drag-to-reschedule mutates entries via scoped actions | Reuses the app shell, badges, tenant timezone helpers |
| M2 status tracking | Per-operation statuses roll up into the existing `Order.status` state machine | `src/lib/orders/status.ts` |
| M2 notifications | `Notification` model (tenant-scoped) + in-app inbox | Same `tenantDb()` scoping; add the model to `TENANT_SCOPED_MODELS` (a unit test enforces this) |
| M3 AI optimisation / shortage prediction | Reads open orders, capacity, stock, `reorderLeadTimeDays`; writes suggestions | Pure functions next to `bom.ts`/`calendar.ts`; LLM calls in a server-only module |
| M3 analytics, exports, email | Aggregates over `Order`, `StockMovement`, `DowntimeWindow`, `AuditLog`; CSV via `src/lib/csv.ts` (formula-injection safe); PDF via a server renderer | Existing audit rows already carry actor snapshots and summaries |
| M3 billing (future scope) | `Subscription` on `Tenant`; feature gates in `requirePermission()` | Tenant-level, no data-model changes elsewhere |

## 7. Operational notes

* Local dev: project-owned Postgres (`scripts/db-local.sh`), `.env`. Staging: Netlify + Netlify Database, migrations
  applied from `prisma/migrations` at deploy time. Production (M3): Docker Compose on a VPS (`Dockerfile`,
  `docker-compose.yml`). See `DEPLOYMENT.md`.
* Health: `GET /api/health` reports DB connectivity and schema presence without leaking configuration.
* Security decisions recorded for M3: RLS deferral, `__Host-` cookies, rate-limit buckets, dummy-hash timing
  equalisation, temp-password forced change, last-admin transactional guard, CSV formula-injection guard.
