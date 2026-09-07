import { Kanban, WandSparkles } from "lucide-react";

import { ROADMAP, ROADMAP_FOOTNOTE } from "../../_lib/content";
import { RoadmapSketch } from "../mockups/RoadmapSketch";
import { Container, Section, SectionHeader } from "../ui";

const ICONS = [Kanban, WandSparkles] as const;

/** Roadmap band (brief §7): planning board and AI assistance, always labelled "Coming next", never dated. */
export function ComingNext() {
  return (
    <Section id="coming-next" aria-labelledby="next-title" className="marketing-band text-(--band-foreground)">
      <Container>
        <div className="grid items-start gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="flex flex-col gap-8 lg:col-span-5">
            <SectionHeader
              id="next-title"
              eyebrow="Also on the platform"
              tone="dark"
              align="left"
              title="Scheduling and AI assistance, on the data you set up today."
              lead="One record of orders, capacity and materials, with scheduling built on top of it."
            />
            <div className="rounded-2xl bg-white/5 p-5 text-(--band-muted) ring-1 ring-white/10">
              <RoadmapSketch className="w-full max-w-md" />
              <p className="mt-3 text-xs text-(--band-subtle)">Planned board layout — a sketch, not a screen.</p>
            </div>
          </div>

          <ul className="grid gap-6 lg:col-span-7">
            {ROADMAP.map((item, i) => {
              const Icon = ICONS[i] ?? Kanban;
              return (
                <li key={item.title} className="flex flex-col gap-3 rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 sm:flex-row sm:gap-5 lg:p-8">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/10 text-(--band-accent)" aria-hidden="true">
                    <Icon className="size-5" />
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-xl leading-tight font-bold">{item.title}</h3>
                      <span className="inline-flex h-5 items-center rounded-full border border-white/20 px-2 text-[11px] font-medium text-(--band-muted)">
                        Planned
                      </span>
                    </div>
                    <p className="mt-2 text-base leading-relaxed text-pretty text-(--band-muted)">{item.copy}</p>
                  </div>
                </li>
              );
            })}
            <li className="text-sm text-(--band-subtle)">{ROADMAP_FOOTNOTE}</li>
          </ul>
        </div>
      </Container>
    </Section>
  );
}
