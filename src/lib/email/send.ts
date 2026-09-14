/**
 * `sendEmail()` — docs/M3_SPEC.md §7. Renders one of `templates.ts`'s templates, resolves the provider (Resend
 * when `RESEND_API_KEY` is set, else the log-provider), sends it, and writes EXACTLY ONE `EmailMessage` row
 * through the SAME tenant-scoped client/transaction the caller is already inside — mirroring how
 * `src/lib/notifications/service.ts#notify()` takes a `TenantTx | TenantDb` and writes through it, never the raw
 * unscoped `prisma`.
 *
 * Never throws: a provider failure (network, API error) is caught and recorded as `EmailMessage.status = FAILED`
 * with `error` set, so a broken email provider can never fail the mutation transaction that triggered it.
 */
import type { Role } from "@/generated/prisma/enums";
import type { EmailMessageModel } from "@/generated/prisma/models";
import { appOrigin } from "@/lib/auth/jwt";
import type { TenantDb, TenantTx } from "@/lib/db";
import { logger } from "@/lib/logger";
import { logProvider } from "./log-provider";
import type { EmailProvider } from "./provider";
import { createResendProvider } from "./resend";
import { renderTemplate, type TemplateDataFor, type TemplateName } from "./templates";

export type { TemplateName } from "./templates";

/** `true` when RESEND_API_KEY is set — used by sendEmail() and the Settings status line (docs/M3_SPEC.md §7). */
export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

/** Resolves the provider for this call: Resend when configured, else the log-provider (never throws). */
export function resolveEmailProvider(): EmailProvider {
  const key = process.env.RESEND_API_KEY?.trim();
  return key ? createResendProvider(key) : logProvider;
}

/** Absolute app URL for a path (e.g. "/schedule") — email links must be absolute, unlike in-app hrefs. */
export function absoluteAppUrl(path: string): string {
  return new URL(path, appOrigin()).toString();
}

export type EmailRecipient = { id: string; email: string };

/**
 * Active users with one of `roles`, minus `excludeUserId` — the same role-based fan-out `notify()`
 * (src/lib/notifications/service.ts) already does for the in-app notification at each of these call sites, with
 * `email` selected too since `sendEmail()` needs individual addresses to fan out to (docs/M3_SPEC.md §7: "reuse
 * the exact recipient-resolution already in events.ts — do not duplicate the role logic"; this queries the SAME
 * role set through the SAME scoped `tx`, it just also reads the (non-sensitive) email column).
 */
export async function resolveEmailRecipients(
  tx: TenantTx | TenantDb,
  opts: { roles: readonly Role[]; excludeUserId?: string | null },
): Promise<EmailRecipient[]> {
  const users = await tx.user.findMany({
    where: { isActive: true, role: { in: [...opts.roles] } },
    select: { id: true, email: true },
    orderBy: { createdAt: "asc" },
  });
  return opts.excludeUserId ? users.filter((u) => u.id !== opts.excludeUserId) : users;
}

export type SendEmailInput<T extends TemplateName = TemplateName> = {
  tenantId: string;
  /** The recipient user, when known (for the EmailMessage.userId FK); null for tenant-wide/system sends. */
  userId?: string | null;
  to: string;
  subject: string;
  template: T;
  data: TemplateDataFor<T>;
  entityType?: string | null;
  entityId?: string | null;
  /** Links this email to the in-app Notification it accompanies, if any. */
  notificationId?: string | null;
};

/** The generated EmailMessage row shape, re-exported so callers do not need to reach into `@/generated/prisma`. */
export type EmailMessageRecord = EmailMessageModel;

/**
 * Renders `input.template` with `input.data`, sends it, and writes one EmailMessage row via `tx` (SENT + providerId
 * on success, FAILED + error message on failure). Always resolves — never rejects — so a call site can `await` it
 * unconditionally right next to `await notify(tx, ...)` without a try/catch of its own.
 */
export async function sendEmail<T extends TemplateName>(tx: TenantTx | TenantDb, input: SendEmailInput<T>): Promise<EmailMessageRecord> {
  const provider = resolveEmailProvider();
  let status: "SENT" | "FAILED" = "SENT";
  let providerId: string | null = null;
  let error: string | null = null;

  try {
    const { html, text } = renderTemplate(input.template, input.data);
    const result = await provider.send({ to: input.to, subject: input.subject, html, text });
    providerId = result.providerId;
  } catch (err) {
    status = "FAILED";
    error = err instanceof Error ? err.message : String(err);
    logger.error("sendEmail: provider send failed", { template: input.template, to: input.to, error });
  }

  return tx.emailMessage.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId ?? null,
      toEmail: input.to,
      subject: input.subject,
      template: input.template,
      status,
      providerId,
      error,
      notificationId: input.notificationId ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      sentAt: status === "SENT" ? new Date() : null,
    },
  });
}
