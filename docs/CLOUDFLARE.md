# ProdPlan on Cloudflare

The public address is https://prodplan.pages.dev. Two Cloudflare resources back it:

| What | Where | How to update |
|---|---|---|
| Full application (landing, sign-in, demo, dashboard, all modules) | Pages project `prodplan` → **https://prodplan.pages.dev**, which forwards every request through a service binding to the private Worker `prodplan-app` (no workers.dev address; `workers_dev: false`) | App: `npm run cf:build && npx wrangler deploy`. Pages front (only when `cloudflare/pages/` changes): `cd cloudflare/pages && npx wrangler pages deploy ./public --project-name prodplan --branch main` |

## Database
Neon Postgres (project "Prodplan", region us-east-2) reached from the Worker through Hyperdrive config
`prodplan-db` (id `a0cf84ebe64442a593fe4e552c39964b`, binding `HYPERDRIVE` in `wrangler.jsonc`). The direct
connection string is kept outside the repo in `~/.config/prodplan/neon_database_url`.
Migrations run from a developer machine: `DATABASE_URL="$(cat ~/.config/prodplan/neon_database_url)" npm run db:migrate:deploy`.
Seed/demo data: `DATABASE_URL=... SEED_ALLOW=1 npm run db:seed` (already applied). The one-click demo plant creates
itself on first use and refreshes daily.

## Build
`npm run cf:build` (scripts/cf-build.mjs) generates the workerd flavour of the Prisma 7 client, runs the OpenNext
Cloudflare adapter build into `.open-next/`, then restores the Node flavour for local dev/tests. `wrangler.jsonc`
holds the Worker config (nodejs_compat, assets, self-reference service binding, Hyperdrive, `APP_URL` var).

## Secrets
`AUTH_SECRET` and `DEMO_RESET_TOKEN` are Worker secrets (`npx wrangler secret put NAME`). Rotating
`AUTH_SECRET` signs everyone out.

## Plan limits
The account is on the Workers Free plan (10 ms CPU per request). Password hashing (bcrypt cost 12, ~300 ms CPU) is
above that budget, so password sign-in/sign-up and the first creation of the demo plant may fail with a CPU-time
error until the account moves to Workers Paid ($5/month, then set `"limits": { "cpu_ms": 30000 }` in
wrangler.jsonc). The one-click demo profiles avoid bcrypt once the demo plant exists.

## Custom domain
Workers & Pages → prodplan (Pages) → Custom domains → add the client's domain (Cloudflare manages DNS + TLS);
then set `APP_URL` in wrangler.jsonc to that origin and redeploy the Worker.

The service binding on the Pages project (`APP` → `prodplan-app`) was set through the Cloudflare API and is kept in
`cloudflare/pages/wrangler.toml`; if the Pages project is ever recreated, re-apply the binding (Pages → Settings →
Bindings → Service binding `APP` → Worker `prodplan-app`).
