# ProdPlan — Handover

## What is delivered

ProdPlan is a multi-tenant production planning platform for discrete manufacturers. Each manufacturing unit gets its
own isolated workspace with:

| Area | Capabilities |
|---|---|
| Access | Sign-up creates a plant with an Admin; email/password sign-in; four roles (Admin, Planner, Supervisor, Viewer) enforced on every action; one-click demo profiles for evaluation; session hardening and sign-in rate limiting |
| Orders | Create and edit customer orders (product, quantity, priority, delivery deadline, PO reference); automatic order numbering; status workflow (queued, in progress, on hold, completed, cancelled) with role gates and reasons; CSV import with preview, validation and one-click commit; material requirement and routing preview per order |
| Customers | Customer master with order history |
| Products | Product master, bill of materials with scrap factors and "buildable from stock", routing operations per work center |
| Materials | Material master, reorder thresholds and lead times, stock ledger with receipts, issues, returns and adjustments that can never drive stock negative, where-used |
| Machines | Work centers, machines with efficiency and rated output, shift calendars (multiple shifts, weekdays, breaks, holidays), downtime and maintenance windows, seven-day capacity view per machine |
| Dashboard | Open / overdue / due-this-week / in-progress orders, machine and material health, orders by due date, machine overview, recent activity, guided setup for new plants and one-click demo data |
| Settings | Plant name and timezone, default calendar, user management (invite, roles, password reset, deactivate), profile and password |
| Audit | Every create, update, status change, import and sign-in is logged with actor, summary and changed fields |

Public website: landing page with product overview and demo entry, sign-in and sign-up pages.

## Environments

* **Local**: see `README.md` (Postgres script, `.env`, `npm run db:migrate`, `npm run db:seed`, `npm run dev`).
* **Staging (Netlify)**: see `DEPLOYMENT.md`. Note the account-level publishing limitation described there.
* **Production**: Docker Compose stack in the repository (`Dockerfile`, `docker-compose.yml`) for any VPS, with
  TLS termination, encrypted disk and backups as described in `DEPLOYMENT.md`.

## Demo access

* Sign-in page → "Instant demo profiles" (Admin, Planner, Supervisor, Viewer). The demo plant is shared, seeded with
  realistic data and refreshed automatically once a day. Demo users cannot manage users or plant settings.
* Seeded local accounts (local database only): `admin@acme.test`, `planner@acme.test`, `supervisor@acme.test`,
  `viewer@acme.test`, `admin@beta.test` — password `Password123!`. Rotate or remove before exposing a database publicly.

## Design decisions worth knowing

* **Isolation**: every record carries the plant id; all queries go through a scoped data client that cannot read
  other plants, and the database schema enforces the same rule with composite foreign keys.
* **Capacity**: machine capacity is time-based — net shift minutes × efficiency, minus downtime — because that is
  what routing-driven scheduling consumes. The optional "rated output per shift" is informational.
* **Stock**: on-hand quantities change only through ledger movements applied atomically; adjustments record the
  counted value.
* **Dates**: "today", overdue and due-soon are computed in the plant's timezone.
* **Sessions**: signed cookies with token versions, so role changes, password resets and deactivation take effect
  immediately; temporary passwords must be changed at first sign-in.

## Known limitations

* Email delivery (password reset links, notifications) is not part of this release; admins reset passwords from
  Settings.
* Scheduling of orders onto machines, the planning board, analytics and exports are not part of this release.
* Sign-in rate limiting and the demo plant reset use the database; no external queue or scheduler is required.

## Demo script (10 minutes)

1. Open the site → "Explore the live demo" → dashboard as Admin: KPI tiles, overdue orders, machines down.
2. Orders → open an overdue order → material requirement shows a shortage → change status with a reason.
3. Orders → Import CSV → download the template → upload → preview with errors → import valid rows.
4. Products → a product → BOM shows "Buildable from stock" and the limiting material; routing steps.
5. Materials → the short material → record a receipt → ledger and buildable quantity update.
6. Machines → a machine → seven-day capacity with a maintenance window; Shift calendars → edit a shift.
7. Settings → Users → invite a Planner; sign in as Viewer (demo profile) to show read-only access.

## Security

Review-and-fix pass for Milestone 3 (docs/M3_SPEC.md §10). Each item below: what was checked, what was fixed (if
anything), and what remains a documented limitation.

### 1. Security headers

`next.config.ts` now sets, on every route (`headers()`):

* `X-Content-Type-Options: nosniff`
* `X-Frame-Options: DENY`
* `Referrer-Policy: strict-origin-when-cross-origin`
* `Permissions-Policy: camera=(), microphone=(), geolocation=()` — nothing in the app uses any of the three
* `Content-Security-Policy`: `default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';
  object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'
  https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data:;
  connect-src 'self'`
* `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` — **only** sent when `APP_URL` starts
  with `https://` (never on a local/http box), matching the existing `isHttpsApp()` convention in
  `src/lib/auth/jwt.ts`.

**Documented limitation**: `script-src`/`style-src` keep `'unsafe-inline'`. The app renders plain React
`style={{...}}` props throughout (compiles to inline `style="..."` HTML attributes, which CSP's `style-src`
governs) and Next.js injects its own hydration bootstrap as an inline `<script>`. Removing `'unsafe-inline'`
cleanly needs a nonce (or hash) threaded through every request and every inline style/script in the app — a
larger, cross-cutting change out of scope for a review-and-fix pass. `fonts.googleapis.com`/`fonts.gstatic.com`
are allowed defensively; in practice `next/font/google` (`src/app/layout.tsx`) self-hosts Inter/Manrope at build
time, so production never makes a runtime request to Google.

### 2. Rate-limiting coverage

Swept every unauthenticated POST and every spec-flagged authenticated endpoint (`src/lib/rate-limit.ts`'s fixed
window `hit()`):

| Endpoint | Status |
|---|---|
| Login (`src/lib/auth/login.ts`) | Already rate-limited: `loginIpKey` (20/15 min) + `loginEmailKey` (10/15 min) |
| Signup (`src/app/(auth)/actions.ts`) | Already rate-limited: `signupIpKey` (5/hour) |
| `/schedule/optimize` regeneration (`src/lib/optimization/generate.ts`) | Already rate-limited: 1 regeneration / 20 s / tenant |
| `/api/exports/[kind]` (this milestone, `src/app/api/exports/[kind]/route.ts`) | **Added**: 20 exports / minute / tenant (`hit(`exports:${tenantId}`, 20, 60)`), 429 with `Retry-After` when limited |

**Gap found, not fixed** (outside this engineer's owned paths — reported per docs/M3_SPEC.md §13, not silently
patched): `src/app/api/demo/reset/route.ts` (POST) has no `hit()` call. Risk is mitigated by a timing-safe bearer
token (`DEMO_RESET_TOKEN`) and the route 404s entirely when that env var is unset, but a brute-force/DoS attempt
against a configured token is not throttled. Recommend a per-IP `hit()` call there in a follow-up change.

Every other mutating Server Action (orders, customers, products, materials, floor operations, settings, the new
export route) sits behind `requirePermission()` / `withAction()`, i.e. requires an authenticated session with the
right role — rate limiting on top of that is a defense-in-depth choice per endpoint, not a blanket requirement;
none of the reviewed ones showed unbounded-cost behaviour that would warrant one beyond the two already covered.

### 3. Cookie / session review

Confirmed unchanged since M1: `AUTH_SECRET` length enforced at boot, session cookie is `__Host-pp_session` (when
`APP_URL` is https) or `pp_session` (http/local) with `httpOnly: true`, `sameSite: "lax"`, `secure` matching the
scheme, `path: "/"` (`src/lib/auth/jwt.ts`). No M2/M3 route introduces a second cookie or weakens these flags.

### 4. Dependency audit (`npm audit --omit=dev`)

4 HIGH advisories, both transitive, neither reachable from the app's own served code:

* **`deepmerge-ts` < 8.0.0** (stack exhaustion on recursive merge, GHSA-ggr8-5vv4-36mx) — pulled in only via
  `prisma` (the CLI, a **devDependency**) → `@prisma/config`. Not present in the deployed Next.js runtime.
* **`mysql2` ≤ 3.23.0** (auth-plugin downgrade credential leak GHSA-3f6p-5ww8-9rcr; decompression-bomb DoS
  GHSA-rgwj-5xj2-c3m3) — pulled in via `prisma` (dev) **and** via `@netlify/database` → `waddler` (a **production**
  dependency). `grep -rl "@netlify/database" src` finds zero imports — the package is unused dead weight left
  over from the Netlify hosting path (superseded by the Vercel + Neon Postgres setup); the app never constructs a
  MySQL connection, so `mysql2`'s vulnerable code path is never executed. Recommended remediation: remove
  `@netlify/database` from `package.json` in a follow-up change (flagged separately, not done here — outside this
  engineer's owned `package.json` scope, which is limited to the PDF library decision below).
* `npm audit fix --force` would downgrade `prisma` to `6.19.3` (a breaking change) — not applied; the safer fix is
  removing the unused `@netlify/database` dependency and waiting for an upstream `@prisma/config` patch for the
  dev-only `deepmerge-ts` chain.

### 5. Input validation sweep

Every Server Action reviewed already validates `formData` through a zod schema (`parseForm()` from
`src/lib/action.ts`) or a hand-rolled allow-list parser matching the list-URL-contract convention (`orders/list.ts`,
`audit-log-list.ts`, etc.) — no gap found. The new export route validates `kind` against `ExportKind` and `format`
against `ExportFormat` (`isExportKind`/`isExportFormat`, `src/lib/export/types.ts`) before touching the database,
and reuses each source module's own filter parser (`parseOrderListParams`, `parseAuditLogListParams`,
`boardWindowSchema`) for the rest of the query string — never re-derives filter/validation logic.

### 6. Tenant-scope sweep

`OptimizationSuggestion`, `EmailMessage` and `ExportJob` are already present in
`TENANT_SCOPED_MODELS` (`src/lib/db.ts`) and `ExportJob.filters` is registered in `JSON_FIELDS` so the tenant-scope
write-walker does not descend into it. `tests/unit/tenant-scope-coverage.test.ts` passes with all three included
(part of the 909/909 full-suite run below) — confirmed it fails loudly when a model is missing, per its own design.
The new export route creates `ExportJob` rows exclusively through the tenant-scoped `db` client (never raw
`prisma`), with `tenantId` passed explicitly (the scoped client overwrites it regardless, matching the existing
convention in `src/lib/orders/service.ts`, `src/lib/stock.ts`, etc.).

### 7. Secrets in the client bundle

`grep -rn "SECRET\|API_KEY\|PRIVATE_KEY" src/app --include="*.tsx" --include="*.ts" | grep -v "process.env"` — one
hit, `src/app/(app)/settings/tenant/page.tsx`, a Server Component rendering the literal help text "ask your
developer to add RESEND_API_KEY" (naming the env var, not its value) when email is unconfigured; not a leak.
`grep -rn "DATABASE_URL\|AUTH_SECRET\|RESEND_API_KEY"` outside `src/lib/**`/`src/app/api/**`/`proxy.ts` only
matches generated Prisma client internals (server-only, never bundled to the browser) and the same tenant settings
page. No secret value is reachable from client-bundled code.

### PDF export dependency decision

`@react-pdf/renderer` (^4.9.0) was installed — `node_modules/@react-pdf` did not exist before this change. Pure
JS, no native/binary deps, runs in the Node runtime (no `edge` runtime declared on the export route), and is the
same choice `docs/M3_SPEC.md` §8 calls out. Considered the "no new dependency" alternative Engineer C used for
email (hand-rolled string templates), but a genuinely tabular, paginated, multi-page PDF with a repeating header/
footer is a real layout problem (row wrapping across page breaks, column alignment) that a raw byte-level PDF
writer would reproduce badly; a maintained renderer is the appropriate trade here. Cell values are passed to
`<Text>` as plain string children (see `src/lib/export/pdf.tsx` file header comment) — react-pdf does not parse
text content as markup, so no separate HTML-escaping step is needed for the PDF path (unlike CSV, which reuses
`src/lib/csv.ts`'s existing formula-injection guard).
