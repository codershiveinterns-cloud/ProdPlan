import { ArrowRight, Factory, Gauge, Package } from "lucide-react";

import { cn } from "@/lib/utils";

import { PLATFORM } from "../../_lib/content";
import { Reveal } from "../Reveal";
import { Card, CheckItem, Container, CtaLink, IconTile, Pill, Section, SectionHeader } from "../ui";
import { appHref } from "../../_lib/static";

const ICONS = [Package, Factory, Gauge] as const;

/** Three platform cards (reference pricing anatomy without prices); the middle one is featured with a floating badge. */
export function Platform() {
  return (
    <Section id="platform" aria-labelledby="platform-title" className="border-t border-border bg-stone-50">
      <Container>
        <Reveal>
          <SectionHeader
            id="platform-title"
            pill="One platform"
            title="Everything the plant needs, in one system"
            lead="Office, floor and management work from the same record — no exports, no re-keying, no version of the truth per department."
          />
        </Reveal>
        <div className="mt-14 grid gap-6 lg:grid-cols-3 lg:items-stretch">
          {PLATFORM.map((card, i) => {
            const Icon = ICONS[i];
            return (
              <Reveal key={card.name} delay={i * 100} className="flex">
                <Card
                  className={cn(
                    "relative flex w-full flex-col p-7",
                    card.featured && "ring-2 ring-primary shadow-[0_1px_2px_rgb(28_25_23_/_0.04),0_24px_48px_-16px_rgb(15_118_110_/_0.35)] hover:ring-primary",
                  )}
                >
                  {card.featured ? (
                    <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-[11px] font-bold tracking-wider text-white uppercase shadow-sm">
                      Runs on tablets
                    </span>
                  ) : null}
                  <div className="flex items-center gap-4">
                    <IconTile tone={card.featured ? "amber" : "primary"}>
                      <Icon aria-hidden="true" />
                    </IconTile>
                    <div>
                      <h3 className="text-xl font-bold tracking-tight text-foreground">{card.name}</h3>
                      <Pill tone="neutral" className="mt-1.5">
                        {card.label}
                      </Pill>
                    </div>
                  </div>
                  <p className="mt-5 text-sm leading-relaxed text-stone-600">{card.copy}</p>
                  <p className="mt-6 text-[11px] font-semibold tracking-wider text-stone-500 uppercase">Included</p>
                  <ul className="mt-3 flex flex-col gap-2.5">
                    {card.bullets.map((b) => (
                      <CheckItem key={b}>{b}</CheckItem>
                    ))}
                  </ul>
                  <div className="mt-auto pt-8">
                    <CtaLink href={appHref("/signup")} variant={card.featured ? "primary" : "outline"} size="md" className="w-full">
                      Create your workspace
                      <ArrowRight aria-hidden="true" />
                    </CtaLink>
                  </div>
                </Card>
              </Reveal>
            );
          })}
        </div>
      </Container>
    </Section>
  );
}
