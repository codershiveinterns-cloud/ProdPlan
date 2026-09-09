# ProdPlan on Vercel

Public address: **https://prodplan-app.vercel.app** (Vercel project `prodplan`, Hobby plan). The Next.js app runs
natively on Vercel (Node.js serverless functions) — no adapter.

| Item | Value |
|---|---|
| Database | Neon Postgres project "Prodplan" (us-east-2). `DATABASE_URL` on Vercel uses the **pooled** Neon host (`…-pooler…`); the direct URL is kept on the developer machine in `~/.config/prodplan/neon_database_url` for migrations. |
| Env vars (Production + Preview) | `DATABASE_URL`, `AUTH_SECRET`, `DEMO_RESET_TOKEN`, `APP_URL=https://prodplan-app.vercel.app` (`npx vercel env ls`) |
| Deploy | `npx vercel deploy --prod --yes --archive=tgz` from the repo root (the project is linked in `.vercel/`, git-ignored). Or connect the GitHub repo in the Vercel dashboard for deploy-on-push. |
| Migrations | `DATABASE_URL="$(cat ~/.config/prodplan/neon_database_url)" npm run db:migrate:deploy` — run before deploying a schema change. |
| Demo data | Seeded once with `DATABASE_URL=… SEED_ALLOW=1 npm run db:seed`; the one-click demo plant refreshes itself daily (or `POST /api/demo/reset` with header `x-demo-reset-token`). |
| Custom domain | Vercel → Project → Settings → Domains → add the client's domain; then update `APP_URL` and redeploy. |

Rotating `AUTH_SECRET` signs everyone out. `.vercelignore` keeps the local database directory and build output out of uploads.
