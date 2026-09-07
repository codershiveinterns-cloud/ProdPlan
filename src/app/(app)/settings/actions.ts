"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { fieldError, ok, parseForm, withAction, type ActionState } from "@/lib/action";
import { auditContext } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/guards";
import { reissueSessionFor } from "@/lib/auth/session";
import { EmailTakenError } from "@/lib/auth/signup";
import { CalendarNotFoundError, updateTenantSettings } from "@/lib/tenant/settings";
import { CurrentPasswordError, PasswordEqualsEmailError } from "@/lib/users/errors";
import { editUser, inviteUser, resetUserPassword, setUserActive } from "@/lib/users/manage";
import { changeOwnPassword, signOutEverywhere, updateOwnName } from "@/lib/users/profile";
import { changePasswordSchema, profileNameSchema } from "@/lib/validation/auth";
import { tenantSettingsSchema } from "@/lib/validation/tenant";
import { editUserSchema, inviteUserSchema, resetPasswordSchema, setUserActiveSchema } from "@/lib/validation/users";

const USERS_PATH = "/settings/users";
const PROFILE_PATH = "/settings/profile";
const TENANT_PATH = "/settings/tenant";

// ---------------------------------------------------------------------------------------------------------------
// Tenant (tenant:manage)
// ---------------------------------------------------------------------------------------------------------------

export const updateTenantSettingsAction = withAction(async (formData) => {
  const { session, db } = await requirePermission("tenant:manage");
  const input = parseForm(tenantSettingsSchema, formData);
  const ctx = await auditContext(session);
  try {
    await updateTenantSettings(db, session.user, ctx, input);
  } catch (err) {
    if (err instanceof CalendarNotFoundError) return fieldError("defaultCalendarId", err.message);
    throw err;
  }
  revalidatePath(TENANT_PATH);
  return ok(undefined, "Plant settings saved");
});

// ---------------------------------------------------------------------------------------------------------------
// Users (users:manage)
// ---------------------------------------------------------------------------------------------------------------

/** Returned ONCE to the inviting admin; the temporary password is never persisted or audited. */
export type TemporaryPasswordResult = { userId: string; name: string; email: string; temporaryPassword: string };

export const inviteUserAction = withAction<TemporaryPasswordResult>(async (formData) => {
  const { session, db } = await requirePermission("users:manage");
  const input = parseForm(inviteUserSchema, formData);
  const ctx = await auditContext(session);
  try {
    const { user, temporaryPassword } = await inviteUser(db, session.user, ctx, input);
    revalidatePath(USERS_PATH);
    return ok({ userId: user.id, name: user.name, email: user.email, temporaryPassword }, `Invited ${user.name}`);
  } catch (err) {
    if (err instanceof EmailTakenError) return fieldError("email", err.message);
    if (err instanceof PasswordEqualsEmailError) return fieldError("temporaryPassword", err.message);
    throw err;
  }
});

export const editUserAction = withAction(async (formData) => {
  const { session, db } = await requirePermission("users:manage");
  const input = parseForm(editUserSchema, formData);
  const ctx = await auditContext(session);
  const user = await editUser(db, session.user, ctx, input);
  if (user.id === session.user.id) {
    // Own role change bumped our tokenVersion: keep this session valid with the new role hint.
    await reissueSessionFor({ id: user.id, tenantId: user.tenantId, role: user.role });
  }
  revalidatePath(USERS_PATH);
  return ok(undefined, "User updated");
});

export const resetUserPasswordAction = withAction<TemporaryPasswordResult>(async (formData) => {
  const { session, db } = await requirePermission("users:manage");
  const input = parseForm(resetPasswordSchema, formData);
  const ctx = await auditContext(session);
  try {
    const { user, temporaryPassword } = await resetUserPassword(db, session.user, ctx, input);
    revalidatePath(USERS_PATH);
    return ok({ userId: user.id, name: user.name, email: user.email, temporaryPassword }, `Password reset for ${user.name}`);
  } catch (err) {
    if (err instanceof PasswordEqualsEmailError) return fieldError("temporaryPassword", err.message);
    throw err;
  }
});

const setUserActiveForm = withAction(async (formData) => {
  const { session, db } = await requirePermission("users:manage");
  const input = parseForm(setUserActiveSchema, formData);
  const ctx = await auditContext(session);
  const user = await setUserActive(db, session.user, ctx, input);
  revalidatePath(USERS_PATH);
  return ok(undefined, user.isActive ? `${user.name} reactivated` : `${user.name} deactivated`);
});

/** Bound from the row menu: `setUserActiveAction.bind(null, user.id, false)` → a ConfirmDialog action. */
export async function setUserActiveAction(userId: string, isActive: boolean): Promise<ActionState> {
  const formData = new FormData();
  formData.set("userId", userId);
  formData.set("isActive", isActive ? "true" : "false");
  return setUserActiveForm(null, formData);
}

// ---------------------------------------------------------------------------------------------------------------
// Profile (profile:self) — allowed while a password change is pending, this is where it happens.
// ---------------------------------------------------------------------------------------------------------------

export const updateProfileNameAction = withAction(async (formData) => {
  const { session, db } = await requirePermission("profile:self", { allowMustChangePassword: true });
  const input = parseForm(profileNameSchema, formData);
  const ctx = await auditContext(session);
  const user = await updateOwnName(db, session.user, ctx, input);
  await reissueSessionFor(user);
  revalidatePath(PROFILE_PATH);
  return ok(undefined, "Name updated");
});

export const changePasswordAction = withAction(async (formData) => {
  const { session, db } = await requirePermission("profile:self", { allowMustChangePassword: true });
  const input = parseForm(changePasswordSchema, formData);
  const ctx = await auditContext(session);
  try {
    const user = await changeOwnPassword(db, session.user, ctx, input);
    await reissueSessionFor(user);
  } catch (err) {
    if (err instanceof CurrentPasswordError) return fieldError("currentPassword", err.message);
    if (err instanceof PasswordEqualsEmailError) return fieldError("newPassword", err.message);
    throw err;
  }
  if (session.user.mustChangePassword) {
    // The forced change is done: continue to the app.
    redirect("/dashboard");
  }
  revalidatePath(PROFILE_PATH);
  return ok(undefined, "Password changed");
});

const signOutEverywhereForm = withAction(async () => {
  const { session, db } = await requirePermission("profile:self", { allowMustChangePassword: true });
  const ctx = await auditContext(session);
  const user = await signOutEverywhere(db, session.user, ctx);
  await reissueSessionFor(user);
  return ok(undefined, "Signed out everywhere else. This device stays signed in.");
});

/** Zero-argument variant for `ConfirmDialog`. */
export async function signOutEverywhereAction(): Promise<ActionState> {
  return signOutEverywhereForm(null, new FormData());
}
