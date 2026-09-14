/**
 * Unit: src/lib/email/log-provider.ts and resend.ts — no network/DB. The log-provider never fails and never logs
 * the HTML body; the Resend provider builds the right request and surfaces failures as a rejected promise (never
 * throws synchronously) so `sendEmail()` can catch it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { logProvider } from "@/lib/email/log-provider";
import { logger } from "@/lib/logger";
import { createResendProvider, DEFAULT_FROM_ADDRESS } from "@/lib/email/resend";

describe("logProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a synthetic log:<id> providerId and never throws", async () => {
    const result = await logProvider.send({ to: "a@example.test", subject: "Hi", html: "<p>hi</p>", text: "hi" });
    expect(result.providerId).toMatch(/^log:/);
  });

  it("logs the subject/recipient but never the HTML body", async () => {
    const spy = vi.spyOn(logger, "info").mockImplementation(() => undefined);
    await logProvider.send({ to: "a@example.test", subject: "Schedule updated", html: "<script>bad()</script>", text: "hi" });
    expect(spy).toHaveBeenCalledTimes(1);
    const loggedArgs = spy.mock.calls[0]!.map((a) => JSON.stringify(a));
    expect(loggedArgs.some((a) => a.includes("Schedule updated"))).toBe(true);
    expect(loggedArgs.some((a) => a.includes("<script>"))).toBe(false);
  });
});

describe("createResendProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to the Resend API with the expected shape and returns the message id", async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("https://api.resend.com/emails");
      expect(init.method).toBe("POST");
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_test_key");
      const body = JSON.parse(init.body as string) as Record<string, string>;
      expect(body.from).toBe(DEFAULT_FROM_ADDRESS);
      expect(body.to).toBe("a@example.test");
      expect(body.subject).toBe("Hi");
      return new Response(JSON.stringify({ id: "msg_123" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createResendProvider("re_test_key");
    const result = await provider.send({ to: "a@example.test", subject: "Hi", html: "<p>hi</p>", text: "hi" });
    expect(result.providerId).toBe("msg_123");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects (does not throw synchronously) on a non-OK response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ message: "invalid API key" }), { status: 401 })),
    );
    const provider = createResendProvider("bad_key");
    await expect(provider.send({ to: "a@example.test", subject: "Hi", html: "<p>hi</p>", text: "hi" })).rejects.toThrow(/Resend API error/);
  });

  it("rejects when the response has no message id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })),
    );
    const provider = createResendProvider("re_test_key");
    await expect(provider.send({ to: "a@example.test", subject: "Hi", html: "<p>hi</p>", text: "hi" })).rejects.toThrow(/no message id/);
  });
});
