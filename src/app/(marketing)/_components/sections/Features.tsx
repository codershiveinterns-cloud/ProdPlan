import type { ReactNode } from "react";

import { FEATURES, type FeatureKey } from "../../_lib/content";
import { CapacitySnippet } from "../mockups/CapacitySnippet";
import { DashboardSnippet } from "../mockups/DashboardSnippet";
import { LedgerSnippet } from "../mockups/LedgerSnippet";
import { MachinesSnippet } from "../mockups/MachinesSnippet";
import { OrdersSnippet } from "../mockups/OrdersSnippet";
import { ShortageSnippet } from "../mockups/ShortageSnippet";
import { Container, Eyebrow, Section, SectionHeader } from "../ui";

const SNIPPETS: Record<FeatureKey, ReactNode> = {
  orders: <OrdersSnippet />,
  capacity: <CapacitySnippet />,
  machines: <MachinesSnippet />,
  bom: <ShortageSnippet />,
  stock: <LedgerSnippet />,
  dashboard: <DashboardSnippet />,
};

/** Six M1 capabilities (brief §6.4), each as claim + mechanism + a drawn UI snippet. */
export function Features() {
  return (
    <Section id="features" aria-labelledby="features-title">
      <Container>
        <SectionHeader
          id="features-title"
          eyebrow="Everything in one workspace"
          title="Everything the schedule will run on, kept honest."
          lead="Orders with deadlines, machines with real shift capacity, materials with real stock — and a dashboard that shows where the day stands."
        />
        <ul className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-3 lg:mt-16">
          {FEATURES.map((feature) => (
            <li
              key={feature.key}
              className="flex flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-foreground/10 transition-shadow duration-200 ease-out hover:shadow-[0_24px_48px_-32px_rgb(28_25_23_/_0.35)]"
            >
              <div className="flex flex-col gap-3 p-6 pb-5">
                <Eyebrow chip={false}>{feature.area}</Eyebrow>
                <h3 className="text-xl leading-tight font-bold text-foreground md:text-[1.375rem]">{feature.title}</h3>
                <p className="text-base leading-relaxed text-pretty text-muted-foreground">{feature.copy}</p>
              </div>
              <div className="mt-auto border-t border-stone-100 bg-background p-4">{SNIPPETS[feature.key]}</div>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  );
}
