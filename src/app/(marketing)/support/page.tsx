import type { Metadata } from "next";
import { Mail } from "lucide-react";

import { FOOTER } from "../_lib/content";
import { Container, CtaLink, Section } from "../_components/ui";

export const metadata: Metadata = {
  title: "Support",
  description: "Get help with ProdPlan — email our team.",
};

/** Simple support page: title, one line, the support email. */
export default function SupportPage() {
  return (
    <Section className="pt-28 sm:pt-32">
      <Container>
        <div className="mx-auto flex max-w-xl flex-col items-center gap-4 text-center">
          <h1 className="text-3xl leading-[1.1] font-extrabold tracking-[-0.025em] text-foreground sm:text-4xl">Support</h1>
          <p className="text-lg leading-relaxed text-muted-foreground">Need help with ProdPlan? Email us and we&apos;ll get back to you.</p>
          <CtaLink href={`mailto:${FOOTER.supportEmail}`} variant="primary" size="lg" className="mt-2">
            <Mail aria-hidden="true" />
            {FOOTER.supportEmail}
          </CtaLink>
        </div>
      </Container>
    </Section>
  );
}
