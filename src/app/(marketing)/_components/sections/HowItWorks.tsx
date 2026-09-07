import { STEPS } from "../../_lib/content";
import { Reveal } from "../Reveal";
import { Container, Section, SectionHeader } from "../ui";

/** Four numbered steps on a connecting line: horizontal from `lg`, vertical (line on the left) below. */
export function HowItWorks() {
  return (
    <Section id="how-it-works" aria-labelledby="how-title" className="border-t border-border bg-white">
      <Container>
        <Reveal>
          <SectionHeader
            id="how-title"
            pill="How it works"
            title="Up and running before the next shift"
            lead="Four steps from an empty workspace to the plant on one screen. Load demo data at any point to explore first."
          />
        </Reveal>
        <ol className="relative mt-14 grid gap-10 lg:grid-cols-4 lg:gap-8">
          <div aria-hidden="true" className="absolute top-0 bottom-0 left-6 w-px bg-border lg:top-6 lg:right-[12.5%] lg:bottom-auto lg:left-[12.5%] lg:h-px lg:w-auto" />
          {STEPS.map((step, i) => (
            <Reveal as="li" key={step.title} delay={i * 100} className="relative flex gap-5 lg:flex-col lg:items-center lg:gap-6 lg:text-center">
              <span className="font-display relative z-10 flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-white shadow-md shadow-teal-900/25 ring-8 ring-white">
                {i + 1}
              </span>
              <div className="pt-2 lg:pt-0">
                <h3 className="text-lg font-bold tracking-tight text-foreground">{step.title}</h3>
                <p className="mt-2 max-w-[34ch] text-sm leading-relaxed text-pretty text-stone-600 lg:mx-auto">{step.copy}</p>
              </div>
            </Reveal>
          ))}
        </ol>
      </Container>
    </Section>
  );
}
