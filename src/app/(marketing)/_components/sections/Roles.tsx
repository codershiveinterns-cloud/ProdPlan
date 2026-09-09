import { ArrowRight, Eye, Settings, UserCog, Wrench } from "lucide-react";

import { ROLES } from "../../_lib/content";
import { Reveal } from "../Reveal";
import { Card, CheckItem, Container, IconTile, Pill, Section, SectionHeader, TextLink } from "../ui";
import { appHref } from "../../_lib/static";

const ICONS = [Settings, UserCog, Wrench, Eye] as const;

/** Four role cards (reference "Industries" anatomy): icon tile, label pill, H3, paragraph, three ✓ bullets, CTA link. */
export function Roles() {
  return (
    <Section id="roles" aria-labelledby="roles-title" className="border-t border-border bg-stone-50">
      <Container>
        <Reveal>
          <SectionHeader
            id="roles-title"
            pill="Built for every role"
            title="The right controls for every person in the plant"
            lead="Four roles, enforced on the server for every page and action — not just hidden buttons."
          />
        </Reveal>
        <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {ROLES.map((role, i) => {
            const Icon = ICONS[i];
            return (
              <Reveal key={role.name} delay={i * 100} className="flex">
                <Card className="flex w-full flex-col">
                  <IconTile>
                    <Icon aria-hidden="true" />
                  </IconTile>
                  <Pill className="mt-5 self-start" tone="neutral">
                    {role.label}
                  </Pill>
                  <h3 className="mt-3 text-xl font-bold tracking-tight text-foreground">{role.name}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-stone-600">{role.blurb}</p>
                  <ul className="mt-5 flex flex-col gap-2.5">
                    {role.bullets.map((b) => (
                      <CheckItem key={b}>{b}</CheckItem>
                    ))}
                  </ul>
                  <TextLink href={appHref("/signup")} className="mt-auto pt-6 text-sm">
                    Create your workspace
                    <ArrowRight aria-hidden="true" />
                  </TextLink>
                </Card>
              </Reveal>
            );
          })}
        </div>
      </Container>
    </Section>
  );
}
