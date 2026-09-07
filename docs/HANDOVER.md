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
