import type { NextConfig } from "next";

/**
 * Security headers (docs/M3_SPEC.md §10.1), applied to every route via `headers()` below.
 *
 * CSP is scoped to the app's own origin: `next/font/google` (src/app/layout.tsx) self-hosts Inter/Manrope at build
 * time (no runtime request to Google), so `fonts.googleapis.com`/`fonts.gstatic.com` are allowed defensively but
 * are not actually hit in production. `style-src`/`script-src` keep `'unsafe-inline'` because the app renders
 * plain React `style={{...}}` props (compiled to inline `style="..."` attributes) throughout, and Next's own
 * hydration bootstrap is an inline `<script>` — removing `'unsafe-inline'` would need a nonce/hash pipeline wired
 * through every render, which is out of scope for a review-and-fix pass (documented limitation, `docs/HANDOVER.md`).
 * HSTS is only sent when `APP_URL` is https (never on a local http dev/staging box).
 */
function securityHeaders(): { key: string; value: string }[] {
  const appUrlIsHttps = (process.env.APP_URL ?? "").trim().toLowerCase().startsWith("https://");

  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data:",
    "connect-src 'self'",
  ].join("; ");

  const headers = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // Nothing in the app uses the camera, microphone or geolocation.
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    { key: "Content-Security-Policy", value: csp },
  ];
  if (appUrlIsHttps) {
    headers.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" });
  }
  return headers;
}

const nextConfig: NextConfig = {
  // Docker/VPS builds ship the standalone server; Netlify uses its own adapter.
  output: process.env.NEXT_OUTPUT_STANDALONE ? "standalone" : undefined,
  experimental: {
    // Enables forbidden()/unauthorized() from next/navigation (src/app/forbidden.tsx).
    authInterrupts: true,
    serverActions: {
      // CSV import uploads (≤ 1 MB files) are posted through a Server Action.
      bodySizeLimit: "4mb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders() }];
  },
};

export default nextConfig;
