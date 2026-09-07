import { ChevronDown } from "lucide-react";

import { FAQ } from "../../_lib/content";
import { Container, Section, SectionHeader } from "../ui";

/** Six objections answered with native <details>/<summary> — keyboard and screen-reader friendly without JS. */
export function Faq() {
  return (
    <Section id="faq" aria-labelledby="faq-title" className="border-y border-border bg-white">
      <Container>
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
          <SectionHeader
            id="faq-title"
            eyebrow="FAQ"
            align="left"
            title="Questions planners ask first."
            lead="Scope, import, isolation, roles, tablets and passwords — the honest answers for this release."
            className="lg:col-span-4"
          />
          <div className="lg:col-span-8">
            <ul className="divide-y divide-border border-y border-border">
              {FAQ.map((item) => (
                <li key={item.question}>
                  <details className="group">
                    <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-4 py-4 text-left text-base font-semibold text-foreground outline-none hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 md:text-lg">
                      <span>{item.question}</span>
                      <ChevronDown
                        aria-hidden="true"
                        className="size-5 shrink-0 text-stone-400 transition-transform duration-200 ease-out group-open:rotate-180"
                      />
                    </summary>
                    <p className="max-w-[65ch] pb-5 text-base leading-relaxed text-pretty text-muted-foreground">{item.answer}</p>
                  </details>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Container>
    </Section>
  );
}
