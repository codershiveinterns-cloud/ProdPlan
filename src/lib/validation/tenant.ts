/** Tenant settings (docs/M1_SPEC.md §6.8): name, timezone, default calendar. */
import { z } from "zod";
import { optionalIdField, text, timezoneField } from "./common";

export const tenantSettingsSchema = z.object({
  name: text("Company name", { min: 2, max: 120 }),
  timezone: timezoneField,
  defaultCalendarId: optionalIdField("calendar"),
});

export type TenantSettingsInput = z.infer<typeof tenantSettingsSchema>;

/** "Set as default" on a calendar page. */
export const setDefaultCalendarSchema = z.object({
  calendarId: text("Calendar", { max: 64 }),
});

export type SetDefaultCalendarInput = z.infer<typeof setDefaultCalendarSchema>;
