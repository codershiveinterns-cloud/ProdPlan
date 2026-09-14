import type { Metadata } from "next";
import { Clock, LifeBuoy, Mail, MessageCircleQuestion } from "lucide-react";

import { FOOTER, SUPPORT_TOPICS } from "../_lib/content";
import { Reveal } from "../_components/Reveal";
import { Card, Container, CtaLink, IconTile, Pill, Section, TextLink } from "../_components/ui";

export const metadata: Metadata = {
  title: "Support",
  description: "Get help with ProdPlan — email our team and we'll get back to you within one business day.",
};

/** Standalone support page: contact card up top, common topics below, FAQ pointer at the close. */
export default function SupportPage() {
  return (
    <>
      <Section className="pt-28 pb-0 sm:pt-32">
        <Container>
          <Reveal className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
            <Pill>
              <LifeBuoy aria-hidden="true" className="size-3.5" />
              Support
            </Pill>
            <h1 className="text-3xl leading-[1.1] font-extrabold tracking-[-0.025em] text-foreground sm:text-4xl lg:text-[2.75rem]">
              We&apos;re here to help
            </h1>
            <p className="max-w-[56ch] text-lg leading-relaxed text-pretty text-muted-foreground md:text-xl">
              Question about a feature, something not working, or help setting up your workspace — reach us directly and a
              real person will get back to you.
            </p>
          </Reveal>
        </Container>
      </Section>

      <Section className="pt-10 sm:pt-12">
        <Container>
          <Reveal>
            <Card className="mx-auto flex max-w-2xl flex-col items-center gap-5 p-8 text-center sm:p-10">
              <IconTile size="md">
                <Mail aria-hidden="true" />
              </IconTile>
              <div className="flex flex-col gap-1.5">
                <h2 className="text-xl font-bold tracking-tight text-foreground">Email support</h2>
                <p className="text-sm leading-relaxed text-stone-600">The fastest way to reach us for any question.</p>
              </div>
              <CtaLink href={`mailto:${FOOTER.supportEmail}`} variant="primary" size="lg">
                <Mail aria-hidden="true" />
                {FOOTER.supportEmail}
              </CtaLink>
              <p className="flex items-center gap-1.5 text-xs font-medium text-stone-500">
                <Clock aria-hidden="true" className="size-3.5" />
                We reply within one business day
              </p>
            </Card>
          </Reveal>
        </Container>
      </Section>

      <Section aria-labelledby="support-topics-title" className="border-t border-border bg-white">
        <Container>
          <Reveal className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-center">
            <h2 id="support-topics-title" className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              What can we help with?
            </h2>
            <p className="text-base leading-relaxed text-muted-foreground">
              Mention which of these applies when you write in — it helps us route your message faster.
            </p>
          </Reveal>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {SUPPORT_TOPICS.map((topic, i) => (
              <Reveal key={topic.title} delay={(i % 2) * 100} className="flex">
                <Card className="w-full" lift={false}>
                  <h3 className="text-base font-bold tracking-tight text-foreground">{topic.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-stone-600">{topic.copy}</p>
                </Card>
              </Reveal>
            ))}
          </div>
        </Container>
      </Section>

      <Section className="pt-0">
        <Container>
          <Reveal>
            <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 rounded-2xl border border-border bg-muted/50 px-6 py-8 text-center">
              <MessageCircleQuestion aria-hidden="true" className="size-6 text-primary" />
              <p className="text-sm leading-relaxed text-stone-600">
                Looking for a quick answer? Check the <TextLink href="/#faq">frequently asked questions</TextLink> first —
                import, capacity, roles, isolation and the demo are covered there.
              </p>
            </div>
          </Reveal>
        </Container>
      </Section>
    </>
  );
}
