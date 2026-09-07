/** User management (docs/M1_SPEC.md §3 "Users"): invite, edit, reset password, deactivate/reactivate. */
import { z } from "zod";
import { Role } from "@/generated/prisma/enums";
import { checkbox, emailField, emptyToUndefined, enumField, idField, passwordField, text } from "./common";

export const roleField = enumField(Role, "Select a role");

/** Temporary password is optional: when blank the server generates one (shown once). */
const temporaryPasswordField = z.preprocess(emptyToUndefined, passwordField.optional());

export const inviteUserSchema = z.object({
  name: text("Name", { max: 120 }),
  email: emailField,
  role: roleField,
  temporaryPassword: temporaryPasswordField,
});

export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const editUserSchema = z.object({
  userId: idField("user"),
  name: text("Name", { max: 120 }),
  role: roleField,
});

export type EditUserInput = z.infer<typeof editUserSchema>;

export const resetPasswordSchema = z.object({
  userId: idField("user"),
  temporaryPassword: temporaryPasswordField,
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const setUserActiveSchema = z.object({
  userId: idField("user"),
  isActive: checkbox(),
});

export type SetUserActiveInput = z.infer<typeof setUserActiveSchema>;
