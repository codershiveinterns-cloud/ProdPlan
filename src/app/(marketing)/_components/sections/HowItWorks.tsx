import { STEPS } from "../../_lib/content";
import { Container, Section, SectionHeader } from "../ui";

/** Four numbered steps on a connecting line (brief §6.5). Four columns ≥ lg, stacked with a vertical rail below. */
export function HowItWorks() {
  return (
    <Section id="how-it-works" aria-labelledby="how-title" className="border-y border-border bg-white">
      <Container>
        <SectionHeader
          id="how-title"
          eyebrow="How it works"
          title="From an empty workspace to a live plant record."
          lead="Four steps, no installation. Most plants finish the first three in an afternoon."
        />
        <ol className="relative mt-12 grid gap-10 lg:mt-16 lg:grid-cols-4 lg:gap-8">
          <div
            aria-hidden="true"
            className="absolute top-0 bottom-0 left-5 w-px bg-stone-200 lg:top-5 lg:right-[12.5%] lg:bottom-auto lg:left-[12.5%] lg:h-px lg:w-auto"
          />
          {STEPS.map((step, i) => (
            <li key={step.title} className="relative flex gap-5 lg:flex-col lg:items-center lg:gap-5 lg:text-center">
              <span
                aria-hidden="true"
                className="font-display relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-base font-bold text-primary-foreground ring-4 ring-white"
              >
                {i + 1}
              </span>
              <div className="pt-1.5 lg:pt-0">
                <h3 className="text-lg leading-tight font-bold text-foreground">
                  <span className="sr-only">Step {i + 1}: </span>
                  {step.title}
                </h3>
                <p className="mt-2 text-base leading-relaxed text-pretty text-muted-foreground">{step.copy}</p>
              </div>
            </li>
          ))}
        </ol>
      </Container>
    </Section>
  );
}
