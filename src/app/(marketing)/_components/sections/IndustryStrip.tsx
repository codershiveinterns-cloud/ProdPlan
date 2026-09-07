import { Armchair, Car, CircuitBoard, Cog, Layers, Scissors } from "lucide-react";

import { INDUSTRIES } from "../../_lib/content";
import { Reveal } from "../Reveal";
import { Container } from "../ui";

const ICONS = [Cog, Scissors, Layers, Car, CircuitBoard, Armchair] as const;

/** Reference "logo strip", honestly: six industry tags, monochrome until hovered (no fake customer logos). */
export function IndustryStrip() {
  return (
    <section aria-label="Industries" className="border-y border-border bg-white py-12">
      <Container>
        <Reveal>
          <p className="text-center text-[11px] font-semibold tracking-[0.18em] text-stone-500 uppercase">{INDUSTRIES.label}</p>
          <ul className="mt-8 grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 lg:grid-cols-6">
            {INDUSTRIES.items.map((item, i) => {
              const Icon = ICONS[i];
              return (
                <li
                  key={item.name}
                  className="group flex items-center justify-center gap-3 text-stone-500 opacity-70 grayscale transition-all duration-300 hover:opacity-100 hover:grayscale-0"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-stone-500 transition-colors duration-300 group-hover:bg-primary-soft group-hover:text-primary">
                    <Icon aria-hidden="true" className="size-4.5" />
                  </span>
                  <span className="leading-tight">
                    <span className="block text-sm font-semibold text-stone-700 transition-colors group-hover:text-foreground">{item.name}</span>
                    <span className="block text-[10px] font-medium tracking-wider text-stone-500 uppercase">{item.detail}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Reveal>
      </Container>
    </section>
  );
}
