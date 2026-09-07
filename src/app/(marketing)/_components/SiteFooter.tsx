import { FOOTER, SITE } from "../_lib/content";
import { BrandLockup, Container, TextLink } from "./ui";

/**
 * Dark-band footer (brief §6.9). Only real destinations are linked: documentation, contact and legal pages are
 * omitted until the client supplies URLs — never a placeholder link.
 */
export function SiteFooter({ signedIn, year }: { signedIn: boolean; year: number }) {
  const linkClass = "inline-flex min-h-11 items-center py-2 text-sm";
  return (
    <footer className="marketing-band text-(--band-foreground)">
      <Container className="py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="max-w-xs">
            <BrandLockup href="/" mono className="-ml-1 text-white" />
            <p className="mt-3 text-sm leading-relaxed text-(--band-muted)">{SITE.tagline}</p>
          </div>

          <nav aria-labelledby="footer-product">
            <h2 id="footer-product" className="text-xs font-semibold tracking-[0.08em] text-(--band-subtle) uppercase">
              Product
            </h2>
            <ul className="mt-2 flex flex-col">
              {FOOTER.product.map((link) => (
                <li key={link.href}>
                  <TextLink href={link.href} tone="dark" className={linkClass}>
                    {link.label}
                  </TextLink>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="footer-account">
            <h2 id="footer-account" className="text-xs font-semibold tracking-[0.08em] text-(--band-subtle) uppercase">
              Account
            </h2>
            <ul className="mt-2 flex flex-col">
              {signedIn ? (
                <li>
                  <TextLink href="/dashboard" tone="dark" className={linkClass}>
                    Open dashboard
                  </TextLink>
                </li>
              ) : (
                <>
                  <li>
                    <TextLink href="/login" tone="dark" className={linkClass}>
                      Sign in
                    </TextLink>
                  </li>
                  <li>
                    <TextLink href="/signup" tone="dark" className={linkClass}>
                      Create workspace
                    </TextLink>
                  </li>
                </>
              )}
            </ul>
          </nav>

          <nav aria-labelledby="footer-resources">
            <h2 id="footer-resources" className="text-xs font-semibold tracking-[0.08em] text-(--band-subtle) uppercase">
              Resources
            </h2>
            <ul className="mt-2 flex flex-col">
              {FOOTER.resources.map((link) => (
                <li key={link.href}>
                  <TextLink href={link.href} tone="dark" className={linkClass}>
                    {link.label}
                  </TextLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-white/10 pt-6 text-sm text-(--band-subtle) sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {SITE.name} · {FOOTER.milestone}
          </p>
          <p>{FOOTER.builtWith}</p>
        </div>
      </Container>
    </footer>
  );
}
