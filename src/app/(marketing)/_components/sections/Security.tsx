import { Database, KeyRound, Lock, ScrollText, ShieldCheck, Timer } from "lucide-react";

import { SECURITY } from "../../_lib/content";
import { Reveal } from "../Reveal";
import { Card, Container, IconTile, Section, SectionHeader } from "../ui";

const ICONS = [Lock, Database, ShieldCheck, ScrollText, KeyRound, Timer] as const;

/** Six security cards (reference section 5): icon tile, H3, two-line paragraph; hover lift. */
export function Security() {
  return (
    <Section id="security" aria-labelledby="security-title" className="border-t border-border bg-white">
      <Container>
        <Reveal>
          <SectionHeader
            id="security-title"
            pill="Security & trust"
            title="Built like the record of truth it is"
            lead="Orders, stock and capacity are the plant's operating record. ProdPlan protects it the way a ledger deserves."
          />
        </Reveal>
        <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {SECURITY.map((item, i) => {
            const Icon = ICONS[i];
            return (
              <Reveal key={item.title} delay={(i % 3) * 100} className="flex">
                <Card className="w-full">
                  <IconTile size="sm">
                    <Icon aria-hidden="true" />
                  </IconTile>
                  <h3 className="mt-5 text-lg font-bold tracking-tight text-foreground">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-stone-600">{item.copy}</p>
                </Card>
              </Reveal>
            );
          })}
        </div>
      </Container>
    </Section>
  );
}
