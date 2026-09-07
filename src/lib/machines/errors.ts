/**
 * Business-rule errors for the machines / work-centers / calendars modules. All extend `DomainError`, so
 * `withAction()` turns them into `{ ok: false, error: message }`; the module actions map `FieldRuleError` to a
 * field-level error and `DowntimeOverlapError` to the non-blocking "Save anyway" warning.
 */
import { DomainError } from "@/lib/errors";

/** A rule violation that belongs to one form field (e.g. "Select an active work center" on `workCenterId`). */
export class FieldRuleError extends DomainError {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message, "field_rule", 422);
    this.field = field;
  }
}

/** A master-data row that is still referenced (NoAction FK) and therefore cannot be hard-deleted. */
export class InUseError extends DomainError {
  constructor(message: string) {
    super(message, "in_use", 409);
  }
}

/** Thrown when a downtime window overlaps existing ones and the caller did not pass `confirmOverlap`. */
export class DowntimeOverlapError extends DomainError {
  /** Human-readable descriptions of the overlapping windows ("Maintenance 10 Sep 08:00–12:00"). */
  readonly overlaps: readonly string[];

  constructor(overlaps: readonly string[]) {
    super(`Overlaps with ${overlaps.join(", ")}`, "downtime_overlap", 409);
    this.overlaps = overlaps;
  }
}

/** One or more shift-set validation messages from `validateShifts()` (overlap, net minutes, days…). */
export class ShiftValidationError extends DomainError {
  readonly messages: readonly string[];

  constructor(messages: readonly string[]) {
    super(messages[0] ?? "Invalid shift", "shift_validation", 422);
    this.messages = messages;
  }
}

/** A calendar must keep at least one shift. */
export class LastShiftError extends DomainError {
  constructor() {
    super("A calendar must keep at least one shift. Add another shift before removing this one.", "last_shift", 409);
  }
}
