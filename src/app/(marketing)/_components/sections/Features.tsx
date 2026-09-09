import { ArrowRight } from "lucide-react";

import { FEATURES, type FeatureKey } from "../../_lib/content";
import { FeatureTabs } from "../FeatureTabs";
import { BomSnippet } from "../mockups/BomSnippet";
import { CapacitySnippet } from "../mockups/CapacitySnippet";
import { DashboardSnippet } from "../mockups/DashboardSnippet";
import { OrdersSnippet } from "../mockups/OrdersSnippet";
import { UsersSnippet } from "../mockups/UsersSnippet";
import { Reveal } from "../Reveal";
import { CheckItem, Container, Pill, Section, SectionHeader, TextLink } from "../ui";
import { appHref } from "../../_lib/static";

const MOCKUPS: Record<FeatureKey, () => React.JSX.Element> = {
  orders: OrdersSnippet,
  capacity: CapacitySnippet,
  materials: BomSnippet,
  dashboard: DashboardSnippet,
  access: UsersSnippet,
};

/**
 * Tabbed features (reference section 3): five pills; each panel is a mockup card (left) + copy (right: pill, H3,
 * paragraph, three bold-lead bullets, one honest stat callout, link). Panels are Server-rendered and handed to the
 * client `FeatureTabs`, which only swaps the active one.
 */
export function Features() {
  const panels = FEATURES.map((f) => {
    const Mockup = MOCKUPS[f.key];
    return (
      <div key={f.key} className="grid items-center gap-10 lg:grid-cols-12 lg:gap-14">
        <div className="lg:col-span-7">
          <div className="card-shadow rounded-2xl bg-stone-100/80 p-3 ring-1 ring-stone-900/5 sm:p-5">
            <Mockup />
          </div>
        </div>
        <div className="flex flex-col items-start lg:col-span-5">
          <Pill>{f.eyebrow}</Pill>
          <h3 className="mt-4 text-2xl leading-tight font-bold tracking-[-0.02em] text-foreground sm:text-3xl">{f.title}</h3>
          <p className="mt-4 text-base leading-relaxed text-pretty text-stone-600 sm:text-lg">{f.copy}</p>
          <ul className="mt-6 flex flex-col gap-3">
            {f.bullets.map((b) => (
              <CheckItem key={b.lead} lead={b.lead}>
                {b.text}
              </CheckItem>
            ))}
          </ul>
          <div className="mt-7 flex w-full items-center gap-4 rounded-2xl border border-teal-100 bg-primary-soft/70 p-4">
            <span className="font-display text-3xl font-extrabold tracking-tight whitespace-nowrap text-primary tabular-nums">{f.stat.value}</span>
            <span className="leading-snug">
              <span className="block text-sm font-semibold text-foreground">{f.stat.label}</span>
              <span className="block text-xs text-stone-600">{f.stat.detail}</span>
            </span>
          </div>
          <TextLink href={appHref("/signup")} className="mt-6 text-sm">
            See it in the app
            <ArrowRight aria-hidden="true" />
          </TextLink>
        </div>
      </div>
    );
  });

  return (
    <Section id="features" aria-labelledby="features-title">
      <Container>
        <Reveal>
          <SectionHeader
            id="features-title"
            pill="Everything in one workspace"
            title="From order intake to shop-floor capacity"
            lead="Five connected areas, one record. Pick a tab to see the screen the planner and the supervisor share."
          />
        </Reveal>
        <Reveal delay={100} className="mt-10 sm:mt-12">
          <FeatureTabs tabs={FEATURES.map((f) => ({ key: f.key, label: f.tab }))} panels={panels} />
        </Reveal>
      </Container>
    </Section>
  );
}
