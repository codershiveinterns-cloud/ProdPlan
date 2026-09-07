import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  bomItemSchema,
  booleanChoice,
  calendarExceptionSchema,
  calendarSchema,
  changePasswordSchema,
  checkbox,
  checkImportHeaders,
  createOrderSchema,
  customerRefSchema,
  customerSchema,
  daysOfWeekField,
  downtimeSchema,
  editOrderNotesSchema,
  editOrderSchema,
  editUserSchema,
  emailField,
  emptyToUndefined,
  enumField,
  hasControlChars,
  hasMaxDecimals,
  IMPORT_TEMPLATE_EXAMPLES,
  importRowSchema,
  inviteUserSchema,
  loginSchema,
  machineSchema,
  materialSchema,
  moveOperationSchema,
  movementDelta,
  numberField,
  optionalCheckbox,
  optionalNumberField,
  optionalText,
  PAST_DUE_WARNING,
  productOperationSchema,
  productSchema,
  profileNameSchema,
  quantityField,
  resetPasswordSchema,
  setUserActiveSchema,
  shiftSchema,
  signupSchema,
  statusChangeSchema,
  stockMovementSchema,
  summarizeImport,
  tenantSettingsSchema,
  text,
  unitField,
  validateImportRow,
  validateImportRows,
  workCenterSchema,
} from "@/lib/validation";

/** Field errors flattened the way `withAction` does. */
function errorsOf(schema: z.ZodType, input: unknown): Record<string, string[]> {
  const r = schema.safeParse(input);
  if (r.success) throw new Error(`expected failure, got ${JSON.stringify(r.data)}`);
  const flat = z.flattenError(r.error);
  return { ...flat.fieldErrors, ...(flat.formErrors.length ? { _form: flat.formErrors } : {}) } as Record<string, string[]>;
}

function ok<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const r = schema.safeParse(input);
  if (!r.success) throw new Error(`expected success, got ${JSON.stringify(z.flattenError(r.error))}`);
  return r.data;
}

describe("common helpers", () => {
  it("emptyToUndefined / hasControlChars / hasMaxDecimals", () => {
    expect(emptyToUndefined("")).toBeUndefined();
    expect(emptyToUndefined("   ")).toBeUndefined();
    expect(emptyToUndefined(null)).toBeUndefined();
    expect(emptyToUndefined("x")).toBe("x");
    expect(emptyToUndefined(0)).toBe(0);
    expect(hasControlChars("plain text")).toBe(false);
    expect(hasControlChars("tab\there")).toBe(true);
    expect(hasControlChars("line\nbreak")).toBe(true);
    expect(hasControlChars("line\nbreak", true)).toBe(false);
    expect(hasControlChars("nul\u0000", true)).toBe(true);
    expect(hasControlChars("del\u007F", true)).toBe(true);
    expect(hasMaxDecimals(1.25, 2)).toBe(true);
    expect(hasMaxDecimals(1.255, 2)).toBe(false);
    expect(hasMaxDecimals(0.1 + 0.2, 3)).toBe(true);
    expect(hasMaxDecimals(Number.NaN, 3)).toBe(false);
  });

  it("text: trims, bounds and rejects control characters", () => {
    const s = text("Name", { max: 5 });
    expect(ok(s, "  ab ")).toBe("ab");
    expect(errorsOf(s, "")).toEqual({ _form: ["Name is required"] });
    expect(errorsOf(s, "   ")).toEqual({ _form: ["Name is required"] });
    expect(errorsOf(s, undefined)).toEqual({ _form: ["Name is required"] });
    expect(errorsOf(s, "abcdef")).toEqual({ _form: ["Name must be at most 5 characters"] });
    expect(errorsOf(s, "a\tb")).toEqual({ _form: ["Name contains invalid characters"] });
    expect(errorsOf(text("Company", { min: 2, max: 9 }), "a")).toEqual({ _form: ["Company must be at least 2 characters"] });
    expect(ok(text("Notes", { max: 20, multiline: true }), "a\nb")).toBe("a\nb");
  });

  it("optionalText: blank → undefined", () => {
    const s = optionalText("Code", { max: 3 });
    expect(ok(s, "")).toBeUndefined();
    expect(ok(s, undefined)).toBeUndefined();
    expect(ok(s, " ab ")).toBe("ab");
    expect(errorsOf(s, "abcd")).toEqual({ _form: ["Code must be at most 3 characters"] });
  });

  it("numberField: coerces plain decimals, distinguishes blank from non-numeric", () => {
    const s = numberField("Qty", { min: 0, decimals: 3 });
    expect(ok(s, "12.5")).toBe(12.5);
    expect(ok(s, " 7 ")).toBe(7);
    expect(ok(s, 3)).toBe(3);
    expect(ok(s, ["1", "2"])).toBe(2);
    expect(errorsOf(s, "")).toEqual({ _form: ["Qty is required"] });
    expect(errorsOf(s, undefined)).toEqual({ _form: ["Qty is required"] });
    expect(errorsOf(s, "abc")).toEqual({ _form: ["Qty must be a number"] });
    expect(errorsOf(s, "1e3")).toEqual({ _form: ["Qty must be a number"] });
    expect(errorsOf(s, "1,000")).toEqual({ _form: ["Qty must be a number"] });
    expect(errorsOf(s, "-1")).toEqual({ _form: ["Qty must be at least 0"] });
    expect(errorsOf(s, "1.2345")).toEqual({ _form: ["Qty can have at most 3 decimal places"] });
    expect(ok(numberField("X", { defaultValue: 0 }), "")).toBe(0);
    expect(ok(numberField("X", { defaultValue: 0 }), "4")).toBe(4);
    expect(errorsOf(numberField("N", { integer: true }), "1.5")).toEqual({ _form: ["N must be a whole number"] });
    expect(errorsOf(numberField("N", { max: 10 }), "11")).toEqual({ _form: ["N must be at most 10"] });
  });

  it("optionalNumberField / quantityField", () => {
    expect(ok(optionalNumberField("Cost", { min: 0 }), "")).toBeUndefined();
    expect(ok(optionalNumberField("Cost", { min: 0 }), "12.25")).toBe(12.25);
    expect(errorsOf(optionalNumberField("Cost", { min: 0 }), "x")).toEqual({ _form: ["Cost must be a number"] });
    const q = quantityField("Quantity");
    expect(ok(q, "0.125")).toBe(0.125);
    expect(errorsOf(q, "0")).toEqual({ _form: ["Enter a quantity greater than 0"] });
    expect(errorsOf(q, "")).toEqual({ _form: ["Enter a quantity greater than 0"] });
    expect(errorsOf(q, "-2")).toEqual({ _form: ["Enter a quantity greater than 0"] });
    expect(errorsOf(q, "1.0001")).toEqual({ _form: ["Quantity can have at most 3 decimal places"] });
  });

  it("checkbox / optionalCheckbox / booleanChoice", () => {
    const c = checkbox();
    expect(ok(c, "on")).toBe(true);
    expect(ok(c, "true")).toBe(true);
    expect(ok(c, undefined)).toBe(false);
    expect(ok(c, "false")).toBe(false);
    expect(ok(c, ["false", "on"])).toBe(true);
    expect(ok(c, ["false"])).toBe(false);
    expect(errorsOf(c, "maybe")).toEqual({ _form: ["Invalid value"] });
    const o = optionalCheckbox();
    expect(ok(o, undefined)).toBeUndefined();
    expect(ok(o, "")).toBeUndefined();
    expect(ok(o, "on")).toBe(true);
    expect(ok(o, "false")).toBe(false);
    const b = booleanChoice("Choose Working or Non-working");
    expect(ok(b, "working")).toBe(true);
    expect(ok(b, "non-working")).toBe(false);
    expect(errorsOf(b, undefined)).toEqual({ _form: ["Choose Working or Non-working"] });
  });

  it("emailField normalises and validates", () => {
    expect(ok(emailField, "  Admin@Acme.TEST ")).toBe("admin@acme.test");
    expect(errorsOf(emailField, "")).toEqual({ _form: ["Email is required"] });
    expect(errorsOf(emailField, "not-an-email")).toEqual({ _form: ["Enter a valid email address"] });
    expect(errorsOf(emailField, `${"a".repeat(250)}@x.io`)).toEqual({ _form: ["Email must be at most 254 characters"] });
  });

  it("unitField lower-cases, defaults to pcs and restricts characters", () => {
    expect(ok(unitField, " KG ")).toBe("kg");
    expect(ok(unitField, "")).toBe("pcs");
    expect(ok(unitField, undefined)).toBe("pcs");
    expect(ok(unitField, "sq m")).toBe("sq m");
    expect(errorsOf(unitField, "kg!")).toEqual({ _form: ["Unit may contain letters, digits, spaces and . / % -"] });
    expect(errorsOf(unitField, "a".repeat(17))).toEqual({ _form: ["Unit must be at most 16 characters"] });
  });

  it("enumField normalises case, spaces and hyphens", () => {
    const e = enumField({ IN_PROGRESS: "IN_PROGRESS", ON_HOLD: "ON_HOLD" }, "Pick one");
    expect(ok(e, "in progress")).toBe("IN_PROGRESS");
    expect(ok(e, " on-hold ")).toBe("ON_HOLD");
    expect(errorsOf(e, "")).toEqual({ _form: ["Pick one"] });
    expect(errorsOf(e, "done")).toEqual({ _form: ["Pick one"] });
  });
});

describe("auth schemas", () => {
  const good = {
    companyName: "Acme Precision Works",
    timezone: "Asia/Kolkata",
    name: "Asha",
    email: "Admin@Acme.test",
    password: "Password123!",
  };

  it("signupSchema happy path lower-cases the email", () => {
    expect(ok(signupSchema, good)).toEqual({ ...good, email: "admin@acme.test" });
  });

  it("signupSchema sad paths", () => {
    expect(errorsOf(signupSchema, { ...good, companyName: "A" })).toEqual({
      companyName: ["Company name must be at least 2 characters"],
    });
    expect(errorsOf(signupSchema, { ...good, timezone: "Mars/Olympus" })).toEqual({ timezone: ["Select a valid time zone"] });
    expect(errorsOf(signupSchema, { ...good, timezone: "" })).toEqual({ timezone: ["Select a time zone"] });
    expect(errorsOf(signupSchema, { ...good, password: "short" })).toEqual({
      password: ["Password must be at least 8 characters"],
    });
    expect(errorsOf(signupSchema, { ...good, password: "x".repeat(73) })).toEqual({
      password: ["Password must be at most 72 characters"],
    });
    expect(errorsOf(signupSchema, { ...good, password: "admin@acme.test" })).toEqual({
      password: ["Password must not be the same as your email"],
    });
    expect(errorsOf(signupSchema, { ...good, email: "nope" })).toEqual({ email: ["Enter a valid email address"] });
    expect(errorsOf(signupSchema, { ...good, name: "" })).toEqual({ name: ["Your name is required"] });
  });

  it("loginSchema", () => {
    expect(ok(loginSchema, { email: " A@B.co ", password: "x", next: "/orders" })).toEqual({
      email: "a@b.co",
      password: "x",
      next: "/orders",
    });
    expect(errorsOf(loginSchema, { email: "a@b.co", password: "" })).toEqual({ password: ["Enter your password"] });
    expect(errorsOf(loginSchema, { email: "", password: "x" })).toEqual({ email: ["Email is required"] });
  });

  it("changePasswordSchema", () => {
    expect(ok(changePasswordSchema, { currentPassword: "OldPass123", newPassword: "NewPass123" })).toMatchObject({
      newPassword: "NewPass123",
    });
    expect(ok(changePasswordSchema, { currentPassword: "OldPass123", newPassword: "NewPass123", confirmPassword: "NewPass123" })).toBeTruthy();
    expect(errorsOf(changePasswordSchema, { currentPassword: "", newPassword: "NewPass123" })).toEqual({
      currentPassword: ["Enter your current password"],
    });
    expect(errorsOf(changePasswordSchema, { currentPassword: "Same12345", newPassword: "Same12345" })).toEqual({
      newPassword: ["New password must be different from the current password"],
    });
    expect(errorsOf(changePasswordSchema, { currentPassword: "OldPass123", newPassword: "NewPass123", confirmPassword: "Other1234" })).toEqual({
      confirmPassword: ["Passwords do not match"],
    });
    expect(errorsOf(changePasswordSchema, { currentPassword: "OldPass123", newPassword: "short" })).toEqual({
      newPassword: ["Password must be at least 8 characters"],
    });
  });

  it("profileNameSchema", () => {
    expect(ok(profileNameSchema, { name: " Asha " })).toEqual({ name: "Asha" });
    expect(errorsOf(profileNameSchema, { name: "" })).toEqual({ name: ["Name is required"] });
  });
});

describe("tenant & users", () => {
  it("tenantSettingsSchema", () => {
    expect(ok(tenantSettingsSchema, { name: "Acme", timezone: "UTC", defaultCalendarId: "" })).toEqual({
      name: "Acme",
      timezone: "UTC",
      defaultCalendarId: undefined,
    });
    expect(ok(tenantSettingsSchema, { name: "Acme", timezone: "Asia/Kolkata", defaultCalendarId: "cal1" }).defaultCalendarId).toBe("cal1");
    expect(errorsOf(tenantSettingsSchema, { name: "A", timezone: "x" })).toEqual({
      name: ["Company name must be at least 2 characters"],
      timezone: ["Select a valid time zone"],
    });
  });

  it("inviteUserSchema", () => {
    expect(ok(inviteUserSchema, { name: "Raj", email: "RAJ@acme.test", role: "planner", temporaryPassword: "" })).toEqual({
      name: "Raj",
      email: "raj@acme.test",
      role: "PLANNER",
      temporaryPassword: undefined,
    });
    expect(ok(inviteUserSchema, { name: "Raj", email: "raj@acme.test", role: "VIEWER", temporaryPassword: "Temp12345" }).temporaryPassword).toBe("Temp12345");
    expect(errorsOf(inviteUserSchema, { name: "Raj", email: "raj@acme.test", role: "OWNER" })).toEqual({ role: ["Select a role"] });
    expect(errorsOf(inviteUserSchema, { name: "Raj", email: "raj@acme.test", role: "ADMIN", temporaryPassword: "short" })).toEqual({
      temporaryPassword: ["Password must be at least 8 characters"],
    });
  });

  it("editUserSchema / resetPasswordSchema / setUserActiveSchema", () => {
    expect(ok(editUserSchema, { userId: "u1", name: "Raj", role: "SUPERVISOR" })).toEqual({ userId: "u1", name: "Raj", role: "SUPERVISOR" });
    expect(errorsOf(editUserSchema, { userId: "", name: "Raj", role: "SUPERVISOR" })).toEqual({ userId: ["Select a user"] });
    expect(ok(resetPasswordSchema, { userId: "u1" })).toEqual({ userId: "u1", temporaryPassword: undefined });
    expect(ok(setUserActiveSchema, { userId: "u1", isActive: "true" })).toEqual({ userId: "u1", isActive: true });
    expect(ok(setUserActiveSchema, { userId: "u1" })).toEqual({ userId: "u1", isActive: false });
  });
});

describe("customers", () => {
  it("normalises the name and blanks optional fields", () => {
    expect(ok(customerSchema, { name: "  Bharat   Motors ", code: "", email: "", phone: "", notes: "" })).toEqual({
      name: "Bharat Motors",
      code: undefined,
      email: undefined,
      phone: undefined,
      notes: undefined,
      isActive: undefined,
    });
    expect(ok(customerSchema, { name: "X", email: " Buyer@X.com ", isActive: "on" })).toMatchObject({ email: "buyer@x.com", isActive: true });
  });

  it("rejects bad values", () => {
    expect(errorsOf(customerSchema, { name: "" })).toEqual({ name: ["Customer name is required"] });
    expect(errorsOf(customerSchema, { name: "a".repeat(121) })).toEqual({ name: ["Customer name must be at most 120 characters"] });
    expect(errorsOf(customerSchema, { name: "X", email: "bad" })).toEqual({ email: ["Enter a valid email address"] });
    expect(errorsOf(customerSchema, { name: "X", notes: "n".repeat(2001) })).toEqual({ notes: ["Notes must be at most 2000 characters"] });
  });
});

describe("products / BOM / routing", () => {
  it("productSchema", () => {
    expect(ok(productSchema, { sku: " HB-200 ", name: "Hydraulic Bracket", unit: "", description: "" })).toEqual({
      sku: "HB-200",
      name: "Hydraulic Bracket",
      unit: "pcs",
      description: undefined,
      isActive: undefined,
    });
    expect(errorsOf(productSchema, { sku: "", name: "" })).toEqual({ sku: ["SKU is required"], name: ["Name is required"] });
  });

  it("bomItemSchema", () => {
    expect(ok(bomItemSchema, { productId: "p1", materialId: "m1", quantityPerUnit: "2.5", scrapPercent: "10", note: "" })).toEqual({
      productId: "p1",
      materialId: "m1",
      quantityPerUnit: 2.5,
      scrapPercent: 10,
      note: undefined,
    });
    expect(ok(bomItemSchema, { productId: "p1", materialId: "m1", quantityPerUnit: "1", scrapPercent: "" }).scrapPercent).toBe(0);
    expect(errorsOf(bomItemSchema, { productId: "p1", materialId: "", quantityPerUnit: "0", scrapPercent: "101" })).toEqual({
      materialId: ["Select a material"],
      quantityPerUnit: ["Enter a quantity per unit greater than 0"],
      scrapPercent: ["Scrap % must be between 0 and 100"],
    });
    expect(errorsOf(bomItemSchema, { productId: "p1", materialId: "m1", quantityPerUnit: "1.2345", scrapPercent: "2.555" })).toEqual({
      quantityPerUnit: ["Quantity per unit can have at most 3 decimal places"],
      scrapPercent: ["Scrap % can have at most 2 decimal places"],
    });
  });

  it("productOperationSchema / moveOperationSchema", () => {
    expect(ok(productOperationSchema, { productId: "p1", workCenterId: "wc1", machineId: "", setupMinutes: "", runMinutesPerUnit: "0.5" })).toEqual({
      productId: "p1",
      workCenterId: "wc1",
      machineId: undefined,
      setupMinutes: 0,
      runMinutesPerUnit: 0.5,
    });
    expect(errorsOf(productOperationSchema, { productId: "p1", workCenterId: "", setupMinutes: "1.5", runMinutesPerUnit: "" })).toEqual({
      workCenterId: ["Select a work center"],
      setupMinutes: ["Setup minutes must be a whole number"],
      runMinutesPerUnit: ["Run minutes per unit is required"],
    });
    expect(errorsOf(productOperationSchema, { productId: "p1", workCenterId: "wc", runMinutesPerUnit: "-1" })).toEqual({
      runMinutesPerUnit: ["Run minutes per unit must be at least 0"],
    });
    expect(ok(moveOperationSchema, { productId: "p1", operationId: "o1", direction: "up" }).direction).toBe("up");
    expect(errorsOf(moveOperationSchema, { productId: "p1", operationId: "o1", direction: "left" })).toEqual({ direction: ["Invalid direction"] });
  });
});

describe("materials & stock movements", () => {
  it("materialSchema", () => {
    expect(ok(materialSchema, { code: "RM-AL6061-BAR", name: "Aluminium bar", unit: "KG", reorderThreshold: "", reorderLeadTimeDays: "", unitCost: "", supplier: "" })).toEqual({
      code: "RM-AL6061-BAR",
      name: "Aluminium bar",
      unit: "kg",
      reorderThreshold: 0,
      reorderLeadTimeDays: 0,
      unitCost: undefined,
      supplier: undefined,
      isActive: undefined,
    });
    expect(errorsOf(materialSchema, { code: "C", name: "N", reorderThreshold: "-1", reorderLeadTimeDays: "4000", unitCost: "1.234" })).toEqual({
      reorderThreshold: ["Reorder threshold must be at least 0"],
      reorderLeadTimeDays: ["Lead time must be at most 3650 days"],
      unitCost: ["Unit cost can have at most 2 decimal places"],
    });
  });

  it("stockMovementSchema requires quantity or newStock depending on type", () => {
    const receipt = ok(stockMovementSchema, { materialId: "m1", type: "receipt", quantity: "12.5", reference: "GRN-1" });
    expect(receipt).toMatchObject({ type: "RECEIPT", quantity: 12.5, reference: "GRN-1" });
    expect(receipt.newStock).toBeUndefined();
    expect(ok(stockMovementSchema, { materialId: "m1", type: "ADJUSTMENT", newStock: "0" })).toMatchObject({ newStock: 0 });
    expect(errorsOf(stockMovementSchema, { materialId: "m1", type: "ISSUE" })).toEqual({ quantity: ["Enter a quantity greater than 0"] });
    expect(errorsOf(stockMovementSchema, { materialId: "m1", type: "ISSUE", quantity: "0" })).toEqual({ quantity: ["Enter a quantity greater than 0"] });
    expect(errorsOf(stockMovementSchema, { materialId: "m1", type: "ISSUE", quantity: "-3" })).toEqual({ quantity: ["Enter a quantity greater than 0"] });
    expect(errorsOf(stockMovementSchema, { materialId: "m1", type: "ADJUSTMENT" })).toEqual({ newStock: ["Enter the counted stock on hand (0 or more)"] });
    expect(errorsOf(stockMovementSchema, { materialId: "m1", type: "ADJUSTMENT", newStock: "-1" })).toEqual({
      newStock: ["Enter the counted stock on hand (0 or more)"],
    });
    expect(errorsOf(stockMovementSchema, { materialId: "m1", type: "TRANSFER", quantity: "1" })).toEqual({ type: ["Select a movement type"] });
    expect(errorsOf(stockMovementSchema, { materialId: "m1", type: "RETURN", quantity: "1.2345" })).toEqual({
      quantity: ["Quantity can have at most 3 decimal places"],
    });
  });

  it("movementDelta signs the quantity", () => {
    expect(movementDelta({ type: "RECEIPT", quantity: 5 }, 10)).toBe(5);
    expect(movementDelta({ type: "RETURN", quantity: 2.5 }, 10)).toBe(2.5);
    expect(movementDelta({ type: "ISSUE", quantity: 3 }, 10)).toBe(-3);
    expect(movementDelta({ type: "ADJUSTMENT", newStock: 7 }, "10.000")).toBe(-3);
    expect(movementDelta({ type: "ADJUSTMENT", newStock: 12.125 }, 10)).toBe(2.125);
  });
});

describe("work centers, machines, downtime", () => {
  it("workCenterSchema", () => {
    expect(ok(workCenterSchema, { code: "CNC", name: "CNC machining", description: "" })).toEqual({
      code: "CNC",
      name: "CNC machining",
      description: undefined,
      isActive: undefined,
    });
    expect(errorsOf(workCenterSchema, { code: "", name: "x".repeat(121) })).toEqual({
      code: ["Code is required"],
      name: ["Name must be at most 120 characters"],
    });
  });

  it("machineSchema defaults and bounds", () => {
    const base = { workCenterId: "wc1", calendarId: "cal1", code: "CNC-01", name: "Haas VF-2" };
    expect(ok(machineSchema, { ...base, status: "", efficiencyPercent: "", ratedCapacityPerShift: "", capacityUnit: "", notes: "" })).toEqual({
      ...base,
      status: "ACTIVE",
      efficiencyPercent: 100,
      ratedCapacityPerShift: undefined,
      capacityUnit: undefined,
      notes: undefined,
    });
    expect(ok(machineSchema, { ...base, status: "maintenance", efficiencyPercent: "85", ratedCapacityPerShift: "120", capacityUnit: "PCS" })).toMatchObject({
      status: "MAINTENANCE",
      efficiencyPercent: 85,
      ratedCapacityPerShift: 120,
      capacityUnit: "pcs",
    });
    expect(errorsOf(machineSchema, { ...base, efficiencyPercent: "0" })).toEqual({ efficiencyPercent: ["Efficiency must be a whole number between 1 and 150"] });
    expect(errorsOf(machineSchema, { ...base, efficiencyPercent: "151" })).toEqual({ efficiencyPercent: ["Efficiency must be a whole number between 1 and 150"] });
    expect(errorsOf(machineSchema, { ...base, efficiencyPercent: "99.5" })).toEqual({ efficiencyPercent: ["Efficiency must be a whole number between 1 and 150"] });
    expect(ok(machineSchema, { ...base, efficiencyPercent: "1" }).efficiencyPercent).toBe(1);
    expect(ok(machineSchema, { ...base, efficiencyPercent: "150" }).efficiencyPercent).toBe(150);
    expect(errorsOf(machineSchema, { ...base, calendarId: "", status: "BROKEN" })).toEqual({
      calendarId: ["Select a shift calendar"],
      status: ["Select a status"],
    });
  });

  it("downtimeSchema parses ISO instants and requires endsAt > startsAt", () => {
    const d = ok(downtimeSchema, {
      machineId: "m1",
      startsAt: "2026-09-07T02:30:00.000Z",
      endsAt: "2026-09-07T06:30:00.000Z",
      type: "maintenance",
      reason: " Oil change ",
    });
    expect(d.startsAt).toBeInstanceOf(Date);
    expect(d.startsAt.toISOString()).toBe("2026-09-07T02:30:00.000Z");
    expect(d.endsAt.toISOString()).toBe("2026-09-07T06:30:00.000Z");
    expect(d.type).toBe("MAINTENANCE");
    expect(d.reason).toBe("Oil change");
    // Offsets and Date instances are accepted too.
    expect(ok(downtimeSchema, { machineId: "m1", startsAt: "2026-09-07T08:00:00+05:30", endsAt: new Date("2026-09-07T04:00:00.000Z"), type: "OTHER" }).startsAt.toISOString()).toBe(
      "2026-09-07T02:30:00.000Z",
    );
    expect(errorsOf(downtimeSchema, { machineId: "m1", startsAt: "2026-09-07T06:30:00.000Z", endsAt: "2026-09-07T06:30:00.000Z", type: "BREAKDOWN" })).toEqual({
      endsAt: ["End must be after start"],
    });
    expect(errorsOf(downtimeSchema, { machineId: "m1", startsAt: "2026-09-07T06:30:00.000Z", endsAt: "2026-09-07T05:30:00.000Z", type: "BREAKDOWN" })).toEqual({
      endsAt: ["End must be after start"],
    });
    expect(errorsOf(downtimeSchema, { machineId: "m1", startsAt: "yesterday", endsAt: "", type: "" })).toEqual({
      startsAt: ["Start must be a valid date and time"],
      endsAt: ["End must be a valid date and time"],
      type: ["Select a downtime type"],
    });
  });
});

describe("calendars", () => {
  it("calendarSchema", () => {
    expect(ok(calendarSchema, { name: " Two shifts " })).toEqual({ name: "Two shifts", isActive: undefined });
    expect(errorsOf(calendarSchema, { name: "" })).toEqual({ name: ["Calendar name is required"] });
  });

  it("daysOfWeekField accepts repeated keys, comma lists and numbers", () => {
    expect(ok(daysOfWeekField, ["1", "2", "3"])).toEqual([1, 2, 3]);
    expect(ok(daysOfWeekField, "6,1,1,0")).toEqual([0, 1, 6]);
    expect(ok(daysOfWeekField, [1, 2])).toEqual([1, 2]);
    expect(ok(daysOfWeekField, "3")).toEqual([3]);
    expect(errorsOf(daysOfWeekField, undefined)).toEqual({ _form: ["Select at least one day"] });
    expect(errorsOf(daysOfWeekField, "")).toEqual({ _form: ["Select at least one day"] });
    expect(errorsOf(daysOfWeekField, ["7"])).toBeTruthy();
    expect(errorsOf(daysOfWeekField, ["mon"])).toBeTruthy();
  });

  it("shiftSchema validates HH:MM, days, break and net minutes", () => {
    const good = { calendarId: "cal1", name: "Night", startTime: "22:00", endTime: "06:00", daysOfWeek: ["1", "2"], breakMinutes: "60" };
    expect(ok(shiftSchema, good)).toEqual({ ...good, daysOfWeek: [1, 2], breakMinutes: 60 });
    expect(ok(shiftSchema, { ...good, calendarId: "", breakMinutes: "" })).toMatchObject({ calendarId: undefined, breakMinutes: 0 });
    expect(errorsOf(shiftSchema, { ...good, startTime: "9:00", endTime: "17:60" })).toEqual({
      startTime: ["Start time must be in HH:MM format"],
      endTime: ["End time must be in HH:MM format"],
    });
    expect(errorsOf(shiftSchema, { ...good, daysOfWeek: [] })).toEqual({ daysOfWeek: ["Select at least one day"] });
    expect(errorsOf(shiftSchema, { ...good, startTime: "09:00", endTime: "17:00", breakMinutes: "480" })).toEqual({
      breakMinutes: ["Break must be shorter than the shift so net working time is greater than 0"],
    });
    expect(errorsOf(shiftSchema, { ...good, breakMinutes: "-1" })).toEqual({ breakMinutes: ["Break minutes must be at least 0"] });
    expect(errorsOf(shiftSchema, { ...good, name: "" })).toEqual({ name: ["Shift name is required"] });
  });

  it("calendarExceptionSchema", () => {
    expect(ok(calendarExceptionSchema, { calendarId: "cal1", date: " 2026-10-20 ", isWorking: "false", note: "Diwali" })).toEqual({
      calendarId: "cal1",
      date: "2026-10-20",
      isWorking: false,
      note: "Diwali",
    });
    const working = ok(calendarExceptionSchema, { date: "2026-09-06", isWorking: "working" });
    expect(working.isWorking).toBe(true);
    expect(working.note).toBeUndefined();
    expect(errorsOf(calendarExceptionSchema, { date: "2026-02-30", isWorking: "" })).toEqual({
      date: ["Date must be a valid date (YYYY-MM-DD)"],
      isWorking: ["Choose Working or Non-working"],
    });
    expect(errorsOf(calendarExceptionSchema, { date: "20/10/2026", isWorking: "true" })).toEqual({ date: ["Date must be a valid date (YYYY-MM-DD)"] });
  });
});

describe("orders", () => {
  const TODAY = "2026-09-05";
  const good = {
    customer: "cust_1",
    customerPoRef: "PO-4471",
    productId: "prod_1",
    quantity: "250",
    dueDate: "2026-10-15",
    earliestStartDate: "2026-10-01",
    priority: "high",
    orderNumber: "",
    notes: "",
  };

  it("customerRefSchema distinguishes existing ids from `new:` names", () => {
    expect(ok(customerRefSchema, "cust_1")).toEqual({ id: "cust_1" });
    expect(ok(customerRefSchema, "new:  Bharat   Motors ")).toEqual({ create: "Bharat Motors" });
    expect(errorsOf(customerRefSchema, "")).toEqual({ _form: ["Select or create a customer"] });
    expect(errorsOf(customerRefSchema, "new:   ")).toEqual({ _form: ["Customer name must be 1–120 characters"] });
    expect(errorsOf(customerRefSchema, `new:${"x".repeat(121)}`)).toEqual({ _form: ["Customer name must be 1–120 characters"] });
    expect(errorsOf(customerRefSchema, undefined)).toEqual({ _form: ["Select or create a customer"] });
  });

  it("createOrderSchema happy path", () => {
    expect(ok(createOrderSchema(TODAY), good)).toEqual({
      customer: { id: "cust_1" },
      customerPoRef: "PO-4471",
      productId: "prod_1",
      quantity: 250,
      dueDate: "2026-10-15",
      earliestStartDate: "2026-10-01",
      priority: "HIGH",
      orderNumber: undefined,
      notes: undefined,
    });
    expect(ok(createOrderSchema(TODAY), { ...good, priority: "", orderNumber: " cust/001 ", earliestStartDate: "", notes: "line 1\nline 2" })).toMatchObject({
      priority: "NORMAL",
      orderNumber: "CUST/001",
      earliestStartDate: undefined,
      notes: "line 1\nline 2",
    });
    expect(ok(createOrderSchema(TODAY), { ...good, dueDate: TODAY, earliestStartDate: TODAY }).dueDate).toBe(TODAY);
  });

  it("createOrderSchema sad paths", () => {
    expect(errorsOf(createOrderSchema(TODAY), { ...good, dueDate: "2026-09-04", earliestStartDate: "" })).toEqual({
      dueDate: ["Due date cannot be in the past"],
    });
    // Both refinements report independently.
    expect(errorsOf(createOrderSchema(TODAY), { ...good, dueDate: "2026-09-04" })).toEqual({
      dueDate: ["Due date cannot be in the past"],
      earliestStartDate: ["Start date must be on or before the due date"],
    });
    expect(errorsOf(createOrderSchema(TODAY), { ...good, earliestStartDate: "2026-10-16" })).toEqual({
      earliestStartDate: ["Start date must be on or before the due date"],
    });
    expect(errorsOf(createOrderSchema(TODAY), { ...good, quantity: "0" })).toEqual({ quantity: ["Enter a quantity greater than 0"] });
    expect(errorsOf(createOrderSchema(TODAY), { ...good, quantity: "1.2345" })).toEqual({ quantity: ["Quantity can have at most 3 decimal places"] });
    expect(errorsOf(createOrderSchema(TODAY), { ...good, dueDate: "15/10/2026" })).toEqual({ dueDate: ["Due date must be a valid date (YYYY-MM-DD)"] });
    expect(errorsOf(createOrderSchema(TODAY), { ...good, productId: "" })).toEqual({ productId: ["Select a product"] });
    expect(errorsOf(createOrderSchema(TODAY), { ...good, customer: "" })).toEqual({ customer: ["Select or create a customer"] });
    expect(errorsOf(createOrderSchema(TODAY), { ...good, priority: "ASAP" })).toEqual({ priority: ["Select a priority"] });
    expect(errorsOf(createOrderSchema(TODAY), { ...good, orderNumber: "SO-000123" })).toEqual({
      orderNumber: ["Numbers like SO-000123 are reserved for automatic numbering — choose a different order number"],
    });
    expect(errorsOf(createOrderSchema(TODAY), { ...good, orderNumber: "A B" })).toEqual({
      orderNumber: ["Order number must be 3–32 characters using letters, digits and . _ / -"],
    });
    expect(errorsOf(createOrderSchema(TODAY), { ...good, customerPoRef: "x".repeat(65) })).toEqual({
      customerPoRef: ["Customer PO ref must be at most 64 characters"],
    });
  });

  it("editOrderSchema allows past due dates but keeps start ≤ due", () => {
    expect(ok(editOrderSchema, { ...good, orderId: "o1", dueDate: "2020-01-01", earliestStartDate: "2019-12-01" }).dueDate).toBe("2020-01-01");
    expect(errorsOf(editOrderSchema, { ...good, orderId: "o1", earliestStartDate: "2026-12-01" })).toEqual({
      earliestStartDate: ["Start date must be on or before the due date"],
    });
    expect(errorsOf(editOrderSchema, { ...good })).toEqual({ orderId: ["Select a order"] });
    expect(ok(editOrderNotesSchema, { orderId: "o1", notes: " keep " })).toEqual({ orderId: "o1", notes: "keep" });
  });

  it("statusChangeSchema requires a reason for ON_HOLD only", () => {
    expect(ok(statusChangeSchema, { orderId: "o1", status: "in_progress" })).toEqual({ orderId: "o1", status: "IN_PROGRESS", reason: undefined });
    expect(ok(statusChangeSchema, { orderId: "o1", status: "ON_HOLD", reason: "Waiting for material" }).reason).toBe("Waiting for material");
    expect(ok(statusChangeSchema, { orderId: "o1", status: "CANCELLED", reason: "" }).reason).toBeUndefined();
    expect(errorsOf(statusChangeSchema, { orderId: "o1", status: "ON_HOLD", reason: "   " })).toEqual({
      reason: ["Give a reason for putting the order on hold"],
    });
    expect(errorsOf(statusChangeSchema, { orderId: "o1", status: "DONE" })).toEqual({ status: ["Select a status"] });
  });
});

describe("import rows", () => {
  const ctx = {
    today: "2026-09-05",
    existingOrderNumbers: new Set(["SO-000001", "CUST-1"]),
    fileOrderNumbers: new Set(["DUP-1"]),
    activeSkus: new Map([
      ["hb-200", "prod_hb"],
      ["gx-40", "prod_gx"],
    ]),
    existingCustomers: new Set(["bharat motors"]),
  };
  const row = {
    order_number: "",
    customer: " Bharat  Motors ",
    product_sku: " hb-200 ",
    quantity: "250",
    priority: "",
    due_date: "2026-10-15",
    earliest_start_date: "",
    customer_po_ref: "PO-1",
    notes: "",
  };

  it("importRowSchema parses and normalises a row", () => {
    expect(ok(importRowSchema, row)).toEqual({
      order_number: undefined,
      customer: "Bharat Motors",
      product_sku: "hb-200",
      quantity: 250,
      priority: "NORMAL",
      due_date: "2026-10-15",
      earliest_start_date: undefined,
      customer_po_ref: "PO-1",
      notes: undefined,
    });
    expect(ok(importRowSchema, { ...row, order_number: " cust/2 ", priority: "urgent ", quantity: "12.500", notes: "a\nb" })).toMatchObject({
      order_number: "CUST/2",
      priority: "URGENT",
      quantity: 12.5,
      notes: "a\nb",
    });
  });

  it("importRowSchema rejects bad cells with plain messages", () => {
    const msgs = (input: unknown) => {
      const r = importRowSchema.safeParse(input);
      return r.success ? [] : r.error.issues.map((i) => i.message);
    };
    expect(msgs({ ...row, customer: "" })).toEqual(["customer is required"]);
    expect(msgs({ ...row, product_sku: "" })).toEqual(["product_sku is required"]);
    expect(msgs({ ...row, quantity: "0" })).toContain("quantity must be a plain number greater than 0 with at most 3 decimals (e.g. 12.5)");
    expect(msgs({ ...row, quantity: "1e3" })).toHaveLength(1);
    expect(msgs({ ...row, quantity: "12.3456" })).toHaveLength(1);
    expect(msgs({ ...row, quantity: "-5" })).toHaveLength(1);
    expect(msgs({ ...row, quantity: "1,000" })).toHaveLength(1);
    expect(msgs({ ...row, quantity: "" })).toHaveLength(1);
    expect(msgs({ ...row, priority: "asap" })).toEqual(["priority must be one of LOW, NORMAL, HIGH, URGENT"]);
    expect(msgs({ ...row, due_date: "15/10/2026" })).toEqual(["due_date must be a valid date in YYYY-MM-DD format"]);
    expect(msgs({ ...row, due_date: "" })).toEqual(["due_date must be a valid date in YYYY-MM-DD format"]);
    expect(msgs({ ...row, earliest_start_date: "2026-02-30" })).toEqual(["earliest_start_date must be a valid date in YYYY-MM-DD format"]);
    expect(msgs({ ...row, order_number: "SO-000009" })).toEqual([
      "Numbers like SO-000123 are reserved for automatic numbering — choose a different order number",
    ]);
    expect(msgs({ ...row, order_number: "A B" })).toEqual(["Order number must be 3–32 characters using letters, digits and . _ / -"]);
    expect(msgs({ ...row, customer_po_ref: "x".repeat(65) })).toEqual(["customer_po_ref must be at most 64 characters"]);
    expect(msgs({ ...row, notes: "x".repeat(2001) })).toEqual(["notes must be at most 2000 characters"]);
    expect(msgs({ ...row, customer: "Bad\u0001Name" })).toEqual(["customer contains invalid characters"]);
    expect(msgs({ ...row, notes: "tab\tno" })).toEqual(["notes contains invalid characters"]);
    expect(msgs({ ...row, customer: "x".repeat(121) })).toEqual(["customer must be at most 120 characters"]);
  });

  it("validateImportRow: happy path resolves the product and flags existing customers", () => {
    const r = validateImportRow(row, ctx);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.values).toEqual({
      orderNumber: undefined,
      customerName: "Bharat Motors",
      productSku: "hb-200",
      productId: "prod_hb",
      quantity: 250,
      priority: "NORMAL",
      dueDate: "2026-10-15",
      earliestStartDate: undefined,
      customerPoRef: "PO-1",
      notes: undefined,
      isNewCustomer: false,
    });
    expect(validateImportRow({ ...row, customer: "New Co" }, ctx).values?.isNewCustomer).toBe(true);
    const { existingCustomers: _omit, ...noCustomers } = ctx;
    void _omit;
    expect(validateImportRow(row, noCustomers).values?.isNewCustomer).toBeNull();
  });

  it("validateImportRow: errors from schema, unknown/inactive SKU, duplicates, date order", () => {
    expect(validateImportRow({ ...row, product_sku: "ZZ-1" }, ctx)).toMatchObject({
      ok: false,
      values: null,
      errors: ['product_sku "ZZ-1" does not match an active product'],
    });
    expect(validateImportRow({ ...row, order_number: "cust-1" }, ctx).errors).toEqual(["order_number CUST-1 already exists"]);
    expect(validateImportRow({ ...row, order_number: "so-000001" }, ctx).errors).toEqual([
      "Numbers like SO-000123 are reserved for automatic numbering — choose a different order number",
    ]);
    expect(validateImportRow({ ...row, order_number: "dup-1" }, ctx).errors).toEqual(["order_number DUP-1 is used by another row in this file"]);
    expect(validateImportRow({ ...row, earliest_start_date: "2026-10-16" }, ctx).errors).toEqual([
      "earliest_start_date must be on or before due_date",
    ]);
    const multi = validateImportRow({ ...row, quantity: "abc", due_date: "bad", product_sku: "nope" }, ctx);
    expect(multi.ok).toBe(false);
    expect(multi.errors).toHaveLength(2); // schema issues only; the SKU is not checked until the schema passes
  });

  it("validateImportRow: a past due date is a warning, not an error", () => {
    const r = validateImportRow({ ...row, due_date: "2026-09-04" }, ctx);
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual([PAST_DUE_WARNING]);
    expect(validateImportRow({ ...row, due_date: "2026-09-05" }, ctx).warnings).toEqual([]);
    // Warnings are still reported alongside errors.
    const both = validateImportRow({ ...row, due_date: "2026-09-04", product_sku: "nope" }, ctx);
    expect(both.ok).toBe(false);
    expect(both.warnings).toEqual([PAST_DUE_WARNING]);
  });

  it("validateImportRow does not mutate the context", () => {
    const before = [...ctx.fileOrderNumbers];
    validateImportRow({ ...row, order_number: "NEW-1" }, ctx);
    expect([...ctx.fileOrderNumbers]).toEqual(before);
  });

  it("validateImportRows flags duplicates on every row and numbers rows from 1", () => {
    const { fileOrderNumbers: _unused, ...fileCtx } = ctx;
    void _unused;
    const results = validateImportRows(
      [
        { ...row, order_number: "A-1" },
        { ...row, order_number: "a-1", customer: "Other Co" },
        { ...row, order_number: "B-2", due_date: "2026-01-01" },
        { ...row, product_sku: "nope" },
      ],
      fileCtx,
    );
    expect(results.map((r) => r.rowNumber)).toEqual([1, 2, 3, 4]);
    expect(results[0].ok).toBe(false);
    expect(results[0].errors).toEqual(["order_number A-1 is used by another row in this file"]);
    expect(results[1].errors).toEqual(["order_number A-1 is used by another row in this file"]);
    expect(results[2].ok).toBe(true);
    expect(results[2].warnings).toEqual([PAST_DUE_WARNING]);
    expect(results[3].ok).toBe(false);
    expect(summarizeImport(results)).toEqual({ total: 4, valid: 1, withErrors: 3, withWarnings: 1, newCustomers: 0 });

    const twoNew = validateImportRows([{ ...row, customer: "New Co" }, { ...row, customer: "new co" }, { ...row, customer: "Another" }], fileCtx);
    expect(summarizeImport(twoNew).newCustomers).toBe(2);
  });

  it("checkImportHeaders and the template examples", () => {
    expect(checkImportHeaders(["customer", "product_sku", "quantity", "due_date"])).toEqual({ missing: [], unknown: [], ok: true });
    expect(checkImportHeaders(["customer", "sku", "qty"])).toEqual({
      missing: ["product_sku", "quantity", "due_date"],
      unknown: ["sku", "qty"],
      ok: false,
    });
    for (const example of IMPORT_TEMPLATE_EXAMPLES) {
      expect(importRowSchema.safeParse(example).success).toBe(true);
    }
  });
});
