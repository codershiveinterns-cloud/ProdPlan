/**
 * No-op EmailProvider — docs/M3_SPEC.md §7. Used automatically when `RESEND_API_KEY` is unset (dev / no-key
 * staging), so the email engine is fully exercised and testable without a real provider key. It never fails: it
 * logs the rendered subject/recipient (never the HTML body — logs stay readable) and returns a synthetic
 * `log:<id>` providerId, which `sendEmail()` records as a normal SENT `EmailMessage` row.
 */
import { randomUUID } from "node:crypto";
import { logger } from "@/lib/logger";
import type { EmailProvider, EmailProviderInput, EmailProviderResult } from "./provider";

export const logProvider: EmailProvider = {
  async send(input: EmailProviderInput): Promise<EmailProviderResult> {
    const providerId = `log:${randomUUID()}`;
    logger.info("Email logged (no RESEND_API_KEY configured — not actually sent)", {
      to: input.to,
      subject: input.subject,
      providerId,
    });
    return { providerId };
  },
};
