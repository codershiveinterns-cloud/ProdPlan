"use server";

import { redirect } from "next/navigation";

import type { Role } from "@/generated/prisma/enums";

/**
 * TEMPORARY stand-in for `demoLoginAction` from `src/app/(auth)/actions.ts` (docs/M1_SPEC.md §6.9), which is being
 * implemented in parallel. Until it lands, the landing page's "View demo" / "Explore the live demo" forms post
 * here and land on /login, where the demo profile cards live. Delete this file and point `_lib/demo.ts` at
 * `@/app/(auth)/actions` once the real action exists.
 */
export async function demoLoginAction(role: Role): Promise<void> {
  redirect(`/login?demo=${role.toLowerCase()}`);
}
