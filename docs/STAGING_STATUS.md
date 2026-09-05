# Staging environment — ground truth (updated 2026-09-05)

These facts were verified directly against the Netlify API/CLI while setting up staging. Use them when writing
DEPLOYMENT.md / HANDOVER_M1.md. Do not guess beyond them.

## Netlify site
- Site name: `prodplan-staging`, site id `4b70c222-c00d-45f5-9065-21d335c9eee3`, team `gauravcodershive` (Free / credit-based plan).
- Admin URL: https://app.netlify.com/projects/prodplan-staging
- Production URL (not yet published): https://prodplan-staging.netlify.app
- Alias (branch-style) deploy URL that works today: https://staging--prodplan-staging.netlify.app
  (deployed with `netlify deploy --alias staging`; build runs locally via netlify-cli 27 and is uploaded).
- The project folder is linked (`.netlify/state.json`, git-ignored). Env vars set in the production context:
  `AUTH_SECRET`, `APP_URL=https://prodplan-staging.netlify.app` (plus NODE_VERSION/NPM_FLAGS from netlify.toml).
- Next.js 16 builds and deploys fine with `@netlify/plugin-nextjs` (skeleton deploy took ~60 s).

## Known blocker: public access
- `netlify deploy --prod` is rejected by the API with HTTP 403:
  "Account credit usage exceeded - new deploys are blocked until credits are added".
  The account's monthly credits (300) are exhausted; the next usage period starts 2026-09-19.
- Draft/alias deploys still work, BUT they are served behind Netlify's team login (HTTP 401 → app.netlify.com/edge-access).
  The site owner can view them when logged into Netlify; the client cannot.
- Resolution options (owner decision): add Netlify credits / upgrade, or wait for the credit reset, then run
  `netlify deploy --prod`; or host staging elsewhere (Docker Compose on a VPS; Cloudflare Workers is authenticated on
  this machine but only offers D1/SQLite, which diverges from the Postgres production target).

## Netlify Database (managed Postgres, Neon-backed)
- Provisioned automatically for the site once `@netlify/database` was a dependency and a deploy ran.
- API `GET /sites/{id}/database/branch/production` returns only a READ-ONLY connection string
  (`netlifydb_readonly@ep-round-hill-a56z3uhs.us-east-2.db.netlify.com/netlifydb?sslmode=require`).
  Writable access is only available to the deployed app's functions via the injected `NETLIFY_DATABASE_URL`
  env var (verify at runtime with /api/health), and via deploy-time migrations.
- Migrations: Netlify applies SQL files in the configured migrations directory at deploy time; `netlify.toml`
  sets `[db.migrations] path = "prisma/migrations"` so Prisma's `<timestamp>_<name>/migration.sql` folders are
  applied. `netlify database status --branch production` lists applied migrations (`migrations: null` before any).
  Because Netlify (not Prisma) applies them on staging, do NOT run `prisma migrate deploy` against staging.
- Seeding staging: there is no external write access, so demo data must be loaded through the app itself
  (Admin → "Load demo data" action / protected setup route), not via `prisma db seed`.
- The CLI's `netlify database init --yes` scaffolds a Drizzle "planets" starter — do not run it.

## Local
- Postgres 15 via `scripts/db-local.sh start` (project-owned data dir `.pgdata`, port 5433, needs LC_ALL — handled by the script).
- `DATABASE_URL=postgresql://gauravcodershive@127.0.0.1:5433/prodplan`, test DB `prodplan_test`.
