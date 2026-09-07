# ProdPlan — Manufacturing Production Planning SaaS

Multi-tenant production planning for discrete manufacturers: customer orders, machine and work-center capacity,
shift calendars and downtime, materials and bills of materials, and a live operations dashboard.

**Included:** multi-tenant architecture with per-tenant isolation · email/password auth with four roles (Admin,
Planner, Supervisor, Viewer) · one-click demo profiles · orders (create, edit, CSV import) · customers · products with
BOM and routing · materials and stock ledger · work centers, machines, shift calendars, downtime windows · dashboard ·
public landing page · staging deployment.

## Quick start (local)

```bash
scripts/db-local.sh start          # project-owned PostgreSQL 15 on 127.0.0.1:5433 (creates prodplan + prodplan_test)
cp .env.example .env               # set AUTH_SECRET to a long random string (openssl rand -base64 48)
npm install                        # also runs prisma generate
npm run db:migrate                 # apply prisma/migrations to the dev database
npm run db:seed                    # two demo plants with realistic data (see logins below)
npm run dev                        # http://localhost:3000
```

Requirements: Node 22+, npm, PostgreSQL 15 (Homebrew `postgresql@15` binaries are used by `scripts/db-local.sh`;
any Postgres reachable via `DATABASE_URL` works too).

### Demo logins (seeded)

| Plant | Email | Role | Password |
|---|---|---|---|
| Acme Precision Works | admin@acme.test | Admin | Password123! |
| Acme Precision Works | planner@acme.test | Planner | Password123! |
| Acme Precision Works | supervisor@acme.test | Supervisor | Password123! |
| Acme Precision Works | viewer@acme.test | Viewer | Password123! |
| Beta Fabrication | admin@beta.test | Admin | Password123! |

Or sign up a new plant at `/signup` and press **Load demo data** on the dashboard.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` / `npm run build` / `npm start` | Next.js dev server / production build (`prisma generate && next build`) / serve |
| `npm run typecheck` | `tsc --noEmit` (generates the Prisma client first) |
| `npm run lint` | ESLint (includes the tenant-isolation and secrets rules) |
| `npm test` | Vitest unit + integration tests (integration tests use `TEST_DATABASE_URL`) |
| `npm run db:local` / `db:local:stop` | Start / stop the project-owned Postgres |
| `npm run db:migrate` | `prisma migrate dev` (creates + applies migrations locally) |
| `npm run db:migrate:deploy` | `prisma migrate deploy` (apply committed migrations; used by Docker) |
| `npm run db:seed` | Seed the demo plants (refuses to run against non-local databases unless `SEED_ALLOW=1`) |
| `npm run db:studio` | Prisma Studio |

## Project layout

```
prisma/            schema.prisma (frozen M1 data model), migrations/, seed.ts
src/app/           App Router: (marketing)/ landing · (auth)/ login+signup · (app)/ the product · api/health
src/lib/           db.ts (tenant-scoped Prisma client) · auth/ · rbac.ts · audit.ts · validation/ · domain libs
src/components/    ui/ (shadcn) · layout/ (AppShell, Sidebar, Topbar) · data/ (DataTable, badges…) · forms/
tests/             unit/ and integration/ (Vitest)
docs/              ARCHITECTURE.md · DEPLOYMENT.md · HANDOVER.md · STACK_NOTES.md · UI_KIT.md · M1_SPEC.md (build spec)
scripts/           db-local.sh · mint-session.ts (dev-only session cookie for curl testing)
```

## Documentation

* [docs/M1_SPEC.md](docs/M1_SPEC.md) — the internal build specification.
* [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — tenancy, auth, data model, and how M2/M3 plug in.
* [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — staging on Netlify, environment variables, Docker/VPS path.
* [docs/HANDOVER.md](docs/HANDOVER.md) — delivered scope, decisions, known limitations, demo script.

## Tests

`npm test` runs everything. Integration tests need the `prodplan_test` database with migrations applied:

```bash
DATABASE_URL=postgresql://$USER@127.0.0.1:5433/prodplan_test npm run db:migrate:deploy
```
