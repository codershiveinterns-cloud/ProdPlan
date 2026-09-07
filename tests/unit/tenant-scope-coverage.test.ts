/**
 * Keeps src/lib/db.ts in sync with prisma/schema.prisma (docs/M1_SPEC.md §2): every model with a tenantId column must
 * be tenant-scoped, every model without one must be a known platform model, and the Json-column list must match.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { JSON_FIELDS, PLATFORM_MODELS, TENANT_SCOPED_MODELS } from "@/lib/db";

const PLATFORM_ALLOWLIST = new Set(["Tenant", "RateLimitBucket"]);

type ParsedModel = {
  name: string;
  hasTenantId: boolean;
  jsonFields: string[];
  relationFields: string[];
};

function parseSchema(): ParsedModel[] {
  const schema = readFileSync(path.resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
  const modelNames = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]);
  const models: ParsedModel[] = [];
  for (const match of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const [, name, body] = match;
    const fieldLines = body
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("//") && !l.startsWith("@@"));
    const fields = fieldLines
      .map((l) => l.match(/^(\w+)\s+([A-Za-z]\w*)(\[\])?\??/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map((m) => ({ field: m[1], type: m[2] }));
    models.push({
      name,
      hasTenantId: fields.some((f) => f.field === "tenantId" && f.type === "String"),
      jsonFields: fields.filter((f) => f.type === "Json").map((f) => f.field),
      relationFields: fields.filter((f) => modelNames.includes(f.type)).map((f) => f.field),
    });
  }
  return models;
}

const models = parseSchema();

describe("tenant scope coverage vs prisma/schema.prisma", () => {
  it("parses the schema", () => {
    expect(models.length).toBeGreaterThanOrEqual(15);
    expect(models.map((m) => m.name)).toContain("Order");
  });

  it("every model with a tenantId column is in TENANT_SCOPED_MODELS", () => {
    const withTenant = models.filter((m) => m.hasTenantId).map((m) => m.name);
    for (const name of withTenant) {
      expect(TENANT_SCOPED_MODELS.has(name as never), `${name} must be tenant-scoped`).toBe(true);
    }
    expect([...TENANT_SCOPED_MODELS].sort()).toEqual(withTenant.sort());
  });

  it("every model without a tenantId column is an allowlisted platform model", () => {
    const withoutTenant = models.filter((m) => !m.hasTenantId).map((m) => m.name);
    for (const name of withoutTenant) {
      expect(PLATFORM_ALLOWLIST.has(name), `${name} has no tenantId and is not allowlisted`).toBe(true);
      expect(TENANT_SCOPED_MODELS.has(name as never), `${name} must not be tenant-scoped`).toBe(false);
    }
    expect([...PLATFORM_MODELS].sort()).toEqual(withoutTenant.sort());
  });

  it("JSON_FIELDS lists exactly the Json columns of the schema", () => {
    const expected: Record<string, string[]> = {};
    for (const m of models) if (m.jsonFields.length) expected[m.name] = m.jsonFields.sort();
    const actual: Record<string, string[]> = {};
    for (const [model, fields] of Object.entries(JSON_FIELDS)) actual[model] = [...fields].sort();
    expect(actual).toEqual(expected);
  });

  it("no relation field shares a name with a Json column (the walker skips Json values by key)", () => {
    const jsonNames = new Set(Object.values(JSON_FIELDS).flat());
    for (const m of models) {
      for (const rel of m.relationFields) {
        expect(jsonNames.has(rel), `${m.name}.${rel} collides with a Json column name`).toBe(false);
      }
    }
  });
});
