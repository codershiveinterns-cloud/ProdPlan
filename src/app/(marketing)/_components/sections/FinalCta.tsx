import { ArrowRight, Check } from "lucide-react";

import { FINAL_CTA } from "../../_lib/content";
import { Reveal } from "../Reveal";
import { Container, CtaLink, Pill } from "../ui";
import { ctaClasses } from "../ui";
import { appHref } from "../../_lib/static";

/** Dark final CTA band (reference section 9): pill, H2, paragraph, amber primary + outline-on-dark, three ✓ items. */
export function FinalCta({ signedIn }: { signedIn: boolean }) {
  return (
    <section aria-labelledby="cta-title" className="marketing-band relative overflow-hidden py-20 text-white sm:py-28">
      <div aria-hidden="true" className="absolute -top-40 left-1/2 h-80 w-[40rem] -translate-x-1/2 rounded-full bg-teal-400/10 blur-3xl" />
      <Container className="relative">
        <Reveal className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <Pill tone="dark">{FINAL_CTA.pill}</Pill>
          <h2 id="cta-title" className="mt-5 text-3xl leading-[1.1] font-extrabold tracking-[-0.025em] sm:text-4xl lg:text-5xl">
            {FINAL_CTA.headline}
          </h2>
          <p className="mt-5 max-w-[56ch] text-lg leading-relaxed text-pretty text-(--band-muted) sm:text-xl">{FINAL_CTA.line}</p>
          <div className="mt-9 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            {signedIn ? (
              <CtaLink href="/dashboard" variant="band-primary" className="w-full sm:w-auto">
                Open dashboard
                <ArrowRight aria-hidden="true" />
              </CtaLink>
            ) : (
              <>
                <CtaLink href={appHref("/signup")} variant="band-primary" className="w-full sm:w-auto">
                  {FINAL_CTA.primary}
                  <ArrowRight aria-hidden="true" />
                </CtaLink>
                <span aria-disabled="true" className={ctaClasses("band-outline", "lg", "w-full cursor-not-allowed opacity-60 sm:w-auto")}>
                  {FINAL_CTA.secondary}
                </span>
              </>
            )}
          </div>
          <ul className="mt-9 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-(--band-muted)">
            {FINAL_CTA.checks.map((c) => (
              <li key={c} className="inline-flex items-center gap-2">
                <Check aria-hidden="true" className="size-4 text-(--band-accent)" strokeWidth={3} />
                {c}
              </li>
            ))}
          </ul>
        </Reveal>
      </Container>
    </section>
  );
}
