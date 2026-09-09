import { ArrowDown, ArrowRight, Check } from "lucide-react";

import { HERO } from "../../_lib/content";
import { DemoForm } from "../DemoForm";
import { DashboardMockup } from "../mockups/DashboardMockup";
import { Container, CtaLink } from "../ui";
import { appHref } from "../../_lib/static";

/**
 * Hero (reference section 1): pulsing-dot pill, two-line H1 with the teal highlight, lead, trust line, CTA row,
 * three ✓ bullets; browser-chrome dashboard mockup on the right from `lg`. Copy slides up with 0/100/200/300 ms
 * stagger; the mockup fades in at 200 ms and its chip floats in at 900 ms (all CSS, see globals.css).
 */
export function Hero({ signedIn }: { signedIn: boolean }) {
  return (
    <section aria-labelledby="hero-title" className="marketing-hero-bg relative overflow-hidden pt-28 pb-16 sm:pt-32 lg:pt-40 lg:pb-28">
      <div aria-hidden="true" className="marketing-hero-fade absolute inset-x-0 bottom-0 h-40" />
      <Container className="relative">
        <div className="grid items-center gap-14 lg:grid-cols-12 lg:gap-10">
          <div className="flex max-w-2xl flex-col items-center text-center lg:col-span-6 lg:items-start lg:text-left">
            <div className="animate-slide-up">
              <span className="inline-flex items-center gap-2 rounded-full border border-teal-200/70 bg-white/80 px-3.5 py-1.5 text-xs font-semibold text-primary-soft-foreground shadow-xs backdrop-blur">
                <span className="relative flex size-2" aria-hidden="true">
                  <span className="animate-ping-dot absolute inline-flex size-full rounded-full bg-primary/60" />
                  <span className="animate-pulse-dot relative inline-flex size-2 rounded-full bg-primary" />
                </span>
                {HERO.pill}
              </span>
            </div>

            <h1
              id="hero-title"
              className="animate-slide-up delay-100 mt-6 text-[2.5rem] leading-[1.05] font-extrabold tracking-[-0.03em] text-foreground sm:text-5xl lg:text-[2.375rem] xl:text-[3rem]"
            >
              <span className="block">{HERO.headlineStart}</span>
              <span className="block">
                <span className="text-primary">{HERO.headlineHighlight}</span> {HERO.headlineEnd}
              </span>
            </h1>

            <p className="animate-slide-up delay-200 mt-6 max-w-[58ch] text-lg leading-relaxed text-pretty text-stone-600 sm:text-xl">{HERO.lead}</p>

            <p className="animate-slide-up delay-200 mt-5 flex flex-wrap items-center justify-center gap-x-2 text-sm font-medium text-stone-600 lg:justify-start">
              {HERO.trust.map((item, i) => (
                <span key={item} className="inline-flex items-center gap-2">
                  {i > 0 ? <span aria-hidden="true" className="text-stone-300">·</span> : null}
                  {item}
                </span>
              ))}
            </p>

            <div className="animate-slide-up delay-300 mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              {signedIn ? (
                <CtaLink href="/dashboard" className="w-full sm:w-auto">
                  {HERO.signedInCta}
                  <ArrowRight aria-hidden="true" />
                </CtaLink>
              ) : (
                <>
                  <CtaLink href={appHref("/signup")} className="w-full sm:w-auto">
                    {HERO.primaryCta}
                    <ArrowRight aria-hidden="true" />
                  </CtaLink>
                  <DemoForm variant="outline" className="w-full sm:w-auto">
                    {HERO.demoCta}
                  </DemoForm>
                </>
              )}
            </div>

            <a
              href="#how-it-works"
              className="animate-slide-up delay-300 mt-4 inline-flex items-center gap-1.5 rounded-sm text-sm font-semibold text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {HERO.howLink}
              <ArrowDown aria-hidden="true" className="size-4" />
            </a>

            <ul className="animate-slide-up delay-400 mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-stone-600 lg:justify-start">
              {HERO.bullets.map((b) => (
                <li key={b} className="inline-flex items-center gap-2">
                  <Check aria-hidden="true" className="size-4 text-primary" strokeWidth={3} />
                  {b}
                </li>
              ))}
            </ul>
          </div>

          <div className="animate-fade-in delay-200 relative lg:col-span-6">
            <DashboardMockup />
          </div>
        </div>
      </Container>
    </section>
  );
}
