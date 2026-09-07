/** Auth forms (docs/M1_SPEC.md §3): signup, login, change password, profile name. */
import { z } from "zod";
import { emailField, passwordEqualsEmail, passwordField, text, timezoneField } from "./common";

export const PASSWORD_EMAIL_MESSAGE = "Password must not be the same as your email";

export const signupSchema = z
  .object({
    companyName: text("Company name", { min: 2, max: 120 }),
    timezone: timezoneField,
    name: text("Your name", { max: 120 }),
    email: emailField,
    password: passwordField,
  })
  .refine((d) => !passwordEqualsEmail(d.password, d.email), { error: PASSWORD_EMAIL_MESSAGE, path: ["password"] });

export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: emailField,
  password: z
    .string({ error: "Enter your password" })
    .min(1, { error: "Enter your password" })
    .max(72, { error: "Password must be at most 72 characters" }),
  next: z.string().max(512).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Change own password. The action must additionally reject a new password equal to the actor's email
 * (`passwordEqualsEmail(newPassword, session.user.email)` → PASSWORD_EMAIL_MESSAGE) since the email is not on the form.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string({ error: "Enter your current password" })
      .min(1, { error: "Enter your current password" })
      .max(72, { error: "Password must be at most 72 characters" }),
    newPassword: passwordField,
    confirmPassword: z.string().max(72).optional(),
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    error: "New password must be different from the current password",
    path: ["newPassword"],
  })
  .refine((d) => d.confirmPassword === undefined || d.confirmPassword === "" || d.confirmPassword === d.newPassword, {
    error: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const profileNameSchema = z.object({
  name: text("Name", { max: 120 }),
});

export type ProfileNameInput = z.infer<typeof profileNameSchema>;

export { passwordEqualsEmail };
