import { redirect } from "next/navigation";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import {
  GENERIC_ERROR_MESSAGE,
  VALIDATION_ERROR_MESSAGE,
  fail,
  fieldError,
  formDataToObject,
  mapActionError,
  ok,
  parseForm,
  uniqueViolationFields,
  withAction,
  type ActionState,
} from "@/lib/action";
import { AppError, DomainError, ForbiddenError, NotFoundError } from "@/lib/errors";

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

function fd(entries: Array<[string, string | Blob]>): FormData {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
}

describe("parseForm", () => {
  it("keeps required strings empty so .min(1) messages apply, and turns optional blanks into undefined", () => {
    const schema = z.object({
      name: z.string().min(1, "Required"),
      notes: z.string().max(10).optional(),
      code: z.string().optional(),
    });
    const parsed = parseForm(schema, fd([["name", "Widget"], ["notes", ""], ["code", "ABC"]]));
    expect(parsed).toEqual({ name: "Widget", code: "ABC" });

    const err = (() => {
      try {
        parseForm(schema, fd([["name", ""]]));
      } catch (e) {
        return e;
      }
      return null;
    })();
    expect(err).toBeInstanceOf(z.ZodError);
    expect(z.flattenError(err as z.ZodError<{ name: string }>).fieldErrors.name).toEqual(["Required"]);
  });

  it("does not let an empty number field become 0", () => {
    const schema = z.object({ qty: z.coerce.number({ error: "Enter a quantity" }).positive("Enter a quantity greater than 0") });
    expect(() => parseForm(schema, fd([["qty", ""]]))).toThrow(z.ZodError);
    expect(parseForm(schema, fd([["qty", "12.5"]]))).toEqual({ qty: 12.5 });
    const optional = z.object({ threshold: z.coerce.number().min(0).optional() });
    expect(parseForm(optional, fd([["threshold", ""]]))).toEqual({});
  });

  it("maps checkbox 'on' → true and a missing checkbox → false with z.coerce.boolean()", () => {
    const schema = z.object({ isActive: z.coerce.boolean() });
    expect(parseForm(schema, fd([["isActive", "on"]]))).toEqual({ isActive: true });
    expect(parseForm(schema, fd([]))).toEqual({ isActive: false });
  });

  it("collects repeated keys into arrays and wraps a lone value for array fields", () => {
    const schema = z.object({ days: z.array(z.coerce.number()).min(1, "Pick at least one day") });
    expect(parseForm(schema, fd([["days", "1"], ["days", "2"], ["days", "6"]]))).toEqual({ days: [1, 2, 6] });
    expect(parseForm(schema, fd([["days", "3"]]))).toEqual({ days: [3] });
    expect(() => parseForm(schema, fd([]))).toThrow(/Pick at least one day/);
    const optional = z.object({ tags: z.array(z.string()).optional() });
    expect(parseForm(optional, fd([]))).toEqual({});
    expect(parseForm(optional, fd([["tags", "a"]]))).toEqual({ tags: ["a"] });
  });

  it("applies defaults and enums", () => {
    const schema = z.object({
      priority: z.enum(["LOW", "NORMAL", "HIGH"]).default("NORMAL"),
      unit: z.string().trim().toLowerCase().default("pcs"),
    });
    expect(parseForm(schema, fd([["priority", ""], ["unit", ""]]))).toEqual({ priority: "NORMAL", unit: "pcs" });
    expect(parseForm(schema, fd([["priority", "HIGH"], ["unit", " KG "]]))).toEqual({ priority: "HIGH", unit: "kg" });
  });

  it("ignores Next's internal $ACTION fields and passes files through", () => {
    const file = new Blob(["a,b\n1,2"], { type: "text/csv" });
    const schema = z.object({ file: z.instanceof(Blob), name: z.string() });
    const parsed = parseForm(schema, fd([["$ACTION_ID_abc", "x"], ["$ACTION_REF_1", "y"], ["file", file], ["name", "orders.csv"]]));
    expect(parsed.name).toBe("orders.csv");
    expect(parsed.file).toBeInstanceOf(Blob);
    expect(formDataToObject(fd([["$ACTION_ID_abc", "x"], ["a", "1"], ["a", "2"]]))).toEqual({ a: ["1", "2"] });
  });

  it("still inspects the object shape through refine() and transform() wrappers", () => {
    const refined = z
      .object({ email: z.string().min(1, "Required"), note: z.string().optional() })
      .refine((d) => d.email.includes("@"), { path: ["email"], message: "Needs @" });
    expect(parseForm(refined, fd([["email", "a@b.co"], ["note", ""]]))).toEqual({ email: "a@b.co" });
    expect(() => parseForm(refined, fd([["email", ""]]))).toThrow(/Required/);

    const transformed = z.object({ n: z.coerce.number().optional() }).transform((d) => ({ doubled: (d.n ?? 0) * 2 }));
    expect(parseForm(transformed, fd([["n", ""]]))).toEqual({ doubled: 0 });
    expect(parseForm(transformed, fd([["n", "4"]]))).toEqual({ doubled: 8 });
  });
});

describe("withAction / mapActionError", () => {
  it("passes successful results through", async () => {
    const action = withAction(async (formData) => ok({ id: formData.get("id") }, "Saved"));
    await expect(action(null, fd([["id", "1"]]))).resolves.toEqual({ ok: true, message: "Saved", data: { id: "1" } });
  });

  it("maps ZodError to fieldErrors", async () => {
    const schema = z.object({ name: z.string().min(1, "Required"), qty: z.coerce.number().positive("Must be > 0") });
    const action = withAction(async (formData) => {
      parseForm(schema, formData);
      return ok();
    });
    const state = await action(null, fd([["name", ""], ["qty", "-1"]]));
    expect(state).toEqual({
      ok: false,
      error: VALIDATION_ERROR_MESSAGE,
      fieldErrors: { name: ["Required"], qty: ["Must be > 0"] },
    });
  });

  it("surfaces top-level refine messages as the form error", async () => {
    const schema = z.object({ a: z.string(), b: z.string() }).refine((d) => d.a === d.b, "Values must match");
    const action = withAction(async (formData) => {
      parseForm(schema, formData);
      return ok();
    });
    const state = await action(null, fd([["a", "x"], ["b", "y"]]));
    expect(state && !state.ok ? state.error : null).toBe("Values must match");
  });

  it("maps ForbiddenError to 'forbidden'", async () => {
    const action = withAction(async () => {
      throw new ForbiddenError();
    });
    await expect(action(null, fd([]))).resolves.toEqual({ ok: false, error: "forbidden" });
  });

  it("maps DomainError / AppError to their message", async () => {
    class StockWouldGoNegative extends DomainError {}
    const domain = withAction(async () => {
      throw new StockWouldGoNegative("Only 5 kg on hand");
    });
    await expect(domain(null, fd([]))).resolves.toEqual({ ok: false, error: "Only 5 kg on hand" });

    const notFound = withAction(async () => {
      throw new NotFoundError("Order not found");
    });
    await expect(notFound(null, fd([]))).resolves.toEqual({ ok: false, error: "Order not found" });

    const app = withAction(async () => {
      throw new AppError("Custom", "custom", 400);
    });
    await expect(app(null, fd([]))).resolves.toEqual({ ok: false, error: "Custom" });
  });

  it("maps Prisma P2002 to an 'already exists' message with field errors", async () => {
    const action = withAction(async () => {
      throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "7.10.0",
        meta: { target: ["tenantId", "orderNumber"] },
      });
    });
    const state = await action(null, fd([]));
    expect(state).toEqual({
      ok: false,
      error: "A record with the same order number already exists.",
      fieldErrors: { orderNumber: ["Already exists"] },
    });

    const noTarget = mapActionError({ code: "P2002" });
    expect(noTarget).toEqual({ ok: false, error: "This record already exists." });
  });

  it("extracts the fields from the driver-adapter P2002 shape (index name only)", () => {
    const adapterError = {
      code: "P2002",
      meta: {
        modelName: "Order",
        driverAdapterError: {
          name: "DriverAdapterError",
          cause: {
            kind: "UniqueConstraintViolation",
            constraint: { index: "Order_tenantId_orderNumber_key" },
            table: "Order",
          },
        },
      },
    };
    expect(uniqueViolationFields(adapterError)).toEqual(["orderNumber"]);
    expect(uniqueViolationFields({ code: "P2002", meta: { target: ["tenantId", "sku"] } })).toEqual(["sku"]);
    expect(
      uniqueViolationFields({
        code: "P2002",
        meta: { modelName: "User", driverAdapterError: { cause: { constraint: { index: "User_email_key" }, table: "User" } } },
      }),
    ).toEqual(["email"]);
    expect(uniqueViolationFields({ code: "P2003" })).toEqual([]);
    expect(uniqueViolationFields(new Error("x"))).toEqual([]);
    expect(mapActionError(adapterError)).toEqual({
      ok: false,
      error: "A record with the same order number already exists.",
      fieldErrors: { orderNumber: ["Already exists"] },
    });
  });

  it("maps P2003 / P2025 to friendly messages", () => {
    expect(mapActionError({ code: "P2003" })).toEqual({
      ok: false,
      error: "This record is referenced by other data and cannot be changed.",
    });
    expect(mapActionError({ code: "P2025" })).toMatchObject({ ok: false });
  });

  it("hides unknown errors behind a generic message", async () => {
    const action = withAction(async () => {
      throw new Error("db exploded: host=secret-host");
    });
    const state = await action(null, fd([]));
    expect(state).toEqual({ ok: false, error: GENERIC_ERROR_MESSAGE });
  });

  it("rethrows Next redirects so the framework handles them", async () => {
    const action = withAction(async () => {
      redirect("/orders/new");
    });
    await expect(action(null, fd([]))).rejects.toMatchObject({ digest: expect.stringMatching(/^NEXT_REDIRECT;/) });
  });

  it("has helper constructors with the contract shape", () => {
    const s1: ActionState = fail("Nope");
    const s2: ActionState = fieldError("email", "Taken");
    const s3: ActionState = ok(undefined, "Done");
    expect(s1).toEqual({ ok: false, error: "Nope" });
    expect(s2).toEqual({ ok: false, error: "Taken", fieldErrors: { email: ["Taken"] } });
    expect(s3).toEqual({ ok: true, message: "Done" });
  });
});
