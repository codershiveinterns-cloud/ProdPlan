import { Eye, ShieldCheck, UserCog, UserRoundCog, Wrench } from "lucide-react";

import { ISOLATION_CARD, ROLES, ROLES_INTRO } from "../../_lib/content";
import { Container, IconChip, Section, SectionHeader } from "../ui";

const ROLE_ICONS = [UserCog, UserRoundCog, Wrench, Eye] as const;

/** Four roles + the isolation/audit side card (brief §6.6). */
export function Roles() {
  return (
    <Section id="roles" aria-labelledby="roles-title">
      <Container>
        <SectionHeader id="roles-title" eyebrow="Built for every role" title="The right access from admin to floor supervisor." lead={ROLES_INTRO} />
        <div className="mt-12 grid gap-6 lg:mt-16 lg:grid-cols-3">
          <ul className="grid gap-6 sm:grid-cols-2 lg:col-span-2">
            {ROLES.map((role, i) => {
              const Icon = ROLE_ICONS[i] ?? UserCog;
              return (
                <li key={role.name} className="flex flex-col gap-3 rounded-2xl bg-white p-6 ring-1 ring-slate-900/10">
                  <IconChip>
                    <Icon />
                  </IconChip>
                  <h3 className="text-xl leading-tight font-bold text-slate-900">{role.name}</h3>
                  <p className="text-base leading-relaxed text-pretty text-slate-600">{role.blurb}</p>
                </li>
              );
            })}
          </ul>

          <aside
            aria-labelledby="isolation-title"
            className="flex flex-col gap-4 rounded-2xl bg-(--band) p-6 text-(--band-foreground) ring-1 ring-slate-900/10 lg:p-8"
          >
            <span className="flex size-10 items-center justify-center rounded-lg bg-white/10 text-(--band-accent)" aria-hidden="true">
              <ShieldCheck className="size-5" />
            </span>
            <h3 id="isolation-title" className="text-xl leading-tight font-bold">
              {ISOLATION_CARD.title}
            </h3>
            <p className="text-base leading-relaxed text-pretty text-(--band-muted)">{ISOLATION_CARD.copy}</p>
            <dl className="mt-auto grid grid-cols-2 gap-x-4 gap-y-3 border-t border-white/10 pt-5 text-sm">
              <div>
                <dt className="text-(--band-subtle)">Scoping</dt>
                <dd className="font-medium">Every query, every table</dd>
              </div>
              <div>
                <dt className="text-(--band-subtle)">References</dt>
                <dd className="font-medium">Enforced in the database</dd>
              </div>
              <div>
                <dt className="text-(--band-subtle)">Audit log</dt>
                <dd className="font-medium">Append-only, who/what/when</dd>
              </div>
              <div>
                <dt className="text-(--band-subtle)">Sessions</dt>
                <dd className="font-medium">Revocable per user</dd>
              </div>
            </dl>
          </aside>
        </div>
      </Container>
    </Section>
  );
}
