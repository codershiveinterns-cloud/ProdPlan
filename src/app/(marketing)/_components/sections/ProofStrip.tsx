import { FileClock, ShieldCheck, Timer } from "lucide-react";

import { PROOF_POINTS } from "../../_lib/content";
import { Container, IconChip } from "../ui";

const ICONS = [Timer, FileClock, ShieldCheck] as const;

/** Three verifiable product facts directly under the hero (brief §6.3) — no customer counts or ratings. */
export function ProofStrip() {
  return (
    <section aria-labelledby="proof-title" className="border-y border-slate-200 bg-white">
      <h2 id="proof-title" className="sr-only">
        Why ProdPlan
      </h2>
      <Container className="py-10 sm:py-12">
        <ul className="grid gap-8 md:grid-cols-3 md:gap-10">
          {PROOF_POINTS.map((point, i) => {
            const Icon = ICONS[i] ?? Timer;
            return (
              <li key={point.title} className="flex items-start gap-4">
                <IconChip>
                  <Icon />
                </IconChip>
                <div>
                  <h3 className="text-base font-bold text-slate-900">{point.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{point.detail}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}
