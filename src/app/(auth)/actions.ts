"use server";

import { headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import type { Role } from "@/generated/prisma/enums";
import { fail, fieldError, parseForm, withAction, type ActionState } from "@/lib/action";
import { safeNext } from "@/lib/auth/guards";
import { authenticate } from "@/lib/auth/login";
import { loginSchema, signupSchema } from "@/lib/auth/schemas";
import { clearSessionCookie, createSession, reissueSessionFor } from "@/lib/auth/session";
import { EmailTakenError, signupTenant } from "@/lib/auth/signup";
import {
  checkDemoRateLimit,
  DEMO_EMAIL_REJECTED_MESSAGE,
  demoSignIn,
  isDemoEmail,
  isDemoRole,
  resetDemoPlantIfStale,
} from "@/lib/demo/demo-plant";
import { logger } from "@/lib/logger";
import { clientIp, hit, RATE_LIMITS, signupIpKey, tooManyAttemptsMessage } from "@/lib/rate-limit";

export const loginAction = withAction<never>(async (formData: FormData): Promise<ActionState<never>> => {
  const input = parseForm(loginSchema, formData);
  if (isDemoEmail(input.email)) return fail(DEMO_EMAIL_REJECTED_MESSAGE);
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
  if (isDemoEmail(input.email)) return fieldError("email", DEMO_EMAIL_REJECTED_MESSAGE);
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

/**
 * One-click demo profile (docs/M1_SPEC.md §6.9). Plain form action — usable as
 * `<form action={demoLoginAction.bind(null, "ADMIN")}>` from the login page, the signup page and the landing page.
 * Rate-limited per network (`demo:ip:<ip>`, 30 / 60 min), refreshes the plant when it is older than a day, creates
 * it on first use, writes the LOGIN audit row "Demo sign-in (<role>)", sets the cookie and lands on /dashboard.
 * Failures never surface a stack trace: they redirect back to /login with a `reason` the page renders as a banner.
 */
export async function demoLoginAction(role: Role): Promise<never> {
  if (!isDemoRole(role)) redirect("/login");
  const h = await headers();
  const ip = clientIp(h);

  const limit = await checkDemoRateLimit(ip);
  if (limit.limited) redirect("/login?reason=demo-limited");

  try {
    await resetDemoPlantIfStale();
    const { user, tenant } = await demoSignIn(role, { ip, userAgent: h.get("user-agent") });
    await reissueSessionFor({ id: user.id, tenantId: tenant.id, role: user.role });
  } catch (err) {
    unstable_rethrow(err);
    logger.error("demo sign-in failed", err);
    redirect("/login?reason=demo-unavailable");
  }
  redirect("/dashboard");
}
