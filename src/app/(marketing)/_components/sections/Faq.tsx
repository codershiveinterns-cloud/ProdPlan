import { ChevronDown } from "lucide-react";

import { FAQ } from "../../_lib/content";
import { Reveal } from "../Reveal";
import { Container, Section, SectionHeader } from "../ui";

/** Six questions as native <details>/<summary> cards — keyboard and screen-reader friendly without JS. */
export function Faq() {
  return (
    <Section id="faq" aria-labelledby="faq-title" className="border-t border-border bg-white">
      <Container>
        <Reveal>
          <SectionHeader id="faq-title" pill="FAQ" title="Questions planners ask first" lead="Import, capacity, roles, isolation, tablets and the demo — the straight answers." />
        </Reveal>
        <div className="mx-auto mt-12 max-w-3xl">
          <ul className="flex flex-col gap-3">
            {FAQ.map((item, i) => (
              <Reveal as="li" key={item.question} delay={Math.min(i, 3) * 80}>
                <details className="group card-shadow rounded-2xl bg-white ring-1 ring-stone-900/5 transition-shadow open:shadow-[0_1px_2px_rgb(28_25_23_/_0.04),0_16px_40px_rgb(28_25_23_/_0.08)] open:ring-teal-700/20">
                  <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-2xl px-5 py-4 text-left text-base font-semibold text-foreground outline-none transition-colors hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-6 sm:text-lg">
                    <span>{item.question}</span>
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-stone-500 transition-all duration-200 group-open:rotate-180 group-open:bg-primary-soft group-open:text-primary">
                      <ChevronDown aria-hidden="true" className="size-4" />
                    </span>
                  </summary>
                  <p className="px-5 pb-5 text-base leading-relaxed text-pretty text-stone-600 sm:px-6">{item.answer}</p>
                </details>
              </Reveal>
            ))}
          </ul>
        </div>
      </Container>
    </Section>
  );
}
