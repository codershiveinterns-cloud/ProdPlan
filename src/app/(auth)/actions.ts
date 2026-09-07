"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { fail, fieldError, parseForm, withAction, type ActionState } from "@/lib/action";
import { safeNext } from "@/lib/auth/guards";
import { authenticate } from "@/lib/auth/login";
import { loginSchema, signupSchema } from "@/lib/auth/schemas";
import { clearSessionCookie, createSession } from "@/lib/auth/session";
import { EmailTakenError, signupTenant } from "@/lib/auth/signup";
import { clientIp, hit, RATE_LIMITS, signupIpKey, tooManyAttemptsMessage } from "@/lib/rate-limit";

export const loginAction = withAction<never>(async (formData: FormData): Promise<ActionState<never>> => {
  const input = parseForm(loginSchema, formData);
  const h = await headers();
  const outcome = await authenticate(
    { email: input.email, password: input.password },
    { ip: clientIp(h), userAgent: h.get("user-agent") },
  );
  if (!outcome.ok) return fail(outcome.error);

  await createSession({
    userId: outcome.user.id,
    tenantId: outcome.tenant.id,
    role: outcome.user.role,
    tokenVersion: outcome.tokenVersion,
  });
  redirect(outcome.user.mustChangePassword ? "/settings/profile?force=1" : safeNext(input.next));
});

export const signupAction = withAction<never>(async (formData: FormData): Promise<ActionState<never>> => {
  const input = parseForm(signupSchema, formData);
  const h = await headers();
  const ip = clientIp(h);

  const limit = await hit(signupIpKey(ip), RATE_LIMITS.signupIp.limit, RATE_LIMITS.signupIp.windowSec);
  if (limit.limited) return fail(`Too many signups from this network. ${tooManyAttemptsMessage(limit)}`);

  let result;
  try {
    result = await signupTenant(input, { ip, userAgent: h.get("user-agent") });
  } catch (err) {
    if (err instanceof EmailTakenError) return fieldError("email", err.message);
    throw err;
  }

  await createSession({
    userId: result.user.id,
    tenantId: result.tenant.id,
    role: result.user.role,
    tokenVersion: result.tokenVersion,
  });
  redirect("/dashboard");
});

/** User-menu "Sign out": clears the cookie and lands on /login. Idempotent. */
export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/login?reason=signed-out");
}
