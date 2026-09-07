/** User-management business-rule errors (docs/M1_SPEC.md §3). Messages are user-facing (DomainError). */
import { DomainError } from "@/lib/errors";
import { PASSWORD_EMAIL_MESSAGE } from "@/lib/validation/auth";

export const LAST_ADMIN_MESSAGE = "At least one active admin must remain. Make another user an Admin first.";
export const SELF_DEACTIVATION_MESSAGE = "You cannot deactivate your own account. Ask another admin to do it.";
export const SELF_RESET_MESSAGE = "Use your Profile page to change your own password.";
export const CURRENT_PASSWORD_MESSAGE = "Current password is incorrect";

/** Thrown (and rolled back) when a mutation would leave the tenant without an active ADMIN. */
export class LastAdminError extends DomainError {
  constructor() {
    super(LAST_ADMIN_MESSAGE, "last_admin", 409);
  }
}

export class SelfDeactivationError extends DomainError {
  constructor() {
    super(SELF_DEACTIVATION_MESSAGE, "self_deactivation", 422);
  }
}

export class SelfPasswordResetError extends DomainError {
  constructor() {
    super(SELF_RESET_MESSAGE, "self_password_reset", 422);
  }
}

/** The (temporary or new) password equals the user's email — rejected by policy. */
export class PasswordEqualsEmailError extends DomainError {
  constructor() {
    super(PASSWORD_EMAIL_MESSAGE, "password_equals_email", 422);
  }
}

/** Profile "change password": the current password did not verify. */
export class CurrentPasswordError extends DomainError {
  constructor() {
    super(CURRENT_PASSWORD_MESSAGE, "current_password", 422);
  }
}
