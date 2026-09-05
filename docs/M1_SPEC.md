# ProdPlan — Milestone 1 Build Specification (v2)

Source: `docs/PRD.txt` (client PRD). This document is the binding contract for the M1 build. v2 incorporates an
adversarial review (domain, security, UX, feasibility). Anything not listed here is out of scope for M1 unless it is
required to make an M1 item work. Verified stack details and code skeletons live in `docs/STACK_NOTES.md`; staging
facts in `docs/STAGING_STATUS.md`. When this spec and STACK_NOTES disagree on an API detail, STACK_NOTES wins
(it was verified empirically); on product behaviour, this spec wins.

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

NFRs M1 must already honour: encryption in transit (HTTPS on staging) and at rest (Neon-managed storage on staging;
DEPLOYMENT.md states the VPS path needs an encrypted volume — completed in M3), per-tenant isolation, role-enforced
server actions, audit logging of order/master-data changes, fast pages, and an architecture that adds scheduling
(M2), AI (M3) and billing later without redesign.

## 1. Stack (fixed)

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router, `src/` dir, TypeScript strict, Turbopack), React 19, Server Components + Server Actions. |
| UI | Tailwind CSS v4 + shadcn/ui (Radix) + `lucide-react` + `sonner`. |
| Database | PostgreSQL 15 locally (`scripts/db-local.sh`, port 5433). Netlify Database (Neon-backed Postgres) on staging. |
| ORM | Prisma 7 (`prisma`, `@prisma/client`, `@prisma/adapter-pg`, `pg`). Generator `prisma-client` → `src/generated/prisma`; `prisma.config.ts`; migrations committed in `prisma/migrations`. |
| Auth | Custom email/password: `bcryptjs` (cost 12) + `jose` HS256 JWT in an httpOnly cookie. |
| Validation | `zod` v4 for every form, action and import row. |
| CSV | `papaparse` (parse) + own RFC-4180 writer with formula-injection guard (`src/lib/csv.ts`). |
| Dates | `date-fns` + `@date-fns/tz` (`TZDate`) — all "today"/calendar maths in the tenant timezone. |
| Tests | `vitest` unit tests + integration tests against `prodplan_test`. |
| Hosting | Netlify (`@netlify/plugin-nextjs`, `netlify.toml` committed) with Netlify Database; `Dockerfile` + `docker-compose.yml` for the VPS path. |
| Package manager | npm (lockfile committed). |

Env vars: `DATABASE_URL` (falls back to `NETLIFY_DATABASE_URL`), `TEST_DATABASE_URL`, `AUTH_SECRET` (≥ 32 chars; fail
fast at startup if shorter), `APP_URL`, optional `SEED_ALLOW=1`. `.env.example` documents them; `.env` is git-ignored.

Next.js 16 rules: `params`, `searchParams`, `cookies()`, `headers()` are async. Request interception file is
`src/proxy.ts` (Next 16 name; `middleware.ts` is deprecated). Route handlers in `src/app/api/**`. Server Components
never set cookies (only Server Actions and Route Handlers do). `next.config.ts` sets
`experimental.serverActions.allowedOrigins` from the `APP_URL` host plus `*.netlify.app`, and lists `pg`,
`bcryptjs`, `@prisma/client`, `@prisma/adapter-pg` in `serverExternalPackages` if the build requires it (see STACK_NOTES).

## 2. Multi-tenancy model

* A **Tenant** = one manufacturing unit / company. Signup creates, in ONE transaction: the Tenant, its first ADMIN
  user, a ShiftCalendar "General shift" (one Shift "Day" 09:00–17:00, Mon–Sat, 60 break minutes) and sets
  `Tenant.defaultCalendarId` to it.
* Every domain table carries `tenantId` (FK → Tenant, `onDelete: Cascade`). A user belongs to exactly one tenant;
  email is unique platform-wide (documented decision; cross-tenant memberships are future scope).
* **Application-layer scoping (mandatory).** `tenantDb(tenantId)` in `src/lib/db.ts` returns a Prisma `$extends`
  client with two components and a **default-deny** rule: any `(model, operation)` pair not handled explicitly below
  throws `TenantScopeError` (no pass-through branch).
  1. List/aggregate ops (`findMany, findFirst, findFirstOrThrow, count, aggregate, groupBy, updateMany,
     updateManyAndReturn, deleteMany`): `args.where = { AND: [args.where ?? {}, { tenantId }] }`.
  2. Unique ops (`findUnique, findUniqueOrThrow, update, delete, upsert`): `args.where = { ...args.where, tenantId }`
     (scope value written last so it wins).
  3. Write data (`create, createMany, createManyAndReturn, update, updateMany, updateManyAndReturn, upsert.create,
     upsert.update`): `scopeWriteData(data, mode)` (i) on create shapes sets top-level `tenantId` to the scope value
     (overwriting any caller value); on update shapes DELETES `tenantId`; (ii) throws if `data.tenant` is present;
     (iii) walks `data` recursively and THROWS on any key `connect`, `connectOrCreate`, `set`, `disconnect`
     (relations are written only via scalar FK fields), and sets `tenantId` on every nested `create`/`createMany`
     object. Nested `update/upsert/delete/deleteMany/updateMany` on relations pass their `data` through the walker.
  4. `Tenant` model (handled by name): `findUnique/findFirst/findMany/count` force `where = { id: tenantId }`;
     `update/updateMany` force `where = { id: tenantId }` and delete `id`/`slug` from data; `create`, `delete`,
     `deleteMany`, `upsert`, `createMany*` throw.
  5. Append-only models: `AuditLog`, `StockMovement` throw on `update*`, `delete*`, `upsert`. `ImportBatch` allows
     `update` of `status`/counts/`rows` only. `User.delete/deleteMany` throw (deactivate only).
  6. Raw escape hatches: the `client` component overrides `$queryRaw`, `$queryRawUnsafe`, `$executeRaw`,
     `$executeRawUnsafe` to throw `TenantScopeError`.
  7. Transactions: module code calls `db.$transaction(async tx => …)` on the SCOPED client only; the `tx` client stays
     scoped (integration-tested). `audit()`, `nextOrderNumbers()`, `applyStockMovement()` accept the scoped `tx`.
  Module code obtains its client from `requirePermission()`/`getTenantDb()` and never imports the raw `prisma`
  (ESLint-enforced, see §8). Allowed raw users: `src/lib/db.ts`, `src/lib/auth/**`, `src/lib/rate-limit.ts`,
  `src/app/api/health/route.ts`, `prisma/seed.ts`, `tests/**`.
* **Database-layer isolation (defense in depth).** Every model that is referenced by another has
  `@@unique([tenantId, id])`, and every REQUIRED intra-tenant relation is a composite FK
  `@relation(fields: [tenantId, xId], references: [tenantId, id])`, so a row can never reference another tenant's
  row even if application code has a bug. Prisma rejects composite relations that mix a required `tenantId` with an
  optional FK, so OPTIONAL relations (`Order.importBatchId`, `ProductOperation.machineId`, `AuditLog.actorUserId`,
  `Tenant.defaultCalendarId`) use a plain FK plus a same-tenant check in the action; they are listed as documented
  exceptions in ARCHITECTURE.md.
* Intra-tenant referential actions: `onDelete: Cascade` for owned children (Product→BomItem, Product→ProductOperation,
  ShiftCalendar→Shift, ShiftCalendar→CalendarException, Machine→DowntimeWindow, ImportBatch→(Order.importBatchId
  SetNull)); `onDelete: NoAction` (checked at statement end so a Tenant cascade still succeeds) for Order→Product,
  Order→Customer, BomItem→Material, StockMovement→Material, ProductOperation→WorkCenter, ProductOperation→Machine,
  Machine→WorkCenter, Machine→ShiftCalendar; `SetNull` for AuditLog.actorUserId and Tenant.defaultCalendarId;
  `NoAction` for every `createdById`. The application blocks deleting referenced master data (count check in the
  action + catch P2003) and offers Deactivate instead.
* Business unique constraints are composite with `tenantId` (`@@unique([tenantId, orderNumber])`, etc.).
* Postgres RLS is deferred to M3 hardening (ARCHITECTURE.md records the decision). M1 preserves the prerequisites: all
  access flows through `tenantDb()`, so RLS can later be added inside the extension without touching module code.
* Tests: `tests/unit/tenant-scope.test.ts` (query rewriting + `scopeWriteData`: tenantId override on create, stripped
  on update, throw on connect/connectOrCreate/set/disconnect at any depth, nested create gets tenantId, default-deny,
  Tenant handling, raw ops throw). `tests/unit/tenant-scope-coverage.test.ts`: parse `prisma/schema.prisma`; every
  model with a `tenantId` field MUST be in `TENANT_SCOPED_MODELS`; every model without one MUST be in the allowlist
  `{ Tenant, RateLimitBucket }`. `tests/integration/tenant-isolation.test.ts`: two tenants; assert `tenantDb(A)`
  cannot read/update/delete/count B rows via any op class; `update({data:{tenantId:B}})` leaves the row in A;
  `tenant.findUnique({where:{id:B}})` returns null; `createManyAndReturn` rows carry A; a nested `bomItems.create`
  referencing a B material fails at the DB; the `tx` client inside `$transaction` is still scoped.

## 3. Authentication & RBAC

Roles (enum `Role`): `ADMIN`, `PLANNER`, `SUPERVISOR`, `VIEWER`. Permissions (`src/lib/rbac.ts`, `Permission` union +
`can(role, permission)`; unit test snapshots this table):

| Permission | ADMIN | PLANNER | SUPERVISOR | VIEWER |
|---|---|---|---|---|
| `*:read` — dashboard, orders, customers, products, materials, machines, work centers, calendars | ✓ | ✓ | ✓ | ✓ |
| `orders:write` — create / edit orders, CSV import | ✓ | ✓ | – | – |
| `orders:status` — non-cancel status transitions (see §4) | ✓ | ✓ | ✓ | – |
| `orders:cancel` — set CANCELLED; reopen terminal orders (ADMIN only for reopen) | ✓ | ✓ | – | – |
| `customers:write` — create (also implicitly via order form/import), edit, delete when unreferenced | ✓ | ✓ | – | – |
| `products:write` — products, BOM items, routing | ✓ | ✓ | – | – |
| `materials:write` — materials master | ✓ | ✓ | – | – |
| `stock:move` — RECEIPT / ISSUE / RETURN movements | ✓ | ✓ | ✓ | – |
| `stock:adjust` — ADJUSTMENT (counted stock override) | ✓ | ✓ | – | – |
| `machines:write` — work centers, machines, shift calendars | ✓ | ✓ | – | – |
| `downtime:write` — downtime / maintenance windows | ✓ | ✓ | ✓ | – |
| `users:manage` — invite, edit name/role, reset password, deactivate/reactivate | ✓ | – | – | – |
| `tenant:manage` — tenant name, timezone, default calendar | ✓ | – | – | – |
| `audit:read-all` — see User/Tenant audit rows in activity feeds | ✓ | – | – | – |
| `profile:self` — own name, own password, sign out everywhere | ✓ | ✓ | ✓ | ✓ |

Implementation (authoritative details in STACK_NOTES for APIs):
* `requirePermission(permission)` (`src/lib/auth/guards.ts`) → `{ session, db }`. It calls `requireSession()`
  (redirects on missing/revoked session) then throws `ForbiddenError` when `can()` is false. Pages catch it via
  Next's `forbidden()`/a 403 page; Server Actions are wrapped by `withAction()` which converts it to
  `{ ok: false, error: "forbidden" }`. EVERY `(app)` page and EVERY action calls this itself; the layout and proxy
  are never the authorization authority. There is no `requireRole`.
* Session JWT (`jose`, HS256, key = `AUTH_SECRET`). Claims: `sub` = user.id, `tid` = tenantId, `role` (HINT for the
  proxy only), `tv` = tokenVersion, `iat`, `exp` = iat + 7 d, `iss` = `"prodplan"`, `aud` = APP_URL origin. Verify
  with `jwtVerify(token, key, { algorithms: ["HS256"], issuer, audience, clockTolerance: 30 })`. Sliding renewal:
  `requireSession()` re-issues the cookie when < 3 days remain, but only from Server Actions / Route Handlers.
  Cookie: `__Host-pp_session` when `APP_URL` is https, else `pp_session`; `httpOnly`, `sameSite=lax`, `secure` when
  https, `path=/`, `maxAge` 7 d.
* `src/lib/auth/session.ts`: `getSession()` (wrapped in `React.cache`) returns `null` when the cookie is
  missing/invalid/expired, `{ status: "revoked" }` when the JWT verifies but the DB user is `isActive=false` or
  `tokenVersion !== tv`, else `{ status: "ok", user: UserDTO, tenant }`. `requireSession()` redirects `revoked` →
  `/logout?reason=revoked`, `null` → `/login?next=<current path>`, and users with `mustChangePassword=true` →
  `/settings/profile?force=1` (except that page, `/logout`, and the change-password action).
* `src/app/logout/route.ts` (GET + POST): clears the cookie (`maxAge: 0`, same attributes) and redirects to
  `/login?reason=…`. Idempotent, no other state. The user menu "Sign out" uses `logoutAction()` (Server Action).
* `src/proxy.ts`: (a) redirect to `/login?next=` when no cookie or signature/exp verification fails; (b) redirect
  `/login` and `/signup` → `/dashboard` when the cookie verifies; (c) pass `/logout`, `/api/health`, `/_next/**`,
  static assets untouched; (d) pre-filter `/settings/users` and `/settings/tenant` to `role === "ADMIN"` using the
  JWT hint. Never touches the DB (edge runtime, `jose` only — no `bcryptjs`, no Prisma).
* `safeNext(next)` (`guards.ts`, unit-tested): honour `next` only if it is a string starting with a single `/`, second
  char not `/` or `\`, no `\`, no scheme (`/^[a-z][a-z0-9+.-]*:/i`), length ≤ 512, and not starting with `/logout`,
  `/login`, `/signup`; otherwise `/dashboard`.
* Passwords: zod `min(8).max(72)`, must not equal the email; bcrypt cost 12. Emails `trim().toLowerCase()` at signup,
  invite and login, stored lowercased, `.email().max(254)`. Login runs `bcrypt.compare(password, DUMMY_HASH)` when
  the email is unknown so timing does not reveal existence; success updates `lastLoginAt` and writes an AuditLog
  LOGIN row. Error message is always "Invalid email or password".
* Rate limiting (`src/lib/rate-limit.ts`, platform-level model `RateLimitBucket(key @id, count, resetAt)`):
  `hit(key, limit, windowSec)` = one `upsert` (create `{count:1, resetAt}` / update `{count: {increment: 1}}`) then
  reset when `resetAt < now`; correct across serverless instances. Keys: `login:ip:<ip>` (20/15 min),
  `login:email:<sha256(email)>` (10/15 min), `signup:ip:<ip>` (5/60 min). Client IP = `x-nf-client-connection-ip`,
  else last hop of `x-forwarded-for`, else `unknown`. When limited, return the same generic message plus "Too many
  attempts, try again in N minutes". Buckets with `resetAt` older than 1 day are deleted opportunistically.
* Signup form: company (tenant) name, plant timezone (searchable Select from `Intl.supportedValuesOf("timeZone")`,
  default `Asia/Kolkata`), your name, email, password. `slugify(name)` (a-z0-9-, ≤ 40, fallback `company`), reserved
  list (`admin, api, app, www, login, signup, settings`), on P2002 retry with `-2`, `-3` … up to 5. Slug is internal
  in M1. Signup/invite for an existing email return "An account with this email already exists" (documented decision).
* Users (ADMIN, `/settings/users`): list, invite (name, email, role, temporary password), edit name/role, reset
  password, deactivate/reactivate. Invite and reset set `mustChangePassword=true`; the temporary password is shown
  exactly once in a Dialog with a Copy button ("Share this securely; it will not be shown again") and is never
  persisted or audited. Any change to ANOTHER user's role/password/isActive bumps that user's `tokenVersion`.
  Own password/name change bumps own `tokenVersion` and immediately re-issues the actor's cookie. Profile has "Sign
  out everywhere" (bump + re-issue).
* Last-admin guard: every user-management mutation runs in `db.$transaction(async tx => …)` that FIRST does
  `tx.tenant.update({ where:{ id }, data:{ updatedAt: new Date() } })` (row lock serialises admin mutations per
  tenant), performs the change, then asserts `count({ role: "ADMIN", isActive: true }) ≥ 1` or throws `LastAdminError`
  (rollback). Applies to self-changes too.
* `src/lib/auth/user-dto.ts`: `userSelect = { id, tenantId, email, name, role, isActive, mustChangePassword,
  lastLoginAt, createdAt, updatedAt }` and `UserDTO`. Outside `src/lib/auth/**` every `user.find*` passes
  `select: userSelect`; `passwordHash`/`tokenVersion` are read only in `src/lib/auth/**`. `toPlain()` strips
  `passwordHash` and `tokenVersion` at any depth (unit-tested). ESLint/unit test fails on the literal `passwordHash`
  outside `src/lib/auth/**`, `prisma/seed.ts`, `tests/**`.
* Login page copy: below the form, "Forgot your password? Ask your plant admin to reset it." (email reset is M3).

## 4. Data model (Prisma) — all M1 tables

Conventions: `id String @id @default(cuid())`, `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`.
Quantities are `Decimal @db.Decimal(14,3)`. Calendar dates are `DateTime @db.Date` in the DB but cross the
application boundary ONLY as ISO strings `YYYY-MM-DD` (`src/lib/dates.ts`: `toDateOnly(Date)`,
`fromDateOnly(string)`, `todayInTz(tz)`, `addDays(iso, n)`). Timestamps are UTC instants rendered in the tenant
timezone. `toPlain()` (`src/lib/serialize.ts`) converts Decimal → number, Date → ISO string, strips sensitive keys;
every page maps rows to explicit DTOs before passing to client components.

```
Tenant        id, name, slug (unique), timezone (default "Asia/Kolkata"), orderSeq Int(0), defaultCalendarId String? (plain FK → ShiftCalendar, SetNull), createdAt, updatedAt
User          id, tenantId, email (unique), name, passwordHash, role Role, isActive Bool(true), mustChangePassword Bool(false), tokenVersion Int(0), lastLoginAt?, createdAt, updatedAt   @@index([tenantId]) @@unique([tenantId, id])
RateLimitBucket key String @id, count Int, resetAt DateTime            (platform-level, no tenantId)
Customer      id, tenantId, name, code?, email?, phone?, notes?, isActive Bool(true)            @@unique([tenantId, name]) @@unique([tenantId, id])
Product       id, tenantId, sku, name, description?, unit (default "pcs"), isActive Bool(true)   @@unique([tenantId, sku]) @@unique([tenantId, id])
ProductOperation id, tenantId, productId (composite FK, Cascade), sequence Int, workCenterId (composite FK, NoAction), machineId String? (plain FK, NoAction; optional fixed machine), setupMinutes Int(0), runMinutesPerUnit Decimal(14,3)   @@unique([tenantId, productId, sequence]) @@unique([tenantId, id])
Material      id, tenantId, code, name, unit, stockOnHand Decimal(0), reorderThreshold Decimal(0), reorderLeadTimeDays Int(0), unitCost Decimal(14,2)?, supplier?, isActive Bool(true)   @@unique([tenantId, code]) @@unique([tenantId, id])
BomItem       id, tenantId, productId (composite FK, Cascade), materialId (composite FK, NoAction), quantityPerUnit Decimal, scrapPercent Decimal(5,2)(0), note?   @@unique([tenantId, productId, materialId]) @@unique([tenantId, id])
StockMovement id, tenantId, materialId (composite FK, NoAction), type StockMovementType (RECEIPT|ISSUE|ADJUSTMENT|RETURN), quantity Decimal (SIGNED delta), balanceAfter Decimal, reference?, note?, createdById (plain FK → User, NoAction), createdAt   @@index([tenantId, materialId, createdAt])
WorkCenter    id, tenantId, code, name, description?, isActive Bool(true)     @@unique([tenantId, code]) @@unique([tenantId, id])
ShiftCalendar id, tenantId, name, isActive Bool(true)                          @@unique([tenantId, name]) @@unique([tenantId, id])
Shift         id, tenantId, calendarId (composite FK, Cascade), name, startTime "HH:MM", endTime "HH:MM", daysOfWeek Int[] (0=Sun..6=Sat, weekday of the shift START date), breakMinutes Int(0)   @@unique([tenantId, id])
CalendarException id, tenantId, calendarId (composite FK, Cascade), date @db.Date, isWorking Bool, note?   @@unique([tenantId, calendarId, date])
Machine       id, tenantId, workCenterId (composite FK, NoAction), calendarId (REQUIRED, composite FK, NoAction), code, name, status MachineStatus (ACTIVE|INACTIVE|MAINTENANCE), efficiencyPercent Int(100) (1..150), ratedCapacityPerShift Decimal?, capacityUnit?, notes?   @@unique([tenantId, code]) @@unique([tenantId, id])
DowntimeWindow id, tenantId, machineId (composite FK, Cascade), startsAt, endsAt, type DowntimeType (MAINTENANCE|BREAKDOWN|OTHER), reason?, createdById, createdAt   @@index([tenantId, machineId, startsAt])
Order         id, tenantId, orderNumber, customerId (composite FK, NoAction), productId (composite FK, NoAction), quantity Decimal, priority OrderPriority (LOW|NORMAL|HIGH|URGENT), dueDate @db.Date, earliestStartDate @db.Date?, status OrderStatus (QUEUED|IN_PROGRESS|ON_HOLD|COMPLETED|CANCELLED), completedAt DateTime?, customerPoRef?, notes?, importBatchId String? (plain FK, SetNull), createdById, createdAt, updatedAt   @@unique([tenantId, orderNumber]) @@index([tenantId, dueDate]) @@index([tenantId, status]) @@unique([tenantId, id])
ImportBatch   id, tenantId, fileName, status ImportBatchStatus (PENDING|COMMITTED|DISCARDED), rows Json? (validated preview rows + per-row errors), rowCount, validCount, errorCount, importedCount Int(0), createdById, createdAt, updatedAt   @@unique([tenantId, id])
AuditLog      id, tenantId, actorUserId? (plain FK → User, SetNull), actorEmail?, actorName?, ip?, userAgent?, entityType, entityId, entityLabel?, action AuditAction (CREATE|UPDATE|DELETE|STATUS_CHANGE|IMPORT|LOGIN), summary String, changedFields String[], before Json?, after Json?, createdAt   @@index([tenantId, createdAt]) @@index([tenantId, entityType, entityId])
```

Semantics and business rules:
* **Orders.** One Order = one product line; multi-line POs are several orders sharing `customerPoRef`.
  `orderNumber`: auto `SO-%06d` from `Tenant.orderSeq` (reserve N numbers with one
  `tenant.update({ data: { orderSeq: { increment: N } }, select: { orderSeq: true } })`; retry up to 5× on P2002).
  User-provided numbers are trimmed, upper-cased, `^[A-Z0-9._/-]{3,32}$`, and may NOT match `^SO-\d{6}$` (reserved).
  Status is the header status (M2 adds per-operation statuses that roll up). Legal transitions
  (`src/lib/orders/status.ts`, `canTransition(from, to, role)`, unit-tested): QUEUED → IN_PROGRESS | ON_HOLD |
  CANCELLED; IN_PROGRESS → ON_HOLD | COMPLETED | CANCELLED; ON_HOLD → QUEUED | IN_PROGRESS | CANCELLED; COMPLETED and
  CANCELLED are terminal, except ADMIN may reopen COMPLETED → IN_PROGRESS and CANCELLED → QUEUED. CANCELLED requires
  `orders:cancel`; other transitions `orders:status`. ON_HOLD requires a reason; CANCELLED accepts an optional reason;
  reasons go into the STATUS_CHANGE audit row. `completedAt` is set on COMPLETED and cleared on reopen. Edit locks:
  `customerId`, `productId`, `orderNumber` are locked once status ≠ QUEUED; `quantity`, `priority`, `dueDate`,
  `earliestStartDate`, `customerPoRef` editable until terminal; only `notes` editable in a terminal state.
  Create requires `dueDate ≥ todayInTz`; edit allows past dates (order is then overdue); `earliestStartDate ≤ dueDate`.
* **BOM maths** (`src/lib/bom.ts`, unit-tested; no page computes inline): `quantityPerUnit` is in `Material.unit`
  per ONE `Product.unit` (no unit conversion in M1). `requiredPerUnit = quantityPerUnit × (1 + scrapPercent/100)`;
  gross requirement for an order = `Order.quantity × requiredPerUnit` (3 dp); product coverage
  (`Buildable from stock`) = `floor(min over BOM items of stockOnHand / requiredPerUnit)`. Labelled "vs unallocated
  stock on hand (does not net other open orders — allocation arrives with the M2 scheduler)".
* **Routing.** `sequence` stored as 10, 20, 30 …; add/reorder runs `renumber(productId)` in one transaction that
  first sets affected rows to negative temporaries then final values (unique constraint stays). Optional `machineId`
  must belong to the selected work center (label "Fixed machine (optional; blank = any machine in the work center)").
  Operation duration on a machine = `(setupMinutes + quantity × runMinutesPerUnit) × 100 / efficiencyPercent`
  (documented for M2; not displayed in M1 beyond the routing preview on order detail).
* **Stock.** `Material.stockOnHand` changes ONLY via `applyStockMovement(tx, …)`. The UI never asks for signed
  numbers: the form takes Type + positive Quantity (> 0, ≤ 3 dp); for ADJUSTMENT the field is "New stock on hand"
  (≥ 0) and the server computes `delta = counted − current`. Signed delta: RECEIPT/RETURN = +qty, ISSUE = −qty.
  Atomic write: `updateMany({ where: { id, tenantId, ...(delta < 0 ? { stockOnHand: { gte: -delta } } : {}) },
  data: { stockOnHand: { increment: delta } } })` must affect exactly 1 row, else throw `StockWouldGoNegative`
  ("Only {onHand} {unit} on hand"); then insert the movement with `balanceAfter`. Stock can never be negative.
  Integration test: two concurrent ISSUEs against a balance covering only one → exactly one succeeds.
* **Machines & capacity.** `Machine.status` is a manual availability flag: ACTIVE = schedulable; INACTIVE =
  retired (hidden from pickers); MAINTENANCE = out of service until set back to ACTIVE. `DowntimeWindow` is a
  time-bounded unavailability and never changes `status`. Active downtime = `startsAt ≤ now < endsAt`. Capacity
  is time-based: net shift minutes × `efficiencyPercent/100` minus downtime overlap (`src/lib/calendar.ts`, see §6.3);
  `ratedCapacityPerShift` + `capacityUnit` is an optional informational "Rated output per shift" shown in lists.
* **Calendars.** All calendar maths in `Tenant.timezone`. A shift belongs to the date on which it STARTS;
  `daysOfWeek` are start-date weekdays; `endTime ≤ startTime` means it ends next day (22:00–06:00 on [1] runs Mon
  22:00 → Tue 06:00, counted on Monday). Net minutes = duration − `breakMinutes` and must be > 0. Shifts within a
  calendar must not overlap (server validation). `CalendarException`: `isWorking=false` removes all shifts that
  day; `isWorking=true` on a non-working weekday runs ALL of the calendar's shifts. A calendar must keep ≥ 1 shift;
  it cannot be deleted while it is the tenant default or referenced by a machine (offer "Set another default" /
  Deactivate). `Machine.calendarId` is required and pre-filled from the tenant default at create time (explicit per
  machine; switching the default never silently changes existing machines).
* **Customers.** `name` trimmed and internal whitespace collapsed; uniqueness/lookup (order form, import) match
  case-insensitively (`mode: "insensitive"`); the typed casing is used when creating. Shared helper
  `findOrCreateCustomer(tx, name)`.
* **Units.** `Product.unit`/`Material.unit` are Inputs with a `datalist` (pcs, nos, kg, g, m, mm, l, ml, set, box),
  trimmed + lower-cased on save, and shown as a suffix wherever a quantity is displayed.
* **Delete vs deactivate.** Hard delete is offered only when the server confirms no NoAction reference exists;
  otherwise the UI shows Deactivate (`isActive=false` / Machine status INACTIVE). Inactive rows are hidden from
  pickers, shown in lists with an "Inactive" badge behind an "Include inactive" filter. Materials with any
  StockMovement are never hard-deleted. Users are never deleted.
* **Audit contract** (`src/lib/audit.ts`). `audit(tx, { entityType, entityId, entityLabel, action, before, after,
  summary })` MUST be called with the SAME scoped transaction client as the mutation. It computes `changedFields`,
  deletes keys matching `/password|secret|token/i` and `updatedAt` from before/after, fills actor/ip/userAgent from
  the session + headers. Required events: CREATE/UPDATE/DELETE for Order, Customer, Product, ProductOperation,
  BomItem, Material, WorkCenter, Machine, DowntimeWindow, ShiftCalendar, Shift, CalendarException, User (DTO only),
  Tenant; CREATE for StockMovement; STATUS_CHANGE for order status; IMPORT per batch (entityId = batchId, after =
  counts + orderNumbers) plus one CREATE row per imported order via a single `createMany`; LOGIN on success.
  `summary` is human-readable ("Order SO-000123 status IN_PROGRESS → COMPLETED"). Append-only. Activity feeds hide
  `entityType in (User, Tenant)` for roles without `audit:read-all`.

## 5. Application structure

```
src/
  proxy.ts
  app/
    layout.tsx, globals.css, page.tsx (→ /dashboard or /login), forbidden.tsx, not-found.tsx, error.tsx
    (auth)/login/page.tsx, (auth)/signup/page.tsx, (auth)/actions.ts
    logout/route.ts
    (app)/layout.tsx           ← requireSession(); AppShell (sidebar + topbar)
    (app)/dashboard/page.tsx (+ actions.ts for "Load demo data")
    (app)/orders/{page.tsx,new/page.tsx,import/page.tsx,[id]/page.tsx,[id]/edit/page.tsx,actions.ts}
    (app)/customers/{page.tsx,new/page.tsx,[id]/page.tsx,[id]/edit/page.tsx,actions.ts}
    (app)/products/{page.tsx,new/page.tsx,[id]/page.tsx,[id]/edit/page.tsx,actions.ts}   ← BOM + routing editors on detail
    (app)/materials/{page.tsx,new/page.tsx,[id]/page.tsx,[id]/edit/page.tsx,actions.ts}  ← stock ledger + movement dialog on detail
    (app)/machines/{page.tsx,new/page.tsx,[id]/page.tsx,[id]/edit/page.tsx,actions.ts}   ← downtime dialogs on detail
    (app)/work-centers/{page.tsx,actions.ts}                                              ← table + WorkCenterDialog
    (app)/calendars/{page.tsx,new/page.tsx,[id]/page.tsx,actions.ts}                    ← [id] IS the editor
    (app)/settings/{layout.tsx (tabs), tenant/page.tsx, users/page.tsx, profile/page.tsx, actions.ts}
    api/health/route.ts        ← { ok, db, version } only
    api/orders/template/route.ts ← CSV template (header + 2 example rows)
  lib/
    db.ts  serialize.ts  dates.ts  format.ts  csv.ts  audit.ts  rbac.ts  rate-limit.ts  errors.ts  action.ts (withAction)
    auth/{password.ts,session.ts,guards.ts,user-dto.ts,slug.ts}
    orders/{status.ts,numbers.ts,kpis.ts,import.ts}  bom.ts  routing.ts  calendar.ts  stock.ts  customers.ts
    demo/seed-tenant.ts  (seedDemoData(db, tenant, actor) — used by prisma/seed.ts AND the dashboard action)
    validation/*.ts (zod schemas per module)
  components/ui/*  components/layout/{AppShell,Sidebar,Topbar,PageHeader,NewMenu,UserMenu}
  components/data/{DataTable,Pagination,SearchInput,FilterBar,StatusBadge,PriorityBadge,DueHint,EmptyState,ConfirmDialog,AuditList}
  components/forms/{FormField,FieldErrors,SubmitButton,Combobox,DateInput,DateTimeInput,UnitInput}
  generated/prisma  (git-ignored)
prisma/schema.prisma, prisma/migrations/**, prisma/seed.ts
tests/unit/**, tests/integration/**, vitest.config.ts
docs/*.md, README.md, .env.example, netlify.toml, Dockerfile, docker-compose.yml
```

**Navigation.** Sidebar groups, in order: **Plan** — Dashboard (`LayoutDashboard`), Orders (`ClipboardList`);
**Master data** — Customers (`Users`), Products (`Package`), Materials (`Boxes`), Machines (`Cog`), Work centers
(`Factory`), Shift calendars (`CalendarClock`); **Settings** — Settings (`Settings`; ADMIN sees Tenant + Users +
Profile tabs, others only Profile). All roles see Plan/Master data (read-only for VIEWER; create/edit controls hidden
via `can()`). Active item = pathname prefix. Topbar: Sheet trigger (< lg), tenant name, a "+ New" dropdown (Order,
Customer, Product, Material, Machine — filtered by `can()`), user menu (name, role badge, Profile, Sign out).
Landing after login for every role = `/dashboard`. Breadcrumb in PageHeader for depth ≥ 2 (Orders / SO-000123).

**List URL contract** (all lists): `q`, `page` (1-based, 25/page), `sort`, `dir` (asc|desc), plus module filters —
orders: `status` (comma list; default `open` = QUEUED,IN_PROGRESS,ON_HOLD; `all`), `priority`, `customerId`,
`dueFrom`, `dueTo`, `batch`; materials: `belowThreshold=1`, `includeInactive=1`; machines: `workCenterId`,
`status`; products/customers/work-centers/calendars: `includeInactive=1`. Filters render as a toolbar row that
collapses into a "Filters" Sheet below md with an active-filter count badge and a "Clear" link. Pagination shows
"Showing 26–50 of 312". Orders list default sort `dueDate asc`.

**Forms.** Server Actions + `useActionState`; zod field errors inline (`aria-describedby`); success toast + redirect.
Any select whose source list is empty renders "No {entity} yet — Create one" (link with `?return=`). Destructive
actions use `ConfirmDialog`. Datetime inputs = separate date + time (15-min step) fields interpreted in the tenant
timezone and converted to UTC on the server.

**Responsive / floor use.** Full sidebar ≥ lg, Sheet below. Controls: Button default `h-11` (44 px), Input /
SelectTrigger / Checkbox hit area 44 px, icon buttons `size-11`; 36 px `sm` variants only inside dense desktop
tables. `DataTable` columns declare `priority: 1|2|3` (3 hidden < lg, 2 hidden < md, 1 always); first column sticky;
row height 48 px; row actions in a kebab `DropdownMenu`. Forms single column < md, two columns ≥ md, sticky bottom
action bar < md. Body never scrolls horizontally.

**Colour semantics** (Tailwind class maps in `StatusBadge`/`PriorityBadge`/`DueHint`; text label always present):
Order status — QUEUED slate, IN_PROGRESS blue, ON_HOLD amber, COMPLETED green, CANCELLED gray outline. Priority —
LOW gray outline, NORMAL neutral, HIGH orange, URGENT red filled. Machine status — ACTIVE green, INACTIVE gray,
MAINTENANCE amber; active downtime adds a red badge "Down · {type} until {HH:mm}". Downtime type — MAINTENANCE
amber, BREAKDOWN red, OTHER gray. Due hint — overdue red "Overdue 3d"; today/tomorrow amber "Due today"/"Due
tomorrow"; ≤ 7 days default "Due in 5d"; else muted date. Materials ≤ threshold — amber row tint + "Below reorder"
(or "At reorder" when equal).

**Dates in UI** (`format.ts`): calendar dates `05 Sep 2026`; timestamps `05 Sep 2026, 14:30` (tenant tz, 24 h);
relative time ("2 h ago") for activity with the absolute value in `title`. All formatting happens in Server
Components (strings passed down) to avoid hydration mismatches. `todayInTz(tenant.timezone)` is the ONLY source of
"today" for due hints, validation and KPIs — never `new Date()` date arithmetic.

**Empty states.** Every list page defines its EmptyState (icon, title, one line, primary CTA; Orders also "Import
CSV"). A filtered list with no results shows "No results for …" with "Clear filters". No global search in M1 (each
list has `?q=`); the topbar "+ New" menu covers quick actions.

## 6. Module requirements

### 6.1 Orders
* List columns (priority): order # (1), customer (2), product `sku · name` (1), qty + unit (2), priority (2), due
  date + DueHint (1), status (1), created (3), PO ref (3). Search matches order #, customer name, product sku/name, PO
  ref (case-insensitive contains). Row kebab: View, Edit (if allowed), Change status (opens `StatusDialog`, per RBAC).
* Create/Edit field order: Customer (Combobox: search existing, last option `Create "{typed}"`), Customer PO ref,
  Product (Combobox, active only, `sku · name`; unit becomes the quantity suffix), Quantity (> 0, ≤ 3 dp — "Enter a
  quantity greater than 0"), Due date (create: min today — "Due date cannot be in the past"), Start not before
  (optional), Priority (default NORMAL), Order number (collapsed row "Auto — next SO-000124 · Set manually"; "Order
  {n} already exists" on duplicate), Notes. Status is not on the form; new orders are QUEUED. Edit respects the lock
  rules in §4 (locked fields rendered read-only with a hint; terminal orders show a banner and only Notes editable).
* Detail: header (order #, status badge, priority, due + hint), fields, customer link, product link, **Material
  requirement** table (material, required = qty × requiredPerUnit, on hand, short by, badge) using `lib/bom.ts`,
  **Routing preview** (seq, work center, setup, run/unit, est. minutes at 100 %), `StatusDialog` (Select limited to
  legal targets; reason field required for ON_HOLD; ConfirmDialog for COMPLETED/CANCELLED), audit history (`AuditList`).
* CSV import `/orders/import` (3 steps, client component + actions in `lib/orders/import.ts`):
  1. Upload: file input/dropzone (.csv ≤ 1 MB — keep Next's default body limit — ≤ 2,000 data rows else the whole
     file is rejected; UTF-8, BOM stripped; headers matched case-insensitively after trim), "Download template"
     (`/api/orders/template`: header + 2 example rows; page says "Delete the example rows before importing"), rules
     list. Columns: `order_number?, customer, product_sku, quantity, priority?, due_date, earliest_start_date?,
     customer_po_ref?, notes?`.
  2. `previewImportAction(formData)`: parse (papaparse `header:true, skipEmptyLines:true`), validate every row with
     `importRowSchema`: trim cells; `order_number` per §4 rules, duplicate within file or existing in tenant → error;
     `customer` 1–120 chars; `product_sku` must match an ACTIVE product (case-insensitive) → else error; `quantity`
     > 0, ≤ 3 dp, plain decimal; `priority` case-insensitive, blank = NORMAL; `due_date` `YYYY-MM-DD` (past date =
     WARNING, imports as overdue); `earliest_start_date ≤ due_date`; `customer_po_ref ≤ 64`; `notes ≤ 2000`; control
     chars rejected (except newline in notes). Store result in `ImportBatch { status: PENDING, rows, counts }` and
     return `batchId`. Preview renders from the batch: summary chips ("{n} valid", "{n} with errors", "{n} warnings",
     "{n} new customers"), table (Row #, order #, customer, SKU, qty, priority, due, Errors/Warnings), "Errors only"
     toggle, primary "Import {n} valid rows" (disabled at 0), secondary "Discard".
  3. `commitImportAction(batchId)`: loads the batch via the scoped client, requires `PENDING` and
     `createdById = actor` and age < 1 h, RE-VALIDATES every row against current DB state, then runs the binding
     commit algorithm in ONE `db.$transaction(async tx => …, { timeout: 20_000, maxWait: 5_000 })` with a bounded
     number of statements: (1) `customer.createMany({ skipDuplicates })` for distinct new names + one `findMany` to
     map names → ids (case-insensitive); (2) one `findMany` of products by sku, one of existing order numbers;
     (3) reserve N order numbers with one `tenant.update increment`; (4) `order.createManyAndReturn` in chunks of
     500; (5) `auditLog.createMany` (one CREATE per order + one IMPORT); (6) update the batch to COMMITTED with
     `importedCount`. Target ≤ 25 statements for 2,000 rows; integration test imports 2,000 rows in < 5 s.
     Result step: counts + "View imported orders" → `/orders?batch={id}&status=all`. The client never posts row data
     to the commit step.

### 6.2 Machines & work centers
* `/work-centers`: table (code, name, description, machines count, Inactive badge) with row kebab; create/edit via
  `WorkCenterDialog` (code, name, description); delete blocked with "Used by {n} machines / {m} routing steps" →
  Deactivate. `/machines` header has a secondary action "Work centers".
* `/machines` list: code (1), name (1), work center (2), status badge + active downtime badge (1), calendar (3),
  shifts/day (3), capacity/day min (2), rated output (3). Filters `workCenterId`, `status`, `includeInactive`.
* Machine form: work center (Select), code, name, status, calendar (Select, pre-filled with the tenant default,
  shown as "General shift (default)"), efficiency % (1–150, helper "Effective minutes = shift minutes × efficiency
  %"), Rated output per shift (input group `[120] [pcs] per shift`, optional), notes.
* Machine detail: summary card; **Capacity — next 7 days** table (Date · Day · Shift · Net min · Downtime min ·
  Available min, totals row; non-working/exception days as one muted row "Non-working (Holiday: Diwali)"), using
  `availableMinutes()`; **Downtime windows**: upcoming/active (startsAt asc) with `DowntimeDialog` (date + time
  start/end, type, reason; `endsAt > startsAt`; overlap with an existing window on the same machine is a NON-blocking
  warning "Overlaps with Maintenance 10 Sep 08:00–12:00"), past windows collapsed under "Show past"; delete via
  ConfirmDialog; audit history.

### 6.3 Shift calendars
* `/calendars` list: name, Default badge, shifts count, min/day, machines using it, Inactive badge. `/calendars/new`
  creates a calendar with one default shift. `/calendars/[id]` is the editor: header card (name via dialog, "Default"
  badge, "Set as default" (updates `Tenant.defaultCalendarId`, `tenant:manage` or `machines:write`), "Used by {n}
  machines"); **Shifts** card: table Name · Start · End · Days · Break · Net min, `ShiftDialog` (Name, Start, End
  (helper "ends next day" when End ≤ Start), Days as seven 44 px toggle chips Mon…Sun stored 0=Sun..6=Sat, Break
  minutes; ≥ 1 day, net > 0, no overlap); weekly summary "Mon–Sat · 2 shifts · 900 min/day · 5,400 min/week";
  **Exceptions** card: Date · Working? · Note (past collapsed), `ExceptionDialog` (date default today, Working /
  Non-working, note; "An exception for this date already exists"). Delete via ConfirmDialog; blocked when default or
  used.
* `src/lib/calendar.ts` (unit-tested incl. midnight crossing, break subtraction, exceptions both ways, overlap
  rejection, efficiency, downtime overlap, Sunday-overtime exception): `shiftsOn(calendar, isoDate, tz):
  ShiftInstance[]` (absolute UTC `startsAt/endsAt`, `netMinutes`), `dailyCapacityMinutes(calendar)`,
  `availableMinutes(machine, calendar, downtimes, isoDate, tz)`, `validateShifts(shifts)`.

### 6.4 Materials & inventory
* List: code (1), name (1), unit (3), on hand (1), reorder threshold (2), lead time days (3), supplier (3), badge
  (1). Filter `belowThreshold=1`, `includeInactive=1`. Row tint per colour semantics.
* Form: code, name, unit (`UnitInput`), reorder threshold, reorder lead time (days), unit cost, supplier, active.
* Detail: on-hand card, **Record movement** button → `MovementDialog` (Type; Quantity or "New stock on hand" for
  ADJUSTMENT (`stock:adjust`); Reference; Note); **Ledger** (paginated): when, type badge, ± quantity coloured,
  balance after, reference, by; **Where used** (products whose BOM uses it with qty/unit); audit history.

### 6.5 Products & BOM
* List: sku (1), name (1), unit (3), BOM lines (2), routing steps (3), buildable from stock (2), Inactive badge (1).
* Form: sku, name, description, unit (`UnitInput`), active.
* Detail: **BOM** table — Material (code · name) · Qty/unit · Scrap % · Required/unit · On hand · Buildable · Note ·
  actions; header "Buildable from stock: {min} {unit}" highlighting the limiting row; `BomItemDialog` (Material
  Combobox over active materials showing unit, qty per unit, scrap %, note; "Already in this BOM"). **Routing**
  table — Seq · Work center · Fixed machine · Setup min · Run min/unit · actions; `OperationDialog`; reorder via
  Up/Down 44 px icon buttons (no drag-and-drop in M1). No inline cell editing.

### 6.6 Dashboard
* Definitions (`src/lib/orders/kpis.ts`, shared with the orders list): open = status ∈ {QUEUED, IN_PROGRESS,
  ON_HOLD}; overdue = open ∧ dueDate < today; due in 7 days = open ∧ today ≤ dueDate ≤ today+7; in progress =
  IN_PROGRESS; machines active = status ACTIVE ∧ no window covering now; in maintenance = status MAINTENANCE; down
  now = ACTIVE ∧ active window; materials below reorder = isActive ∧ stockOnHand ≤ reorderThreshold.
* Tiles (each a link to the identically-filtered list): Orders — Open, Overdue, Due in 7 days, In progress;
  Resources — Machines ("5 active · 1 in maintenance · 2 down now"), Materials below reorder. Overdue / below-reorder
  turn amber/red only when > 0.
* **Orders by due date**: open orders, dueDate asc, first 10 (overdue rows styled), columns order#, customer,
  product, qty, due, priority, status, "View all". **Machines**: first 10 by work center then code, columns code,
  name, work center, status, current downtime, "View all {n}". **Recent activity**: 10 rows via `describeAudit()`
  ("{actor} {verb} {entity} {label}", entity linked, relative time), filtered per `audit:read-all`.
* **First-run**: when the tenant has 0 orders, render a "Set up your plant" checklist card above the tiles: 1 Add
  work centers, 2 Review shift calendar, 3 Add machines, 4 Add materials, 5 Add products & BOM, 6 Create your first
  order / Import CSV — each with a done check (count > 0) and a button; plus, for ADMIN when the tenant has 0
  products and 0 orders, a "Load demo data" button (`loadDemoDataAction` → `seedDemoData()`; ConfirmDialog; audit
  IMPORT). Card disappears once orders exist.
* One round trip with a handful of aggregate queries; target < 2 s on staging.

### 6.7 Customers
* List (name, code, email, phone, open orders, next due) with search; create/edit (name required, code, email, phone,
  notes); delete blocked when orders exist → Deactivate. Detail: customer's orders table (same columns as §6.1) and
  "New order for this customer" → `/orders/new?customerId=`.

### 6.8 Settings
* Tenant (ADMIN): name, timezone (searchable Select), default calendar (Select). Users (ADMIN): per §3. Profile (all):
  name, change password (current + new, per policy; clears `mustChangePassword`), "Sign out everywhere".

## 7. Seed & demo data

`src/lib/demo/seed-tenant.ts` exports `seedDemoData(db: TenantDb, tenant, actor)` and is used by BOTH
`prisma/seed.ts` and the dashboard "Load demo data" action (staging has no external DB write access — see
STAGING_STATUS.md). Rules: idempotent for the seed script (deletes tenants `acme` and `beta` by slug, cascade, then
recreates); refuses to run unless `DATABASE_URL` host is `127.0.0.1`/`localhost` or `SEED_ALLOW=1`. All dates are
relative to run date D in the tenant timezone: 24 orders due D−12…D+30 (6 overdue, 8 within 7 days), 4 COMPLETED
(past due dates, `completedAt` set) and 2 CANCELLED, remaining QUEUED/IN_PROGRESS/ON_HOLD; holiday exception on the
first Friday after D+7; a MAINTENANCE window D+2 08:00–12:00 local; one past BREAKDOWN window. Realism: tenant
"Acme Precision Works" (slug `acme`, Asia/Kolkata); users `admin@acme.test`, `planner@acme.test`,
`supervisor@acme.test`, `viewer@acme.test` (password `Password123!`); 6 customers named like Indian OEMs; default
calendar "Two shifts" (06:00–14:00, 14:00–22:00, Mon–Sat, 30-min break) + "General shift"; work centers CNC,
Assembly, Paint; 6 machines (CNC ×3, efficiency 85–100 %, one MAINTENANCE); 12 materials with codes like
`RM-AL6061-BAR` (kg), `HW-M8-BOLT` (pcs), `PT-RAL9005` (l) — 3 below threshold, each used by a QUEUED order so the
short indicator shows; 5 products (e.g. `HB-200` Hydraulic Bracket, `GX-40` Gearbox Housing) with 3–5 BOM lines
(fractional kg, 2–5 % scrap) and routing CNC → Assembly → Paint sized so a 200–500 pc order needs 1–2 CNC shifts;
every IN_PROGRESS order has matching ISSUE movements; RECEIPT history for all materials; audit rows for everything.
Second tenant "Beta Fabrication" (`beta`, `admin@beta.test`) reuses SKU `HB-200` and a customer named exactly like an
Acme customer to prove composite uniqueness across tenants, with 3 orders. HANDOVER notes that demo credentials
are public and must be rotated before real data is entered.

## 8. Quality bar

* `npm run typecheck`, `npm run lint`, `npm test` (unit + integration; integration skips with a clear message if
  `TEST_DATABASE_URL` is unreachable), and `npm run build` all pass.
* ESLint: `no-restricted-imports` forbids importing `prisma` from `@/lib/db` and `PrismaClient` from
  `@/generated/prisma/*` outside the allowed files (§2); the literal `passwordHash` is forbidden outside
  `src/lib/auth/**`, `prisma/seed.ts`, `tests/**`.
* Unit tests: tenant scope (+ coverage), rbac matrix snapshot, `safeNext`, slug, dates (`todayInTz` for Asia/Kolkata
  at 01:00 local), calendar, bom, order status transitions, order-number rules, import row schema, csv writer
  (formula-injection), `toPlain` redaction, `audit` redaction. Integration: tenant isolation, stock concurrency,
  last-admin race, import 2,000 rows, revoked-session redirect (no loop), signup transaction.
* Accessibility: labelled inputs, error text via `aria-describedby`, keyboard-usable dialogs/menus, focus management.
* No `any` without a comment. No `console.log` in app code (use a tiny `logger`).

## 9. Deliverables

* Source in `~/Desktop/prodplan` (git, sensible commit history).
* `README.md`: local setup (Postgres script, env, migrate, seed, dev), scripts table, tests, demo logins.
* `docs/ARCHITECTURE.md` (tenancy incl. FK exceptions + RLS deferral, auth/session flow, data model diagram, how
  M2/M3 plug in: OrderOperation/ScheduleEntry, MaterialReservation, Notification), `docs/DEPLOYMENT.md` (Netlify +
  Netlify Database, migrations-on-deploy, env vars, demo-data loading, encryption-at-rest note, Docker/VPS
  alternative, known credit/login-wall limitation from STAGING_STATUS.md), `docs/HANDOVER_M1.md` (delivered vs PRD,
  decisions — incl. "capacity per shift" delivered as time-based capacity + optional rated output, known
  limitations, demo script).
* Staging deployed (alias URL at minimum) with `/api/health` green and demo data loadable in-app.
