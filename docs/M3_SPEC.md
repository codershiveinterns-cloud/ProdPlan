# ProdPlan — Milestone 3 Build Specification

Binding contract for the third and final delivery (PRD "Milestone 3"). Everything in `M1_SPEC.md` and `M2_SPEC.md`
stays in force (tenancy, RBAC, audit, UI conventions, colour semantics, list URL contract, production framing —
no "milestone/phase/roadmap" wording anywhere user-facing, no fake data/claims). Read both specs, `STACK_NOTES.md`,
`UI_KIT.md` and the current code before building.

## 0. Scope (PRD Milestone 3)

1. AI-assisted schedule optimization: conflict-minimized sequencing suggestions across open orders.
2. AI material shortage prediction against BOM requirements and stock levels for the live schedule.
3. Delivery-risk detection surfaced on the dashboard with contributing reason (capacity, material, or upstream delay).
4. Manager analytics dashboard: machine utilization, on-time delivery rate, material shortages, order throughput.
5. Email notification engine, schedule/production report export (CSV/PDF), audit logging (a browsable UI for it).
6. Security hardening, responsive UI pass (office + floor/tablet use), and production deployment.
7. Full deployment & go-live: domain connection, hosting, SSL, production database, final cutover.

**Honesty note on "AI".** Bullets 1–2 are delivered as deterministic, explainable heuristic optimization and
analytical prediction over the Milestone 2 engine and material data — not calls to an external LLM (no API key is
configured, and combinatorial scheduling is not a task LLMs do reliably or reproducibly). This is the same
category of "AI-assisted planning" used by real APS/MES products. The UI describes what it does ("suggested" /
"projected", with the reasoning shown), never claims it is a chatbot or generative model. If the client later wants
literal LLM-backed features (e.g. a natural-language assistant), that is new scope requiring an API key — noted in
`HANDOVER.md`, not silently faked here.

Quality bar: 10+ year senior engineer. Every rule below is deterministic and unit-tested; every mutation is
tenant-scoped, permission-checked, audited in the same transaction; every page follows the M1 kit and colour
semantics; nothing user-facing mentions milestones/phases.

## 1. Data model additions (migration `m3_analytics`)

```
enum RiskCause     { NONE, MATERIAL, CAPACITY, UPSTREAM_DELAY }
enum SuggestionKind { REASSIGN_MACHINE, REPRIORITIZE }
enum SuggestionStatus { PENDING, APPLIED, DISMISSED, STALE }
enum EmailStatus    { QUEUED, SENT, FAILED, SKIPPED }
enum ExportFormat   { CSV, PDF }
enum ExportKind     { ORDERS, SCHEDULE, PRODUCTION_STATUS, AUDIT_LOG }

Order (add)   riskCause RiskCause (NONE)

OptimizationSuggestion
  id, tenantId, runId? (plain FK -> ScheduleRun, SetNull), kind SuggestionKind, status SuggestionStatus (PENDING),
  orderId (composite FK -> Order, Cascade), entryId? (plain FK -> ScheduleEntry, SetNull),
  fromMachineId? (plain FK -> Machine, SetNull), toMachineId? (plain FK -> Machine, SetNull),
  fromPriority OrderPriority?, toPriority OrderPriority?,
  currentConflicts Int, projectedConflicts Int, currentLateMinutes Int, projectedLateMinutes Int,
  summary String, rationale String, appliedById? (plain FK -> User, SetNull), appliedAt?, dismissedById?, dismissedAt?,
  createdAt
  @@unique([tenantId, id]) @@index([tenantId, status, createdAt]) @@index([tenantId, orderId])

EmailMessage
  id, tenantId, userId? (plain FK -> User, SetNull), toEmail String, subject String, template String,
  status EmailStatus (QUEUED), providerId String?, error String?, notificationId? (plain FK -> Notification, SetNull),
  entityType?, entityId?, sentAt?, createdAt
  @@unique([tenantId, id]) @@index([tenantId, status, createdAt])

ExportJob
  id, tenantId, requestedById (plain FK -> User, NoAction), kind ExportKind, format ExportFormat, filters Json?,
  fileName String, rowCount Int?, status String ("READY"|"FAILED") (default "READY"), error String?, createdAt
  @@unique([tenantId, id]) @@index([tenantId, createdAt])
```

All new tables carry `tenantId`, are added to `TENANT_SCOPED_MODELS` (coverage unit test enforces this).
`OptimizationSuggestion` transitions PENDING→APPLIED|DISMISSED|STALE only (append-only otherwise).
`ExportJob` records metadata only (audit trail of what was exported, by whom) — the generated file itself is
streamed to the browser at request time, never stored (no file storage dependency for M3).

`Order.riskCause` is set alongside `deliveryRisk`/`riskReason` by `classifyRisk()` (below) — every write site that
sets `deliveryRisk` must set `riskCause` in the same statement (schedule run, `reassessOrderRisk`).

## 2. Delivery-risk cause (`src/lib/scheduling/risk.ts`, extend — do not fork)

`classifyRisk()` gains a `cause: RiskCause` in its return, computed deterministically, in this precedence order:
1. `MATERIAL` — `hasShortage` is true (a BOM line is short for this order's quantity). Material risk dominates
   regardless of timing, matching the PRD's "material" reason.
2. `UPSTREAM_DELAY` — the order has at least one fixed (locked or started) `ScheduleEntry` whose `actualStartAt`
   is later than that entry's own `plannedStartAt` by more than `UPSTREAM_DELAY_THRESHOLD_MINUTES = 60` — i.e.
   real execution of an earlier step is already running behind the plan it was given, so anything downstream is at
   risk because of upstream lateness, not a capacity shortfall in the plan itself. New input field
   `hasUpstreamDelay: boolean` passed in by the caller (engine.ts / operation-status.ts compute it from the
   entries they already have loaded — no new query).
3. `CAPACITY` — everything else that is not `ON_TRACK` (the plan could not fit the order in time given machine
   capacity/horizon, including unscheduled orders). This is the default non-material, non-upstream cause.
4. `NONE` — `ON_TRACK`.

Add `RISK_CAUSE_LABELS: Record<RiskCause,string>` ("Material shortage", "Machine capacity", "Upstream delay", "—")
and `riskCauseIcon`/colour mapping reused by the dashboard, order detail and analytics. Unit tests: every branch
above, and the precedence (a shortage always wins even if also upstream-delayed).

Wire-through: `engine.ts`'s `riskFor()` and `operation-status.ts`'s `reassessOrderRisk()` both call the extended
`classifyRisk()` and persist `riskCause` alongside `deliveryRisk`/`riskReason` (same `tx.order.update` call already
there — add one field, no new statement).

## 3. AI-assisted optimization (`src/lib/optimization/`)

Pure, deterministic, **read-only until applied**. No new external dependency, no network call. Runs in-memory
against the pure `scheduleOrders()` engine function (never mutates the DB itself) — safe to call from a page render.

```
src/lib/optimization/
  suggest.ts       generateSuggestions(input: EngineInput, baseline: EngineResult, opts): Suggestion[]
  apply.ts         applySuggestion(db, session, ctx, suggestionId): Promise<ScheduleRunResult>
  types.ts         Suggestion, SuggestionKind, ...
```

* `generateSuggestions`: takes the SAME `EngineInput` a normal run would use plus its `baseline` result (conflict
  count, total late-minutes = sum over LATE/DELAYED orders of `max(0, plannedEnd - dueEnd)` in minutes). For each
  of up to `MAX_CANDIDATES = 20` open orders that are not `ON_TRACK`, try two cheap, explainable perturbations and
  keep any that strictly reduce total late-minutes (ties broken by fewer conflicts) by at least
  `MIN_IMPROVEMENT_MINUTES = 15`:
  1. **REASSIGN_MACHINE** — for an order's first non-fixed-machine step whose routing allows any machine in its
     work center, try each other ACTIVE machine in that work center as a forced choice for that one step
     (temporarily pin it) and re-run `scheduleOrders` on the same input; keep the best improving machine.
  2. **REPRIORITIZE** — try bumping the order one priority tier up (`LOW→NORMAL→HIGH→URGENT`, capped at `URGENT`)
     and re-run; keep it if it improves without making any *other* currently-ON_TRACK order late (a suggestion
     that fixes one order by breaking another is rejected, not surfaced).
  Each kept candidate becomes a `Suggestion` with `summary` (e.g. "Reassign SO-000042 op 20 to CNC-03") and
  `rationale` (plain-English: what changes and why it helps, naming the conflict/lateness it resolves).
* Cap total suggestions returned at `MAX_SUGGESTIONS = 8`, sorted by projected late-minutes saved (desc).
* Performance budget: the whole `generateSuggestions` call must complete in **under 3 seconds** for the demo-scale
  dataset (≤ 40 candidates × 2 perturbations × a full `scheduleOrders` re-run each ≈ ≤ 80 engine calls; the engine
  itself already runs in ~0.2 s for 200 orders per M2's perf test, so this is comfortably inside budget) — a unit
  perf test asserts this on a synthetic 30-order/6-machine input.
* `applySuggestion(db, session, ctx, id)`: loads the `PENDING` suggestion, re-verifies it is still valid (re-run
  `generateSuggestions` fresh and confirm this suggestion — or an equivalent one for the same order/kind — still
  improves things; if the live schedule has changed enough that it no longer helps, mark it `STALE` and throw a
  `DomainError` instead of applying), then: for `REASSIGN_MACHINE`, calls `moveEntry` semantics (pin the step's
  operation to that machine is not persisted on the routing — instead directly place+lock that one entry via the
  same primitives `move.ts` uses, then `runSchedule`); for `REPRIORITIZE`, updates `Order.priority` in a
  transaction (audited as a normal order edit) then calls `runSchedule(trigger:"optimization")`. Marks the
  suggestion `APPLIED` with `appliedById`/`appliedAt`, audits it, and notifies (`optimizationApplied` event, new
  builder in `src/lib/notifications/events.ts`, ADMIN+PLANNER, dedupe per suggestion id).
* `dismissSuggestion(db, session, ctx, id)`: sets `DISMISSED` + audit, no re-run.
* Suggestions are generated **on page load** of `/schedule/optimize` (not persisted proactively) and persisted only
  when the user takes an action worth remembering: every generation batch writes rows with `status PENDING` inside
  one transaction (so the page can show "generated 41 min ago" and the list survives navigation), but a fresh page
  load regenerates and the previous batch's still-`PENDING` rows are marked `STALE` first (superseded — never
  silently accumulate). Rate-limit generation server-side to once per 20 seconds per tenant (reuse
  `src/lib/rate-limit.ts`) so repeated refreshes don't hammer the DB.

## 4. Material shortage prediction (`src/lib/analytics/shortage.ts`)

Extends the M2 engine's point-in-time shortage check (which only looks at *scheduled* orders' BOM draw against
current stock) into a **forward-looking** prediction: for every active material, walk all **open, non-cancelled**
orders' BOM requirements (not just scheduled ones) against current stock, net of what open orders ahead of it in
due-date order would already consume, and project a **predicted stockout date** using
`reorderLeadTimeDays`/historical consumption.

```
export type ShortagePrediction = {
  materialId; code; name; unit;
  stockOnHand: number; reorderThreshold: number;
  committedDemand: number;        // sum of BOM requirement across all open orders, earliest-due-first
  projectedBalance: number;       // stockOnHand - committedDemand (can go negative)
  firstShortfallOrderId: string | null;   // earliest-due order at which the running balance first goes negative
  firstShortfallDate: string | null;      // that order's due date
  daysOfCoverAtCurrentRate: number | null; // stockOnHand / (committedDemand / lookback window), null if no recent consumption
  severity: "OK" | "WATCH" | "SHORT";     // SHORT = already short today; WATCH = short within reorderLeadTimeDays of the first shortfall; OK otherwise
};
export function predictShortages(db: TenantDb, opts?: { asOf?: Date }): Promise<ShortagePrediction[]>;
```

`committedDemand`/running balance is computed by walking open orders sorted by due date ascending (earliest need
first — matches how the plant would actually draw material) and subtracting each order's `requirementFor()` (reuse
`src/lib/bom.ts`, do not recompute the formula). `daysOfCoverAtCurrentRate` uses average daily consumption from
`StockMovement` ISSUE rows over the trailing 30 days (0 movements → `null`, rendered as "—", never divide by zero).
Unit tests: empty order book, a single order exactly consuming stock to zero (boundary), multiple orders where the
3rd due order is the first to go short, no-consumption-history materials.

This feeds: the dashboard's "Materials below reorder" tile stays as-is (point-in-time, M1 behaviour unchanged) and
a **new** "Materials at risk" section showing predicted shortages with the projected date, and the analytics page
(§5). It does **not** create `ScheduleConflict` rows (those stay engine-run-triggered per M2) — it is a read-only
forecast, refreshed on every page load, not stored.

## 5. Manager analytics dashboard (`/analytics`)

New page, `requirePermission("analytics:read")` (ADMIN + PLANNER only — a manager/owner view, not the floor).
Server-rendered, one round trip with a handful of aggregate queries (no N+1) plus `predictShortages()`.
Filter: a date-range selector (`?from=&to=`, default trailing 30 days, presets 7/30/90 days) applied to the
delivery/throughput metrics; utilisation and shortage sections are always "now" (a snapshot, not historical, since
no utilisation-history table exists — documented as a known limitation, not silently faked with a made-up trend).

Sections:
1. **KPI row** (StatCard, matching dashboard style): On-time delivery rate (COMPLETED orders in range with
   `completedAt <= ` the due-date end, ÷ all COMPLETED orders in range, as a %), Order throughput (COMPLETED count
   in range), Open orders at risk (AT_RISK+DELAYED+LATE count, live), Avg. machine utilisation (mean of per-machine
   utilisation over the NEXT 7 days from `loadBoardWindow`-style calc, reusing `availabilityRange`/engine capacity
   math — do not hand-roll a second utilisation formula).
2. **Machine utilisation** table/bar chart: per machine, utilisation % over the next 7 days (reuse the exact
   calculation `loadBoardWindow` uses), sorted highest first, linking to `/schedule?workCenterId=`.
3. **On-time delivery trend**: a simple weekly bucket bar chart (CSS bars, no charting library — matches the
   landing page's no-external-viz-dependency precedent) of on-time % per ISO week within the range.
4. **Materials at risk**: table from `predictShortages()` filtered to `WATCH`/`SHORT`, columns material, on hand,
   committed demand, projected balance, first shortfall order + date, severity badge; links to `/materials/:id`.
5. **Order throughput by priority**: counts of COMPLETED orders in range grouped by priority (URGENT/HIGH/NORMAL/LOW).

Export: a "Export report" button (`exports:create` permission) offering CSV and PDF of the current view (§7).

## 6. Dashboard: risk cause + optimization entry point

* The existing "Delivery risk" tile's linked list (`/orders?risk=...`) and the orders-list `DeliveryRiskBadge` gain
  a small cause indicator next to the risk badge (icon + `RISK_CAUSE_LABELS`), e.g. "Delayed · Material". Order
  detail's Schedule card shows the cause inline with the existing risk reason line.
* Dashboard gains an "Optimization suggestions" tile (count of `PENDING` suggestions, links to
  `/schedule/optimize`) next to the existing "Schedule conflicts" tile — same StatCard style, tone amber when > 0.
* `/schedule/optimize` page (new, under the Schedule area, linked from the board's toolbar as a secondary button
  "Suggestions"): lists current suggestions as cards (summary, rationale, projected improvement — "Saves ~2 h
  lateness, 1 fewer conflict"), each with **Apply** (`schedule:run` permission — applying changes the schedule,
  same permission as running it) and **Dismiss** buttons, empty state "No improving changes found right now."
  "Regenerate" button re-runs `generateSuggestions` (rate-limited per §3).

## 7. Email notification engine (`src/lib/email/`)

```
src/lib/email/
  provider.ts    EmailProvider interface: send(input: {to, subject, html, text}): Promise<{providerId:string}>
  resend.ts       Resend-backed implementation (used when RESEND_API_KEY is set)
  log-provider.ts No-op implementation: writes the EmailMessage row as SENT with providerId "log:<id>" and
                   `logger.info`s the rendered email — used automatically when RESEND_API_KEY is unset (dev/no-key
                   staging), so the feature is fully exercised and testable without a real key. NEVER silently
                   pretend to send in production: if `APP_URL` looks like a production host (no localhost/vercel
                   preview) and no key is set, the banner in Settings (below) says so plainly.
  templates.ts    Plain, on-brand HTML+text templates (reuse the app's teal/amber tokens inline — email clients
                   need inlined styles, not the app's CSS) for: schedule-run-finished digest, critical-conflict
                   alert, delivery-risk-escalated, order-status-changed (ON_HOLD/CANCELLED), user-invited
                   (temporary password — see security note below), password-reset-by-admin.
  send.ts         sendEmail(tx, {tenantId, userId?, to, subject, template, data, entityType?, entityId?,
                   notificationId?}): Promise<EmailMessage> — resolves the provider (Resend if configured, else
                   log-provider), renders the template, calls provider.send, writes ONE EmailMessage row with the
                   result (SENT/FAILED with `error`), never throws (a failed send must not fail the transaction
                   that triggered it — catch and record FAILED).
```

* **Never email a real password.** The `user-invited`/`password-reset-by-admin` templates do **not** include the
  temporary password (which the M1 spec already shows once, in-app, via the InviteUserDialog). They only say
  "An account was created for you at ProdPlan — ask your admin for your temporary sign-in details" with a link to
  `/login`. This is a deliberate divergence from a naive "email the password" implementation, documented here.
* Per-user opt-in is **not** built as a settings toggle in M3 (out of scope — see Known Limitations); every ADMIN
  and PLANNER receives the four alert emails by default, matching who already gets the in-app notification for
  the same event (reuse the exact recipient-resolution already in `src/lib/notifications/events.ts` — do not
  duplicate the role logic). Wire `sendEmail` calls alongside the **existing** `notify()` calls for: schedule run
  finished (digest, once per run, not per conflict), a NEW critical conflict, delivery risk escalating to
  `DELAYED`/`LATE`, and order status → `ON_HOLD`/`CANCELLED` — i.e. extend the notification call sites already
  wired in M2 (`run.ts`, `operation-status.ts`, `orders/service.ts`) with one `await sendEmail(...)` next to the
  existing `await notify(...)`, inside the same transaction. Do not fan out an email per conflict row — one digest
  email per schedule run listing the top conflicts (reuse `result.stats`/`conflicts` already computed there).
* `RESEND_API_KEY` (optional): document in `.env.example` and `docs/DEPLOYMENT.md`. Settings → Tenant page gets a
  read-only status line "Email delivery: connected via Resend" / "Email delivery: not configured — emails are
  logged, not sent (ask your developer to add RESEND_API_KEY)" so an admin can see the real state, never a fake
  "sent" claim.
* Tests: log-provider unit tests (every template renders valid HTML with no unescaped user input — XSS-check by
  asserting a `<script>`-laced order note is escaped), `sendEmail` writes exactly one `EmailMessage` row per call
  and never throws, integration test that a schedule run with a new CRITICAL conflict produces both a
  `Notification` and an `EmailMessage` row for the same recipient.

## 8. Export: CSV/PDF (`src/lib/export/`)

```
src/lib/export/
  csv.ts    ordersCsv(rows), scheduleCsv(rows), productionStatusCsv(rows), auditLogCsv(rows) — build on the
            existing src/lib/csv.ts writer (formula-injection guard already there; reuse, do not reimplement).
  pdf.ts    A small, dependency-light PDF writer for tabular reports. Use `@react-pdf/renderer` (pure JS, Node/
            edge-safe, no native deps, MIT-licensed, well-suited to Vercel serverless) — install it
            (`npm install @react-pdf/renderer`) and confirm the build still passes on Vercel (Node runtime route).
            One shared `ReportDocument` component (header with tenant name + generated-at + report title, a table,
            a footer with page numbers) reused by all four report kinds.
```

Route handlers (not Server Actions — a GET with query params that streams a file download, matching how
`api/orders/template` already works): `src/app/api/exports/[kind]/route.ts` — `requirePermission("exports:create")`,
validates `kind`/`format`/filters via zod, queries the tenant-scoped data (reuse each module's existing list
query — `orders/list.ts`, `queries.ts` for schedule, `floorOperations`-style for production status, a new
`auditLogList` for the audit kind), writes one `ExportJob` audit row, returns the file with
`Content-Disposition: attachment; filename="..."` and the correct `Content-Type` (`text/csv` / `application/pdf`).
Row cap `EXPORT_MAX_ROWS = 5000` (reject with a clear error above that — "Narrow your filters; exports are capped
at 5,000 rows" — never silently truncate without saying so, matching the M1 CSV-import precedent).

UI: an "Export" button (CSV/PDF choice via a small dropdown) added to: Orders list, `/schedule` (current window),
`/floor` (today's production status), the new Audit Log page (§9), and the analytics page (§5) — every export
button is a plain `<a href="/api/exports/...">` (or a form GET), not a client-side blob hack, so it works without
JS and downloads correctly from a background tab.

## 9. Audit log UI (`/settings/audit`)

New tab under Settings, `requirePermission("audit:read-all")` (ADMIN only, matching the existing permission's
scope). Paginated table (25/page, list URL contract: `q`, `page`, plus `entityType`, `action`, `actorId`, `from`,
`to` filters) over `AuditLog`, columns: when (relative + absolute on hover), actor, action badge, entity (label +
link built from `describeAudit()`'s existing href logic — reuse, do not duplicate), summary, changed fields.
Row expand (a `Disclosure`/details) shows the raw before/after JSON (already redacted at write time per M1's
audit contract — safe to display as-is). Export button per §8.

## 10. Security hardening

A review-and-fix pass, not new features. Checklist (each item: verify, and fix if not already true):
1. **Security headers**: `next.config.ts` `headers()` sets `Strict-Transport-Security` (prod only, via `APP_URL`
   scheme check), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy:
   strict-origin-when-cross-origin`, a `Content-Security-Policy` scoped to the app's own origin + the Google Fonts
   host already used, `Permissions-Policy` disabling camera/microphone/geolocation (unused by the app).
2. **Rate limiting coverage**: confirm every unauthenticated POST (login, signup, demo login — already covered per
   M1/demo work) and the new `/schedule/optimize` regeneration (§3) and `/api/exports/*` (per-tenant, reuse
   `src/lib/rate-limit.ts`, e.g. 20/min) are covered; add any gap found.
3. **Cookie/session review**: confirm `AUTH_SECRET` length is enforced at boot (already true per M1), session
   cookie flags (`__Host-`, `Secure`, `HttpOnly`, `SameSite=Lax`) still correct after all M2/M3 routes.
4. **Dependency audit**: `npm audit --omit=dev` (production deps only) — document any HIGH/CRITICAL finding in
   `HANDOVER.md` with the remediation status; do not silently ignore.
5. **Input validation sweep**: grep for any Server Action/route handler that reads `formData`/`searchParams`
   without a zod schema (per M1's pattern) — fix any gap found by the review agent (§13).
6. **Tenant-scope sweep**: run the existing `tests/unit/tenant-scope-coverage.test.ts`-style check against every
   NEW model added in this milestone (`OptimizationSuggestion`, `EmailMessage`, `ExportJob`) — must already be
   required by that test once added to `TENANT_SCOPED_MODELS`; confirm it fails loudly if forgotten.
7. **Secrets**: confirm no secret (API keys, DB URLs) is ever included in a client bundle — grep for
   `RESEND_API_KEY`/`DATABASE_URL`/`AUTH_SECRET` outside server-only files.
Write findings + fixes to `docs/HANDOVER.md` "Security" section (what was checked, what was fixed, what remains a
documented limitation).

## 11. Responsive UI pass

Sweep every page (M1 + M2 + the new M3 pages) at 375px (floor tablet portrait), 768px (tablet landscape) and
1440px (office desktop) using the Browser tools — screenshot each, fix real issues found (overflow, illegible
text, touch targets < 44px, tables that don't degrade via column `priority`). Focus areas most likely to have
drifted: the new `/analytics` charts/tables, `/schedule/optimize` suggestion cards, the audit log table, export
dropdown menus, and email-status banner on Settings. Record before/after notes in the review report (§13); no
separate "responsive" deliverable page — it's a quality bar applied everywhere.

## 12. Production deployment & go-live

Reuses the existing Vercel + Neon setup (already "a production hosting environment" per `docs/VERCEL.md`) rather
than standing up a second stack — this satisfies "hosting setup", "SSL" (automatic on Vercel), "production
database" (Neon, already provisioned) and "environment variables separate from staging" (Vercel's Production vs
Preview env scopes, already used) without re-litigating the M1/M2 hosting decision.

Steps or Known Limitations (either done here or explicitly flagged, never silently skipped):
1. Apply the `m3_analytics` migration to the production Neon database (`npm run db:migrate:deploy` with the
   production `DATABASE_URL`).
2. Set new production env vars: `RESEND_API_KEY` (if the user supplies one — otherwise documented as a Known
   Limitation, log-provider stays active, no fake "sent" state).
3. Deploy the M3 build (`npx vercel deploy --prod --yes --archive=tgz`), smoke-test every new route with a minted
   session cookie exactly as M1/M2 did, verify `/api/health`.
4. **Domain connection**: the PRD's "pointing the client's domain/subdomain … A/CNAME records" needs a domain name
   from the client, which is not available in this repo/session. This step is a **documented Known Limitation**
   in `HANDOVER.md` with the exact remaining steps (Vercel → Project → Settings → Domains → add domain → the two
   DNS records Vercel will display → update `APP_URL` → redeploy) so it is a five-minute task once the client
   provides a domain — not blocking everything else in this milestone.
5. Final smoke test across all core workflows (sign in, demo profiles, every module list+detail, schedule run,
   floor start/complete, notifications, new: optimization suggestions, analytics, exports, audit log) against the
   live production URL, recorded in `HANDOVER.md`.

## 13. Ownership (parallel build) & tests

Schema migration (§1) is applied by the orchestrating engineer first (single, careful step — not parallelized).
Then, strictly separate paths:

* **Engineer A — risk cause + optimization + shortage prediction**: `src/lib/scheduling/risk.ts` (extend),
  `src/lib/optimization/**`, `src/lib/analytics/shortage.ts`, `src/app/(app)/schedule/optimize/**`,
  `src/lib/notifications/events.ts` (add `optimizationApplied` only). Tests per §3–§4.
* **Engineer B — analytics dashboard + dashboard/order-detail risk-cause UI**: `src/app/(app)/analytics/**`,
  `src/lib/analytics/dashboard.ts` (KPI/utilisation/trend queries, separate file from A's `shortage.ts`),
  the small additions to `src/app/(app)/dashboard/**` and `src/components/data/DeliveryRiskBadge.tsx`/order-detail
  Schedule card for the cause indicator (§6), `src/components/layout/nav.ts` (+ Analytics entry),
  `src/lib/rbac.ts` (+ `analytics:read`, `exports:create` permissions — coordinate the exact permission list with
  Engineer C/D by reading this spec, not by guessing). Tests per §5.
* **Engineer C — email engine + audit log UI**: `src/lib/email/**`, the notification-call-site additions listed
  in §7 (small diffs to `run.ts`/`operation-status.ts`/`orders/service.ts`), `src/app/(app)/settings/audit/**`,
  `src/app/(app)/settings/tenant/**` (email-status line only), `src/lib/audit-log-list.ts` (new query helper).
  Tests per §7 and §9.
* **Engineer D — export + security headers + responsive pass**: `src/lib/export/**`, `src/app/api/exports/**`,
  the export-button additions to Orders/Schedule/Floor/Audit/Analytics pages (small diffs, coordinate exact
  mount points by reading the other engineers' finished pages once available — D runs after A/B/C in this build),
  `next.config.ts` (headers), the responsive sweep (§11) across the whole app, `npm audit` + `HANDOVER.md`
  Security section (§10).

Full regression (`npx tsc --noEmit`, `npx eslint .`, `npm test`, `npm run build`) must stay green after every
stage. No milestone/roadmap/prototype wording anywhere in new UI. No new raw-`prisma` imports outside the allowed
files. No `any` without a one-line justification. No `console.log` (use `src/lib/logger.ts`).
