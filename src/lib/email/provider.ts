/**
 * Email provider contract — docs/M3_SPEC.md §7.
 *
 * `sendEmail()` (./send.ts) resolves ONE implementation of this interface (Resend when `RESEND_API_KEY` is set,
 * else the log-provider) and calls `send()`. Implementations never throw for delivery failures that the caller
 * should record as `EmailMessage.status = FAILED` — they reject the returned promise, and `sendEmail()` catches it.
 */
export type EmailProviderInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type EmailProviderResult = {
  /** Opaque id from the provider (or a synthetic `log:<id>` for the log-provider), stored on EmailMessage. */
  providerId: string;
};

export type EmailProvider = {
  send(input: EmailProviderInput): Promise<EmailProviderResult>;
};
