/** Pure "Used by …" helpers (safe for Client Components: no database or request imports). */

export type WorkCenterUsage = { machines: number; operations: number };

/** "Used by 3 machines / 2 routing steps" (only the non-zero parts; "" when unused). */
export function describeUsage(usage: WorkCenterUsage): string {
  const parts: string[] = [];
  if (usage.machines > 0) parts.push(`${usage.machines} ${usage.machines === 1 ? "machine" : "machines"}`);
  if (usage.operations > 0) parts.push(`${usage.operations} routing ${usage.operations === 1 ? "step" : "steps"}`);
  return parts.length ? `Used by ${parts.join(" / ")}` : "";
}
