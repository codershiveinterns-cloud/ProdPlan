import { ArrowRight } from "lucide-react";

import { HERO } from "../../_lib/content";
import { DashboardMockup } from "../mockups/DashboardMockup";
import { Container, CtaLink, Eyebrow, TextLink } from "../ui";

/** Hero (brief §6.2): copy 5/12, Mockup A 7/12 at ≥ lg; stacked below. The only animated block on the page. */
export function Hero({ signedIn }: { signedIn: boolean }) {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden pt-12 pb-16 sm:pt-16 lg:pt-20 lg:pb-24">
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-10">
          <div className="flex max-w-2xl flex-col items-start gap-6 lg:col-span-5">
            <div data-rise="1">
              <Eyebrow>{HERO.eyebrow}</Eyebrow>
            </div>
            <h1
              id="hero-title"
              data-rise="2"
              className="max-w-[14ch] text-[2.375rem] leading-[1.05] font-extrabold tracking-[-0.03em] text-foreground md:text-5xl xl:text-[3.5rem]"
            >
              {HERO.headline}
            </h1>
            <p data-rise="3" className="max-w-[60ch] text-lg leading-relaxed text-pretty text-muted-foreground md:text-xl">
              {HERO.subhead}
            </p>
            <div data-rise="4" className="flex w-full flex-col gap-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                {signedIn ? (
                  <CtaLink href="/dashboard">
                    {HERO.signedInCta}
                    <ArrowRight aria-hidden="true" />
                  </CtaLink>
                ) : (
                  <CtaLink href="/signup">
                    {HERO.primaryCta}
                    <ArrowRight aria-hidden="true" />
                  </CtaLink>
                )}
                <CtaLink href="#how-it-works" variant="outline">
                  {HERO.secondaryCta}
                </CtaLink>
              </div>
              <p className="text-[13px] leading-5 text-muted-foreground">{HERO.frictionReducer}</p>
              {signedIn ? null : (
                <p className="text-sm text-muted-foreground">
                  {HERO.tertiary.prefix} <TextLink href="/login">{HERO.tertiary.label}</TextLink>
                </p>
              )}
            </div>
          </div>

          <div className="relative lg:col-span-7">
            <div
              aria-hidden="true"
              className="marketing-dot-grid absolute -inset-x-6 -inset-y-8 -z-10 rounded-3xl [mask-image:radial-gradient(ellipse_at_center,black_45%,transparent_78%)] sm:-inset-x-10 sm:-inset-y-12"
            />
            <DashboardMockup />
          </div>
        </div>
      </Container>
    </section>
  );
}
