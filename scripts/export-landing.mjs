// Exports the marketing landing page as a standalone static site (out-landing/) for Cloudflare Pages.
// Usage: APP_URL=https://app.example.com node scripts/export-landing.mjs
import { execSync, spawn } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const APP_URL = process.env.APP_URL ?? "https://staging--prodplan-staging.netlify.app";
const PORT = 3999;
const OUT = "out-landing";
const env = { ...process.env, STATIC_LANDING: "1", APP_URL, NEXT_TELEMETRY_DISABLED: "1" };

console.log(`[export] building with STATIC_LANDING=1 APP_URL=${APP_URL}`);
execSync("npx prisma generate && npx next build", { stdio: "inherit", env });

const server = spawn("npx", ["next", "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "inherit"] });
try {
  let ready = false;
  for (let i = 0; i < 40 && !ready; i++) {
    await sleep(500);
    try { ready = (await fetch(`http://localhost:${PORT}/`)).ok; } catch {}
  }
  if (!ready) throw new Error("next start did not become ready");

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const get = async (path) => {
    const r = await fetch(`http://localhost:${PORT}${path}`);
    if (!r.ok) throw new Error(`${path} -> ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  };
  const html = (await get("/")).toString("utf8");
  if (/milestone|coming next|roadmap/i.test(html)) throw new Error("forbidden wording in landing HTML");
  writeFileSync(`${OUT}/index.html`, html);
  writeFileSync(`${OUT}/opengraph-image.png`, await get("/opengraph-image"));
  writeFileSync(`${OUT}/sitemap.xml`, await get("/sitemap.xml"));
  writeFileSync(`${OUT}/robots.txt`, await get("/robots.txt"));
  writeFileSync(`${OUT}/icon.svg`, await get("/icon.svg"));
  cpSync(".next/static", `${OUT}/_next/static`, { recursive: true });
  cpSync("public", OUT, { recursive: true });
  // Product routes are not part of the static site: send them to the hosted application.
  writeFileSync(`${OUT}/_redirects`, ["/login", "/signup", "/dashboard", "/orders/*", "/products/*", "/materials/*", "/machines/*", "/customers/*", "/calendars/*", "/work-centers/*", "/settings/*"].map((p) => `${p} ${APP_URL}${p.replace("/*", "/:splat")} 302`).join("\n") + "\n");
  writeFileSync(`${OUT}/_headers`, "/_next/static/*\n  Cache-Control: public, max-age=31536000, immutable\n");
  writeFileSync(`${OUT}/404.html`, `<!doctype html><meta http-equiv="refresh" content="0;url=/"><title>ProdPlan</title>`);
  console.log(`[export] wrote ${OUT}/ (${html.length} bytes of HTML)`);
} finally {
  server.kill("SIGTERM");
}
