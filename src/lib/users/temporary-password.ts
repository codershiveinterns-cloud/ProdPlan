/**
 * Temporary passwords for invites and admin resets (docs/M1_SPEC.md §3). Pure and dependency-free so the
 * "Generate" button in the dialogs can run the same generator in the browser (`crypto.getRandomValues` exists in
 * Node ≥ 19 and every browser). Never persisted or audited — shown exactly once.
 */

/** Unambiguous characters only (no 0/O, 1/l/I) so the password can be read out or typed from a note. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const GROUP = 4;
export const TEMPORARY_PASSWORD_GROUPS = 3;
/** 3 groups of 4 characters joined with "-" → 14 characters, comfortably inside the 8–72 policy. */
export const TEMPORARY_PASSWORD_LENGTH = TEMPORARY_PASSWORD_GROUPS * GROUP + (TEMPORARY_PASSWORD_GROUPS - 1);

function randomIndices(count: number): number[] {
  // Rejection sampling avoids modulo bias.
  const limit = 256 - (256 % ALPHABET.length);
  const out: number[] = [];
  const buffer = new Uint8Array(count * 2);
  while (out.length < count) {
    crypto.getRandomValues(buffer);
    for (const byte of buffer) {
      if (byte < limit) out.push(byte % ALPHABET.length);
      if (out.length === count) break;
    }
  }
  return out;
}

/** e.g. `Xk7m-Qp2z-Rt9v`. */
export function generateTemporaryPassword(groups: number = TEMPORARY_PASSWORD_GROUPS): string {
  const n = Math.max(2, Math.min(groups, 8));
  const indices = randomIndices(n * GROUP);
  const chunks: string[] = [];
  for (let g = 0; g < n; g++) {
    chunks.push(indices.slice(g * GROUP, (g + 1) * GROUP).map((i) => ALPHABET[i]).join(""));
  }
  return chunks.join("-");
}
