import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Project guard rails (docs/M1_SPEC.md §2, §3, §8). Each rule below is mirrored by tests/unit/lint-rules.test.ts.
 *
 *  - The raw `prisma` client and `PrismaClient` may only be imported by the data/auth foundation files.
 *  - Raw SQL helpers (queryRaw / executeRaw family) cannot be tenant-scoped, so they are forbidden outside prisma/ and tests/.
 *  - The literal `passwordHash` may only appear in src/lib/auth/**, src/lib/serialize.ts (the redaction list),
 *    prisma/seed.ts and tests/**.
 *  - No console.* in app code — use src/lib/logger.ts.
 */

/** Files allowed to import the raw `prisma` client / `PrismaClient`. */
const RAW_PRISMA_ALLOWED = [
  "src/lib/db.ts",
  "src/lib/auth/**",
  "src/lib/rate-limit.ts",
  "src/lib/demo/demo-plant.ts",
  "src/app/api/health/route.ts",
  "prisma/seed.ts",
  "tests/**",
];

const RAW_SQL_SELECTORS = [
  {
    selector:
      "MemberExpression[property.type='Identifier'][property.name=/^\\$(queryRaw|queryRawUnsafe|queryRawTyped|executeRaw|executeRawUnsafe)$/]",
    message:
      "Raw SQL bypasses tenant scoping. Use model operations through tenantDb(); raw SQL is only allowed in prisma/ and tests/.",
  },
  {
    selector:
      "MemberExpression[property.type='Literal'][property.value=/^\\$(queryRaw|queryRawUnsafe|queryRawTyped|executeRaw|executeRawUnsafe)$/]",
    message:
      "Raw SQL bypasses tenant scoping. Use model operations through tenantDb(); raw SQL is only allowed in prisma/ and tests/.",
  },
];

const PASSWORD_HASH_SELECTORS = [
  {
    selector: "Identifier[name='passwordHash']",
    message: "passwordHash may only be handled inside src/lib/auth/** (use userSelect / UserDTO elsewhere).",
  },
  {
    selector: "Literal[value='passwordHash']",
    message: "passwordHash may only be handled inside src/lib/auth/** (use userSelect / UserDTO elsewhere).",
  },
  {
    selector: "TemplateElement[value.raw=/passwordHash/]",
    message: "passwordHash may only be handled inside src/lib/auth/** (use userSelect / UserDTO elsewhere).",
  },
];

const RESTRICTED_IMPORTS = {
  paths: [
    {
      name: "@/lib/db",
      importNames: ["prisma"],
      message:
        "Module code must not use the raw prisma client. Get a tenant-scoped client from requirePermission() / getTenantDb().",
    },
    {
      name: "@/generated/prisma/client",
      importNames: ["PrismaClient"],
      message: "Only src/lib/db.ts instantiates PrismaClient. Use tenantDb() / TenantDb / TenantTx.",
    },
    {
      name: "@prisma/client",
      message: "Import from @/generated/prisma/client (Prisma 7 generates the client into src/generated/prisma).",
    },
  ],
  patterns: [
    {
      regex: "(^|/)lib/db(\\.ts)?$",
      importNames: ["prisma"],
      message:
        "Module code must not use the raw prisma client. Get a tenant-scoped client from requirePermission() / getTenantDb().",
    },
    {
      regex: "(^|/)generated/prisma(/client(\\.ts)?)?$",
      importNames: ["PrismaClient"],
      message: "Only src/lib/db.ts instantiates PrismaClient. Use tenantDb() / TenantDb / TenantTx.",
    },
  ],
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Project additions:
    "src/generated/**",
    ".netlify/**",
    "coverage/**",
  ]),

  // --- Guard rails for every source file -----------------------------------------------------------------------
  {
    files: ["**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"],
    rules: {
      "no-restricted-imports": ["error", RESTRICTED_IMPORTS],
      "no-restricted-syntax": ["error", ...RAW_SQL_SELECTORS, ...PASSWORD_HASH_SELECTORS],
    },
  },
  {
    // No console.log/info/debug in app code — use src/lib/logger.ts. warn/error stay available for last-resort
    // diagnostics (e.g. the generic error sink in withAction()).
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },

  // --- Re-allow in the foundation files ------------------------------------------------------------------------
  {
    files: RAW_PRISMA_ALLOWED,
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    // The auth layer reads/writes passwordHash; serialize.ts lists it as a key to strip.
    files: ["src/lib/auth/**", "src/lib/serialize.ts"],
    rules: {
      "no-restricted-syntax": ["error", ...RAW_SQL_SELECTORS],
    },
  },
  {
    // Seed and tests may use raw SQL and touch passwordHash.
    files: ["prisma/**", "tests/**"],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
  {
    files: ["src/lib/logger.ts"],
    rules: {
      "no-console": "off",
    },
  },
]);

export default eslintConfig;
