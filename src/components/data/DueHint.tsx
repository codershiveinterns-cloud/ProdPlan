import { cn } from "@/lib/utils";

export type DueTone = "overdue" | "soon" | "upcoming" | "later";

export type DueHintResult = {
  /** Text to show: "Overdue 3d", "Due today", "Due tomorrow", "Due in 5d", or the formatted date. */
  label: string;
  tone: DueTone;
  /** Signed difference in days (negative = overdue). */
  days: number;
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseIsoDate(iso: string): number | null {
  const match = ISO_DATE.exec(iso);
  if (!match) return null;
  const [, y, m, d] = match;
  return Date.UTC(Number(y), Number(m) - 1, Number(d));
}

/** Pure `YYYY-MM-DD` → `05 Sep 2026`. Falls back to the input when it is not an ISO date. */
export function formatIsoDateLabel(iso: string): string {
  const match = ISO_DATE.exec(iso);
  if (!match) return iso;
  const [, y, m, d] = match;
  const month = MONTHS[Number(m) - 1];
  return month ? `${d} ${month} ${y}` : iso;
}

/**
 * Due-date hint per docs/M1_SPEC.md §5 "Colour semantics". Both arguments are `YYYY-MM-DD` strings; `today`
 * MUST come from `todayInTz(tenant.timezone)` so the calculation is timezone-correct and pure.
 */
export function dueHint(dueDate: string, today: string): DueHintResult {
  const due = parseIsoDate(dueDate);
  const now = parseIsoDate(today);
  if (due === null || now === null) {
    return { label: formatIsoDateLabel(dueDate), tone: "later", days: 0 };
  }
  const days = Math.round((due - now) / 86_400_000);
  if (days < 0) return { label: `Overdue ${-days}d`, tone: "overdue", days };
  if (days === 0) return { label: "Due today", tone: "soon", days };
  if (days === 1) return { label: "Due tomorrow", tone: "soon", days };
  if (days <= 7) return { label: `Due in ${days}d`, tone: "upcoming", days };
  return { label: formatIsoDateLabel(dueDate), tone: "later", days };
}

const TONE_CLASS: Record<DueTone, string> = {
  overdue: "text-red-700 font-medium",
  soon: "text-amber-700 font-medium",
  upcoming: "text-foreground",
  later: "text-muted-foreground",
};

/** Inline due hint. Pure props (no clock access) so it renders identically on server and client. */
export function DueHint({ dueDate, today, className }: { dueDate: string; today: string; className?: string }) {
  const hint = dueHint(dueDate, today);
  return (
    <span className={cn("text-sm whitespace-nowrap", TONE_CLASS[hint.tone], className)} title={formatIsoDateLabel(dueDate)}>
      {hint.label}
    </span>
  );
}
