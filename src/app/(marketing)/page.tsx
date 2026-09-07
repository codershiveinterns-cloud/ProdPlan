import type { Metadata } from "next";

import { Faq } from "./_components/sections/Faq";
import { Features } from "./_components/sections/Features";
import { FinalCta } from "./_components/sections/FinalCta";
import { Hero } from "./_components/sections/Hero";
import { HowItWorks } from "./_components/sections/HowItWorks";
import { IndustryStrip } from "./_components/sections/IndustryStrip";
import { Platform } from "./_components/sections/Platform";
import { PrincipleBand } from "./_components/sections/PrincipleBand";
import { Roles } from "./_components/sections/Roles";
import { Security } from "./_components/sections/Security";
import { SITE } from "./_lib/content";
import { hasVerifiedSession } from "./_lib/session";

/**
 * Social preview rendered by src/app/opengraph-image.tsx (1200 × 630). Declared explicitly because a segment's
 * `openGraph`/`twitter` object replaces the parent's wholesale, which would drop the file-based image collected at the
 * root segment. Resolved against `metadataBase` (APP_URL) from the marketing layout.
 */
const OG_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: SITE.title,
};

export const metadata: Metadata = {
  title: { absolute: SITE.title },
  description: SITE.description,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: SITE.name,
    title: SITE.title,
    description: SITE.description,
    locale: "en_GB",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE.title,
    description: SITE.description,
    images: [OG_IMAGE],
  },
};

/**
 * `/` — the public landing page (docs/LANDING_REFERENCE.md §2). `src/proxy.ts` lets everyone through; a visitor
 * with a verifying session cookie sees "Open dashboard" in place of the sign-up actions (no redirect, no DB read).
 * Section order: Hero · Industry strip · Features · How it works · Roles · Security · Principle band · Platform ·
 * FAQ · Final CTA.
 */
export default async function LandingPage() {
  const signedIn = await hasVerifiedSession();

  return (
    <>
      <Hero signedIn={signedIn} />
      <IndustryStrip />
      <Features />
      <HowItWorks />
      <Roles />
      <Security />
      <PrincipleBand />
      <Platform />
      <Faq />
      <FinalCta signedIn={signedIn} />
    </>
  );
}
