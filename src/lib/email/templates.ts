/**
 * Email templates — docs/M3_SPEC.md §7. Plain HTML + text, inline styles only (email clients strip `<style>`
 * blocks/external CSS), reusing the app's brand tokens (teal-700 `#0f766e` primary, amber-400 `#fbbf24` highlight,
 * stone neutrals — docs/M3_SPEC.md §7 / src/app/globals.css "deep teal primary, amber brand highlight").
 *
 * Every function takes plain, already-formatted data (dates, order numbers, …) and returns `{ html, text }`. All
 * user-supplied strings (order notes, hold/cancel reasons, conflict messages) are HTML-escaped with `escapeHtml()`
 * before being interpolated into markup — see tests/unit/email-templates.test.ts for the XSS-escaping proof.
 *
 * `TEMPLATE_NAMES` is the closed set stored in `EmailMessage.template`; `renderTemplate()` dispatches on it so
 * `send.ts` stays a one-line call regardless of which event triggered the email.
 */
import type { ConflictType } from "@/generated/prisma/enums";

// ---------------------------------------------------------------------------------------------------------------
// Escaping
// ---------------------------------------------------------------------------------------------------------------

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escapes `&<>"'` — the minimal safe set for text interpolated into HTML markup (no attribute contexts used here). */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch);
}

// ---------------------------------------------------------------------------------------------------------------
// Shared layout
// ---------------------------------------------------------------------------------------------------------------

const TEAL = "#0f766e";
const AMBER = "#fbbf24";
const STONE_900 = "#1c1917";
const STONE_600 = "#57534e";
const STONE_200 = "#e7e5e4";
const STONE_50 = "#fafaf9";

type LayoutInput = {
  tenantName: string;
  preheader: string;
  heading: string;
  bodyHtml: string;
  cta: { label: string; href: string } | null;
};

function layoutHtml(input: LayoutInput): string {
  const cta = input.cta
    ? `<tr><td style="padding:24px 32px 4px;">
         <a href="${escapeHtml(input.cta.href)}"
            style="display:inline-block;background:${TEAL};color:#ffffff;text-decoration:none;font-weight:600;
                   font-size:14px;padding:10px 20px;border-radius:8px;">${escapeHtml(input.cta.label)}</a>
       </td></tr>`
    : "";
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:${STONE_50};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <span style="display:none;font-size:0;line-height:0;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(
      input.preheader,
    )}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${STONE_50};padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0"
                 style="background:#ffffff;border-radius:12px;border:1px solid ${STONE_200};overflow:hidden;">
            <tr>
              <td style="background:${TEAL};padding:16px 32px;">
                <span style="color:#ffffff;font-weight:700;font-size:15px;letter-spacing:.02em;">ProdPlan</span>
                <span style="color:${AMBER};font-weight:600;font-size:12px;margin-left:8px;">${escapeHtml(
                  input.tenantName,
                )}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 4px;">
                <h1 style="margin:0 0 12px;font-size:18px;color:${STONE_900};">${escapeHtml(input.heading)}</h1>
                <div style="font-size:14px;line-height:1.55;color:${STONE_600};">${input.bodyHtml}</div>
              </td>
            </tr>
            ${cta}
            <tr>
              <td style="padding:24px 32px 20px;border-top:1px solid ${STONE_200};margin-top:20px;">
                <p style="margin:16px 0 0;font-size:12px;color:${STONE_600};">
                  You are receiving this because your ProdPlan role is subscribed to production alerts for
                  ${escapeHtml(input.tenantName)}.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function textFooter(tenantName: string): string {
  return `\n\n—\nYou are receiving this because your ProdPlan role is subscribed to production alerts for ${tenantName}.`;
}

// ---------------------------------------------------------------------------------------------------------------
// schedule-run-finished — digest, once per run, top conflicts listed (folds the "new critical conflict" alert
// into this single email per docs/M3_SPEC.md §7's correction: no per-conflict fan-out)
// ---------------------------------------------------------------------------------------------------------------

export type ScheduleRunConflictLine = {
  /** e.g. "Machine overloaded: CNC-01" */
  title: string;
  /** Human sentence from the engine. */
  message: string;
};

/**
 * Display titles for conflict types, parallel to (but intentionally not imported from) the non-exported
 * `CONFLICT_TITLES` in `src/lib/notifications/events.ts` — that module is out of this engineer's owned paths
 * (docs/M3_SPEC.md §13 reserves it for Engineer A's `optimizationApplied` addition only). This is presentation
 * text for the digest email only, not the recipient-resolution logic the spec says to reuse rather than duplicate.
 */
const CONFLICT_TYPE_TITLES: Readonly<Record<ConflictType, string>> = {
  MACHINE_OVERLOAD: "Machine overloaded",
  MACHINE_UNAVAILABLE: "Machine unavailable",
  MATERIAL_SHORTAGE: "Material shortage",
  DEADLINE_AT_RISK: "Deadline at risk",
  DEADLINE_MISSED: "Deadline missed",
  NO_ROUTING: "No routing",
  NO_MACHINE: "No machine available",
  UNSCHEDULED: "Order unscheduled",
};

/** "Machine overloaded: CNC-01" (or just the type title when there is no subject label). */
export function conflictLineTitle(type: ConflictType, subjectLabel: string | null): string {
  return subjectLabel ? `${CONFLICT_TYPE_TITLES[type]}: ${subjectLabel}` : CONFLICT_TYPE_TITLES[type];
}

export type ScheduleRunFinishedData = {
  tenantName: string;
  orderCount: number;
  conflictCount: number;
  /** Top conflicts to list (already truncated by the caller, e.g. top 5). */
  conflicts: readonly ScheduleRunConflictLine[];
  scheduleUrl: string;
};

export function scheduleRunFinishedTemplate(data: ScheduleRunFinishedData): { html: string; text: string } {
  const items = data.conflicts
    .map(
      (c) =>
        `<li style="margin:0 0 6px;"><strong style="color:${STONE_900};">${escapeHtml(c.title)}</strong> — ${escapeHtml(c.message)}</li>`,
    )
    .join("");
  const list = data.conflicts.length > 0 ? `<ul style="margin:12px 0 0;padding-left:18px;">${items}</ul>` : "";
  const bodyHtml = `<p style="margin:0;">${data.orderCount} order${data.orderCount === 1 ? "" : "s"} scheduled, ${
    data.conflictCount
  } open conflict${data.conflictCount === 1 ? "" : "s"}.</p>${list}`;

  const textLines = data.conflicts.map((c) => `- ${c.title}: ${c.message}`);
  const text =
    `Schedule updated — ${data.tenantName}\n\n` +
    `${data.orderCount} order${data.orderCount === 1 ? "" : "s"} scheduled, ${data.conflictCount} open conflict${
      data.conflictCount === 1 ? "" : "s"
    }.\n` +
    (textLines.length > 0 ? `\nTop conflicts:\n${textLines.join("\n")}\n` : "") +
    `\nView the schedule: ${data.scheduleUrl}` +
    textFooter(data.tenantName);

  return {
    html: layoutHtml({
      tenantName: data.tenantName,
      preheader: `${data.orderCount} orders scheduled, ${data.conflictCount} conflicts`,
      heading: "Schedule updated",
      bodyHtml,
      cta: { label: "View schedule", href: data.scheduleUrl },
    }),
    text,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// delivery-risk-escalated — DELAYED / LATE only (AT_RISK stays in-app only, per docs/M3_SPEC.md §7)
// ---------------------------------------------------------------------------------------------------------------

export type DeliveryRiskEscalatedRisk = "DELAYED" | "LATE";

export type DeliveryRiskEscalatedData = {
  tenantName: string;
  orderNumber: string;
  risk: DeliveryRiskEscalatedRisk;
  /** Pre-formatted, e.g. "12 Sep 2026". */
  dueDate?: string | null;
  /** Pre-formatted, e.g. "14 Sep 2026, 16:30". */
  projectedEnd?: string | null;
  orderUrl: string;
};

const RISK_WORD: Record<DeliveryRiskEscalatedRisk, string> = { DELAYED: "delayed", LATE: "late" };

export function deliveryRiskEscalatedTemplate(data: DeliveryRiskEscalatedData): { html: string; text: string } {
  const details: string[] = [];
  if (data.dueDate) details.push(`Due ${escapeHtml(data.dueDate)}`);
  if (data.projectedEnd) details.push(`projected ${escapeHtml(data.projectedEnd)}`);
  const detailLine = details.length > 0 ? details.join(", ") : "The current schedule does not meet the due date.";
  const heading = `Order ${data.orderNumber} is ${RISK_WORD[data.risk]}`;
  const bodyHtml = `<p style="margin:0;">${detailLine}</p>`;

  const textDetails: string[] = [];
  if (data.dueDate) textDetails.push(`Due ${data.dueDate}`);
  if (data.projectedEnd) textDetails.push(`projected ${data.projectedEnd}`);
  const text =
    `${heading} — ${data.tenantName}\n\n` +
    `${textDetails.length > 0 ? textDetails.join(", ") : "The current schedule does not meet the due date."}\n\n` +
    `View the order: ${data.orderUrl}` +
    textFooter(data.tenantName);

  return {
    html: layoutHtml({
      tenantName: data.tenantName,
      preheader: heading,
      heading: escapeHtml(heading),
      bodyHtml,
      cta: { label: "View order", href: data.orderUrl },
    }),
    text,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// order-status-changed — ON_HOLD / CANCELLED only
// ---------------------------------------------------------------------------------------------------------------

export type OrderStatusChangedStatus = "ON_HOLD" | "CANCELLED";

export type OrderStatusChangedData = {
  tenantName: string;
  orderNumber: string;
  status: OrderStatusChangedStatus;
  /** Hold/cancel reason, if given — untrusted, escaped before rendering. */
  reason?: string | null;
  /** Who made the change, if known. */
  actorName?: string | null;
  orderUrl: string;
};

const STATUS_WORD: Record<OrderStatusChangedStatus, string> = { ON_HOLD: "on hold", CANCELLED: "cancelled" };

export function orderStatusChangedTemplate(data: OrderStatusChangedData): { html: string; text: string } {
  const actor = data.actorName?.trim() || "Someone";
  const heading = `Order ${data.orderNumber} is now ${STATUS_WORD[data.status]}`;
  const reason = data.reason?.trim();
  const bodyHtml = `<p style="margin:0;">${escapeHtml(actor)} changed it to ${STATUS_WORD[data.status]}${
    reason ? ` — ${escapeHtml(reason)}` : ""
  }.</p>`;

  const text =
    `${heading} — ${data.tenantName}\n\n` +
    `${actor} changed it to ${STATUS_WORD[data.status]}${reason ? ` — ${reason}` : ""}.\n\n` +
    `View the order: ${data.orderUrl}` +
    textFooter(data.tenantName);

  return {
    html: layoutHtml({
      tenantName: data.tenantName,
      preheader: heading,
      heading: escapeHtml(heading),
      bodyHtml,
      cta: { label: "View order", href: data.orderUrl },
    }),
    text,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Dispatch (by EmailMessage.template)
// ---------------------------------------------------------------------------------------------------------------

export const TEMPLATE_NAMES = ["schedule-run-finished", "delivery-risk-escalated", "order-status-changed"] as const;
export type TemplateName = (typeof TEMPLATE_NAMES)[number];

export type TemplateDataFor<T extends TemplateName> = T extends "schedule-run-finished"
  ? ScheduleRunFinishedData
  : T extends "delivery-risk-escalated"
    ? DeliveryRiskEscalatedData
    : OrderStatusChangedData;

/** Renders the named template. Throws on an unknown name (a programmer error — `template` is our own closed set). */
export function renderTemplate<T extends TemplateName>(template: T, data: TemplateDataFor<T>): { html: string; text: string } {
  switch (template) {
    case "schedule-run-finished":
      return scheduleRunFinishedTemplate(data as ScheduleRunFinishedData);
    case "delivery-risk-escalated":
      return deliveryRiskEscalatedTemplate(data as DeliveryRiskEscalatedData);
    case "order-status-changed":
      return orderStatusChangedTemplate(data as OrderStatusChangedData);
    default: {
      const exhaustive: never = template;
      throw new Error(`Unknown email template: ${String(exhaustive)}`);
    }
  }
}
