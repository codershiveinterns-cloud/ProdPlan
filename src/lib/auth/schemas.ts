/**
 * zod schemas for the auth forms (docs/M1_SPEC.md §3). Shared by the Server Actions and unit tests.
 */
import { z } from "zod";
import { emailSchema, passwordDiffersFromEmail, passwordNotEmailRefineOptions, passwordSchema } from "@/lib/auth/password";
import { isValidTimeZone } from "@/lib/auth/timezones";

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ error: "Enter your password" }).min(1, "Enter your password").max(1024),
  next: z.string().max(2048).optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const signupSchema = z
  .object({
    company: z
      .string({ error: "Enter your company name" })
      .trim()
      .min(2, "Enter your company name")
      .max(120, "Company name is too long"),
    timezone: z
      .string({ error: "Choose your plant timezone" })
      .trim()
      .refine(isValidTimeZone, "Choose a valid timezone"),
    name: z.string({ error: "Enter your name" }).trim().min(1, "Enter your name").max(120, "Name is too long"),
    email: emailSchema,
    password: passwordSchema,
  })
  .refine(passwordDiffersFromEmail, passwordNotEmailRefineOptions);
export type SignupInput = z.infer<typeof signupSchema>;
