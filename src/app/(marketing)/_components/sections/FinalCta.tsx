import { ArrowRight } from "lucide-react";

import { FINAL_CTA, HERO } from "../../_lib/content";
import { Container, CtaLink } from "../ui";

/** Closing band (brief §6.8) on the dark tokens; repeats the primary action. */
export function FinalCta({ signedIn }: { signedIn: boolean }) {
  return (
    <section aria-labelledby="final-title" className="marketing-band py-16 text-(--band-foreground) sm:py-20">
      <Container>
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
          <h2 id="final-title" className="text-[1.75rem] leading-[1.1] font-bold tracking-[-0.02em] md:text-4xl">
            {FINAL_CTA.headline}
          </h2>
          <p className="max-w-[55ch] text-lg leading-relaxed text-pretty text-(--band-muted) md:text-xl">{FINAL_CTA.line}</p>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            {signedIn ? (
              <CtaLink href="/dashboard" variant="band-primary">
                {HERO.signedInCta}
                <ArrowRight aria-hidden="true" />
              </CtaLink>
            ) : (
              <>
                <CtaLink href="/signup" variant="band-primary">
                  {HERO.primaryCta}
                  <ArrowRight aria-hidden="true" />
                </CtaLink>
                <CtaLink href="/login" variant="band-outline">
                  Sign in
                </CtaLink>
              </>
            )}
          </div>
        </div>
      </Container>
    </section>
  );
}
