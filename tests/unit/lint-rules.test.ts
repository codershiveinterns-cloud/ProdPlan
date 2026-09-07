/**
 * Source-tree guard rails (docs/M1_SPEC.md §2.6, §3, §8) — a grep-based mirror of eslint.config.mjs so the rules hold
 * even if someone disables ESLint. Walks src/ (excluding the generated client).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");

/** Files allowed to import the raw `prisma` client / `PrismaClient` (spec §2). */
const RAW_PRISMA_ALLOWED = ["src/lib/db.ts", "src/lib/auth/**", "src/lib/rate-limit.ts", "src/lib/demo/demo-plant.ts", "src/app/api/health/route.ts", "prisma/seed.ts", "tests/**"];
/** Files allowed to contain the literal `passwordHash` (spec §3; serialize.ts is the redaction list). */
const PASSWORD_HASH_ALLOWED = ["src/lib/auth/**", "src/lib/serialize.ts", "prisma/seed.ts", "tests/**"];

function isAllowed(rel: string, patterns: string[]): boolean {
  return patterns.some((p) => (p.endsWith("/**") ? rel.startsWith(p.slice(0, -2)) : rel === p));
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (full === path.join(SRC, "generated")) continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

const files = walk(SRC).map((full) => ({
  rel: path.relative(ROOT, full).split(path.sep).join("/"),
  text: readFileSync(full, "utf8"),
}));

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

function importsOf(text: string, sourceRegex: RegExp): string[] {
  const names: string[] = [];
  for (const m of text.matchAll(/import\s+(?:type\s+)?(?:(\*\s+as\s+\w+)|(\w+)?\s*,?\s*(?:\{([^}]*)\})?)\s*from\s*["']([^"']+)["']/g)) {
    const source = m[4];
    if (!sourceRegex.test(source)) continue;
    if (m[1]) names.push("*");
    if (m[2]) names.push("default");
    if (m[3]) {
      for (const part of m[3].split(",")) {
        const name = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim();
        if (name) names.push(name);
      }
    }
  }
  return names;
}

describe("source guard rails", () => {
  it("has files to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("only the allowed files import the raw prisma client from @/lib/db", () => {
    const offenders = files
      .filter((f) => !isAllowed(f.rel, RAW_PRISMA_ALLOWED))
      .filter((f) => {
        const names = importsOf(stripComments(f.text), /(^|\/)lib\/db(\.ts)?$/);
        return names.includes("prisma") || names.includes("*");
      })
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("only the allowed files import PrismaClient", () => {
    const offenders = files
      .filter((f) => !isAllowed(f.rel, RAW_PRISMA_ALLOWED))
      .filter((f) => {
        const generated = importsOf(stripComments(f.text), /(^|\/)generated\/prisma(\/client(\.ts)?)?$/);
        const legacy = importsOf(stripComments(f.text), /^@prisma\/client$/);
        return generated.includes("PrismaClient") || legacy.length > 0;
      })
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("raw SQL helpers are not used anywhere under src/", () => {
    const raw = /[.[]\s*["']?\$(queryRaw|queryRawUnsafe|queryRawTyped|executeRaw|executeRawUnsafe)\b/;
    const offenders = files.filter((f) => raw.test(stripComments(f.text))).map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("the literal passwordHash appears only in the auth layer and the redaction list", () => {
    const offenders = files
      .filter((f) => !isAllowed(f.rel, PASSWORD_HASH_ALLOWED))
      .filter((f) => /passwordHash/.test(stripComments(f.text)))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("app code uses the logger instead of console.log/info/debug", () => {
    const offenders = files
      .filter((f) => f.rel !== "src/lib/logger.ts")
      .filter((f) => /\bconsole\.(log|info|debug)\s*\(/.test(stripComments(f.text)))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("eslint.config.mjs carries the matching rules", () => {
    const config = readFileSync(path.join(ROOT, "eslint.config.mjs"), "utf8");
    expect(config).toContain("no-restricted-imports");
    expect(config).toContain("no-restricted-syntax");
    expect(config).toContain("passwordHash");
    expect(config).toContain("queryRaw");
    expect(config).toContain("src/generated/**");
  });
});
