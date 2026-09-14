/**
 * Resend-backed EmailProvider — docs/M3_SPEC.md §7.
 *
 * Implemented as a plain `fetch()` call against Resend's REST API rather than the `resend` npm package: the
 * package is not installed in this project, and adding a new dependency is unnecessary for one POST request
 * (`POST https://api.resend.com/emails`, `Authorization: Bearer <key>`, JSON body). This keeps the email engine
 * dependency-free and equally correct.
 *
 * `RESEND_FROM_ADDRESS` (optional) overrides the default sender; otherwise a `resend.dev` sandbox address is used
 * — safe for outbound testing but NOT deliverable to arbitrary inboxes in production. Once the client connects a
 * verified sending domain in Resend, set `RESEND_FROM_ADDRESS` to an address on it (documented in .env.example).
 */
import { logger } from "@/lib/logger";
import type { EmailProvider, EmailProviderInput, EmailProviderResult } from "./provider";

const RESEND_API_URL = "https://api.resend.com/emails";

/** Default "from" — must move to the client's verified domain once one is connected (docs/M3_SPEC.md §7). */
export const DEFAULT_FROM_ADDRESS = "ProdPlan <notifications@resend.dev>";

function fromAddress(): string {
  return process.env.RESEND_FROM_ADDRESS?.trim() || DEFAULT_FROM_ADDRESS;
}

type ResendErrorBody = { message?: string; name?: string };

/** Builds a Resend-backed provider. `apiKey` is read once at call time so tests can inject a fake key. */
export function createResendProvider(apiKey: string): EmailProvider {
  return {
    async send(input: EmailProviderInput): Promise<EmailProviderResult> {
      const res = await fetch(RESEND_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress(),
          to: input.to,
          subject: input.subject,
          html: input.html,
          text: input.text,
        }),
      });

      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const body = (await res.json()) as ResendErrorBody;
          if (body.message) detail = `${detail}: ${body.message}`;
        } catch {
          // Non-JSON error body — the HTTP status is all we get.
        }
        logger.error("Resend send failed", { status: res.status });
        throw new Error(`Resend API error (${detail})`);
      }

      const body = (await res.json()) as { id?: string };
      if (!body.id) throw new Error("Resend API returned no message id");
      return { providerId: body.id };
    },
  };
}
