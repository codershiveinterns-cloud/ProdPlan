/**
 * Helpers to raise field-level validation failures from business code. `withAction()` maps a thrown `ZodError` to
 * `{ ok: false, fieldErrors }`, so a server-side check ("Order X already exists") lands under the right input.
 */
import { z } from "zod";

/** Throws a ZodError carrying one custom issue at `path`. */
export function fieldIssue(path: string, message: string): never {
  throw new z.ZodError([{ code: "custom", path: [path], message, input: undefined }]);
}

/** Builds a ZodError from several (path, message) pairs. */
export function fieldIssues(issues: ReadonlyArray<{ path: string; message: string }>): z.ZodError {
  return new z.ZodError(issues.map((i) => ({ code: "custom" as const, path: [i.path], message: i.message, input: undefined })));
}
