import { FOOTER, SITE } from "../_lib/content";
import { BrandLockup, Container } from "./ui";
import { appHref } from "../_lib/static";

/** Dark footer: brand column, Product, Company, Account; copyright row. Only real destinations are linked. */
export function SiteFooter({ signedIn, year }: { signedIn: boolean; year: number }) {
  const heading = "text-[11px] font-semibold tracking-[0.14em] text-(--band-subtle) uppercase";
  const link =
    "inline-flex min-h-9 items-center rounded-sm text-sm text-(--band-muted) outline-none transition-colors hover:text-white focus-visible:ring-3 focus-visible:ring-white/40";

  const account = signedIn
    ? [{ label: "Open dashboard", href: "/dashboard" }]
    : [
        
        { label: "Create your workspace", href: appHref("/signup") },
      ];

  return (
    <footer className="bg-[#07201f] text-white">
      <Container className="py-14 sm:py-16">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div className="max-w-xs">
            <BrandLockup href="/" mono tagline={SITE.tagline} className="-ml-1 text-white" />
            <p className="mt-4 text-sm leading-relaxed text-(--band-muted)">{FOOTER.blurb}</p>
          </div>

          <nav aria-labelledby="footer-product">
            <h2 id="footer-product" className={heading}>
              Product
            </h2>
            <ul className="mt-3 flex flex-col">
              {FOOTER.product.map((l) => (
                <li key={l.label}>
                  <a href={l.href} className={link}>
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="footer-company">
            <h2 id="footer-company" className={heading}>
              Company
            </h2>
            <ul className="mt-3 flex flex-col">
              {FOOTER.company.map((l) => (
                <li key={l.label}>
                  <a href={l.href} className={link}>
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="footer-account">
            <h2 id="footer-account" className={heading}>
              Account
            </h2>
            <ul className="mt-3 flex flex-col">
              {account.map((l) => (
                <li key={l.label}>
                  <a href={l.href} className={link}>
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-white/10 pt-6 text-sm text-(--band-subtle) sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} ProdPlan. All rights reserved.</p>
          <p>Production planning for discrete manufacturers.</p>
        </div>
      </Container>
    </footer>
  );
}
