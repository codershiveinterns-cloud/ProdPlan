# ProdPlan — Deployment

> Ground truth about the staging account is in `STAGING_STATUS.md`; verified CLI/API details in `STACK_NOTES.md`.

## 1. Environments

| Environment | Where | Database | URL |
|---|---|---|---|
| Local dev | `next dev` on your machine | Project-owned PostgreSQL 15 (`scripts/db-local.sh`, port 5433) | http://localhost:3000 |
| **Live** | Vercel project `prodplan` (see `VERCEL.md`) | Neon Postgres | **https://prodplan-app.vercel.app** |
| Staging (legacy) | Netlify site `prodplan-staging` | Netlify Database | https://staging--prodplan-staging.netlify.app (behind Netlify login; superseded by Vercel) |
| Production (M3) | Client VPS / Hostinger via Docker Compose (see §5) or Netlify | PostgreSQL 15 on an encrypted volume, backups | client domain + SSL |

## 2. Environment variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | local / VPS | Postgres connection string. On Netlify leave it unset; the app falls back to `NETLIFY_DB_URL`. |
| `NETLIFY_DB_URL` | injected by Netlify | Set automatically for functions/builds when Netlify Database is enabled. |
| `AUTH_SECRET` | everywhere | ≥ 32 random chars (`openssl rand -base64 48`). Rotating it signs everyone out. |
| `APP_URL` | everywhere | Public origin; used for cookie security flags, JWT audience and Server Action origin checks. |
| `TEST_DATABASE_URL` | dev only | Separate DB for integration tests (`prodplan_test`). |
| `SEED_ALLOW` | never in prod | `1` lets `prisma db seed` run against a non-local DB. |
| `DEMO_RESET_TOKEN` | optional | Enables `POST /api/demo/reset` (header `x-demo-reset-token`) to refresh the shared demo plant on demand; it also refreshes itself daily. |

Staging values already set in the Netlify **production** context: `AUTH_SECRET`, `APP_URL`, `NODE_VERSION=22`,
`NPM_FLAGS=--include=dev` (from `netlify.toml`).

## 3. Staging on Netlify

### 3.1 How it is wired
* `netlify.toml`: build command `npm run build` (= `prisma generate && next build`), publish `.next`, plugin
  `@netlify/plugin-nextjs` (do not pin it in package.json), and `[db.migrations] path = "prisma/migrations"` so
  Netlify applies Prisma's SQL migration folders (`<timestamp>_<name>/migration.sql`) **at deploy time**, right before
  the deploy becomes available. Netlify tracks what it applied in its own `netlify.migrations` table.
* Netlify Database was provisioned automatically for the site because `@netlify/database` is a dependency and a
  deploy ran. Only a **read-only** connection string is exposed outside Netlify (via
  `netlify database status --branch <branch> --show-credentials`); the app's functions receive a writable
  `NETLIFY_DB_URL`. Consequences:
  * Never run `prisma migrate deploy` against staging — migrations are applied by Netlify from the repo.
  * Demo data is loaded **inside the app**: sign up a plant, open the dashboard and press **Load demo data**
    (Admin only, empty plant only). `prisma db seed` is for local databases.
* Deploy previews and branch/alias deploys get their **own database branch** (a copy of production data when first
  created). Production deploys are the only ones that touch the production database branch.
* Free credit plan: the database sleeps after ~5 minutes idle (first request after that is slow) and has a
  48-compute-unit-per-period cap. Open the site a minute before a client review.

### 3.2 Deploying
```bash
# from the repo root (already linked to the site; `netlify status` shows prodplan-staging)
npm run typecheck && npm test && npm run build     # local gate
netlify deploy --alias staging -m "M1 <what changed>"   # stable URL: https://staging--prodplan-staging.netlify.app
netlify deploy --prod -m "M1 <what changed>"            # main URL — requires account credits (see 3.3)
curl -s https://staging--prodplan-staging.netlify.app/api/health
netlify database status --branch staging   # lists migrations Netlify applied to the alias branch DB
```
`netlify deploy` builds locally with the Netlify Next.js runtime and uploads the result (≈ 1–2 min).

### 3.3 Known limitation (account-level, not code)
On 2026-09-05 the Netlify API rejected production publishes with
`Account credit usage exceeded - new deploys are blocked until credits are added` (the team's free monthly credits
are used up; the next usage period starts 2026-09-19). Alias/preview deploys still work but are served behind
Netlify's team login (visitors are redirected to app.netlify.com/edge-access), so **the client cannot open the
staging URL until either credits are added / the plan is upgraded (then run `netlify deploy --prod`), or the credit
period resets on 2026-09-19**. The site owner can view the alias URL while logged into Netlify. Alternative:
run the Docker Compose stack (§5) on any VPS for a publicly reachable staging.

### 3.4 Encryption
* In transit: Netlify terminates TLS for `*.netlify.app`; the session cookie is `Secure`/`HttpOnly`/`__Host-`.
* At rest: Netlify Database storage is encrypted by the managed provider. For the VPS path the Postgres data volume
  must live on an encrypted disk (LUKS or provider-encrypted block storage) and backups must be encrypted — this is
  part of the M3 go-live checklist.

## 4. Local development
```bash
scripts/db-local.sh start        # PostgreSQL 15 on 127.0.0.1:5433 (creates prodplan + prodplan_test)
cp .env.example .env             # then set AUTH_SECRET
npm install                      # runs prisma generate
npm run db:migrate               # applies prisma/migrations to prodplan
npm run db:seed                  # demo tenants: admin@acme.test / Password123! (see README)
npm run dev                      # http://localhost:3000
```
Integration tests use `TEST_DATABASE_URL` (`prodplan_test`); apply migrations there with
`DATABASE_URL=postgresql://$USER@127.0.0.1:5433/prodplan_test npm run db:migrate:deploy`.

## 5. Docker / VPS (production path for M3)
```bash
export AUTH_SECRET="$(openssl rand -base64 48)" APP_URL="https://plan.example.com" POSTGRES_PASSWORD="<strong>"
docker compose up -d --build     # db → migrate (prisma migrate deploy) → app on :3000
```
Put a reverse proxy with TLS (Caddy/nginx + Let's Encrypt) in front of port 3000, point the client's DNS A/CNAME
record at the VPS, schedule `pg_dump` backups to encrypted off-box storage, and keep `.env`/secrets out of git.
The image is a Next.js standalone build (`NEXT_OUTPUT_STANDALONE=1` at build time).

## 6. Health & smoke checks
* `GET /api/health` → `{ ok, db, schema, version, time }` (`db:true` = connection works, `schema:true` = tables exist).
* Smoke: `/login` loads; sign up a plant; dashboard shows the setup checklist; **Load demo data**; orders list,
  machine detail capacity table, material ledger and CSV import all work; a Viewer account sees no edit controls.
