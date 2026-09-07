/**
 * Application error hierarchy (docs/M1_SPEC.md §3, §8).
 *
 * - `AppError`      base class: machine-readable `code` + HTTP-ish `status`.
 * - `ForbiddenError` thrown by `requirePermission()`; pages surface it via `forbidden()`, Server Actions
 *                    (through `withAction`) turn it into `{ ok: false, error: "forbidden" }`.
 * - `NotFoundError`  a row the caller asked for does not exist inside the tenant.
 * - `DomainError`    a business-rule violation whose `message` is safe to show to the user verbatim
 *                    (e.g. StockWouldGoNegative, LastAdminError, InvalidTransition extend it).
 */
export class AppError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to do that.") {
    super(message, "forbidden", 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found.") {
    super(message, "not_found", 404);
  }
}

/** A user-facing business-rule violation. `message` is shown to the user as-is. */
export class DomainError extends AppError {
  constructor(message: string, code = "domain", status = 422) {
    super(message, code, status);
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
