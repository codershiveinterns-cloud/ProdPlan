import type { Metadata } from "next";
import type { ReactNode } from "react";

import { appUrl } from "@/lib/auth/jwt";

import { BackToTop } from "./_components/BackToTop";
import { DemoForm } from "./_components/DemoForm";
import { SiteFooter } from "./_components/SiteFooter";
import { SiteHeader } from "./_components/SiteHeader";
import { hasVerifiedSession } from "./_lib/session";

export const metadata: Metadata = {
  // Lets the page's relative OpenGraph / canonical URLs resolve against APP_URL (localhost when unset).
  metadataBase: appUrl(),
};

/**
 * Public marketing shell: no AppShell, no database. Skip link, fixed header (the hero carries the top padding),
 * the page inside `<main>`, dark footer, back-to-top. The cookie probe is jose-only and shared with the page
 * through `React.cache`. Manrope/Inter are loaded once in the root layout.
 */
export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const signedIn = await hasVerifiedSession();

  return (
    <div className="marketing flex min-h-svh flex-1 flex-col bg-background text-foreground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-3 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg"
      >
        Skip to content
      </a>
      {/* Without JavaScript the IntersectionObserver never runs: show every reveal target immediately. */}
      <noscript>
        <style>{`.marketing [data-reveal]{opacity:1;transform:none}`}</style>
      </noscript>
      <SiteHeader
        signedIn={signedIn}
        demoButton={
          <DemoForm variant="outline" size="md">
            View demo
          </DemoForm>
        }
        demoPill={
          <DemoForm variant="primary" size="sm" icon={false}>
            View demo
          </DemoForm>
        }
      />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <SiteFooter signedIn={signedIn} year={2026} />
      <BackToTop />
    </div>
  );
}
