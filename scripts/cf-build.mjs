#!/usr/bin/env node
/**
 * Cloudflare build (docs/CLOUDFLARE.md): `npm run cf:build`.
 *
 * Prisma's query compiler is WebAssembly. The Node.js flavour of the generated client (prisma/schema.prisma,
 * `generator client` without `runtime`) loads it with `new WebAssembly.Module(bytes)`, which workerd forbids
 * ("Wasm code generation disallowed by embedder"). The `runtime = "workerd"` flavour imports the .wasm as a module
 * instead, which wrangler bundles. The schema itself must not change, so this script:
 *   1. generates the workerd flavour of the client into src/generated/prisma (same output path, same types),
 *   2. runs `opennextjs-cloudflare build`,
 *   3. always regenerates the Node.js flavour afterwards so dev/tests/Netlify keep working.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const schemaPath = path.join(root, "prisma", "schema.prisma");

function run(cmd, args, env = {}) {
  const res = spawnSync(cmd, args, { cwd: root, stdio: "inherit", env: { ...process.env, ...env } });
  if (res.status !== 0) throw new Error(`${cmd} ${args.join(" ")} exited with ${res.status}`);
}

function generateWorkerdClient() {
  const schema = readFileSync(schemaPath, "utf8");
  const generatorRe = /generator client \{[^}]*\}/;
  const block = schema.match(generatorRe)?.[0];
  if (!block || !block.includes('output   = "../src/generated/prisma"')) {
    throw new Error("cf-build: could not find the `generator client` block in prisma/schema.prisma");
  }
  // The temp schema lives in prisma/ so the relative output path stays "../src/generated/prisma".
  const tmpDir = mkdtempSync(path.join(root, "prisma", ".cf-"));
  const tmpSchema = path.join(tmpDir, "schema.prisma");
  const workerdBlock = block.replace(/\n\}$/, '\n  runtime  = "workerd"\n}');
  writeFileSync(tmpSchema, schema.replace(generatorRe, workerdBlock).replaceAll('"../src/generated/prisma"', '"../../src/generated/prisma"'));
  try {
    run("npx", ["prisma", "generate", `--schema=${tmpSchema}`]);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

let failed = false;
try {
  console.log("cf-build: generating the workerd flavour of the Prisma client");
  generateWorkerdClient();
  run("npx", ["opennextjs-cloudflare", "build", ...process.argv.slice(2)], { PRODPLAN_TARGET: "cloudflare" });
} catch (err) {
  failed = true;
  console.error(err instanceof Error ? err.message : err);
} finally {
  console.log("cf-build: restoring the Node.js flavour of the Prisma client");
  run("npx", ["prisma", "generate"]);
}
process.exit(failed ? 1 : 0);
