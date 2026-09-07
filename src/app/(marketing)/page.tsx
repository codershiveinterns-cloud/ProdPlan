import type { Metadata } from "next";

import { ComingNext } from "./_components/sections/ComingNext";
import { Faq } from "./_components/sections/Faq";
import { Features } from "./_components/sections/Features";
import { FinalCta } from "./_components/sections/FinalCta";
import { Hero } from "./_components/sections/Hero";
import { HowItWorks } from "./_components/sections/HowItWorks";
import { ProofStrip } from "./_components/sections/ProofStrip";
import { Roles } from "./_components/sections/Roles";
import { HERO, SITE } from "./_lib/content";
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
  alt: `${SITE.name} — ${HERO.headline}`,
};

export const metadata: Metadata = {
  title: { absolute: SITE.title },
  description: HERO.subhead,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: SITE.name,
    title: SITE.title,
    description: HERO.subhead,
    locale: "en_GB",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE.title,
    description: HERO.subhead,
    images: [OG_IMAGE],
  },
};

/**
 * `/` — the public landing page (docs/DESIGN_BRIEF.md §6). `src/proxy.ts` lets everyone through; a visitor with
 * a verifying session cookie sees "Open dashboard" in place of the sign-up actions (no redirect, no DB read).
 * Section order: Hero · Proof strip · Features · How it works · Roles · Coming next · FAQ · Final CTA.
 */
export default async function LandingPage() {
  const signedIn = await hasVerifiedSession();

  return (
    <>
      <Hero signedIn={signedIn} />
      <ProofStrip />
      <Features />
      <HowItWorks />
      <Roles />
      <ComingNext />
      <Faq />
      <FinalCta signedIn={signedIn} />
    </>
  );
}
