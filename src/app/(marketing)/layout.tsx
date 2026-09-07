import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import type { ReactNode } from "react";

import { appUrl } from "@/lib/auth/jwt";

import { SiteFooter } from "./_components/SiteFooter";
import { SiteHeader } from "./_components/SiteHeader";
import { hasVerifiedSession } from "./_lib/session";

/** Display face for landing headings only (brief §4); falls back to Inter through the `--font-heading` chain. */
const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  // Lets the page's relative OpenGraph / canonical URLs resolve against APP_URL (localhost when unset).
  metadataBase: appUrl(),
};

/**
 * Public marketing shell: no AppShell, no database. Skip-link first, sticky header, the page inside `<main>`,
 * dark footer. The cookie probe is jose-only and shared with the page through `React.cache`.
 */
export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const signedIn = await hasVerifiedSession();
  const year = new Date().getFullYear();

  return (
    <div className={`${manrope.variable} marketing flex min-h-svh flex-1 flex-col bg-background text-foreground`}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-3 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg"
      >
        Skip to content
      </a>
      <SiteHeader signedIn={signedIn} />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <SiteFooter signedIn={signedIn} year={year} />
    </div>
  );
}
