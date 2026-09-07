import { PRINCIPLE } from "../../_lib/content";
import { Reveal } from "../Reveal";
import { BrandMark, Container } from "../ui";

/** Dark band (reference quote band): the brand principle in large type instead of a testimonial; three fact chips. */
export function PrincipleBand() {
  return (
    <section aria-labelledby="principle-title" className="marketing-band py-20 text-white sm:py-24">
      <Container>
        <Reveal className="mx-auto flex max-w-4xl flex-col items-center text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-white/10 text-white ring-1 ring-white/15">
            <BrandMark size={32} mono />
          </span>
          <p className="mt-8 text-[11px] font-semibold tracking-[0.18em] text-(--band-accent) uppercase">{PRINCIPLE.eyebrow}</p>
          <h2 id="principle-title" className="mt-4 text-3xl leading-[1.15] font-bold tracking-[-0.02em] sm:text-4xl lg:text-[2.5rem]">
            <span className="text-(--band-accent)">{PRINCIPLE.lead}</span> {PRINCIPLE.body}
          </h2>
          <ul className="mt-10 flex flex-wrap items-center justify-center gap-3">
            {PRINCIPLE.chips.map((chip) => (
              <li
                key={chip}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-(--band-muted)"
              >
                <span aria-hidden="true" className="size-1.5 rounded-full bg-(--band-accent)" />
                {chip}
              </li>
            ))}
          </ul>
        </Reveal>
      </Container>
    </section>
  );
}
