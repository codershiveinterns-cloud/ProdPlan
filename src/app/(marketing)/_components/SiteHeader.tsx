import { NAV_LINKS } from "../_lib/content";
import { MobileMenu } from "./MobileMenu";
import { BrandLockup, CtaLink } from "./ui";

/**
 * Sticky, translucent 64 px top bar: lockup, anchor links (≥ md), account actions and the mobile toggle.
 * `signedIn` comes from the jose-only cookie probe in the layout — a verifying cookie shows "Open dashboard".
 */
export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <BrandLockup href="/" className="-ml-1" />

        <nav aria-label="Site" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="inline-flex h-11 items-center rounded-lg px-3 text-sm font-medium text-stone-700 outline-none transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {signedIn ? (
            <CtaLink href="/dashboard" size="md">
              Open dashboard
            </CtaLink>
          ) : (
            <>
              <CtaLink href="/login" variant="ghost" size="md" className="hidden sm:inline-flex">
                Sign in
              </CtaLink>
              <CtaLink href="/signup" size="md">
                Get started
              </CtaLink>
            </>
          )}
          <MobileMenu signedIn={signedIn} links={NAV_LINKS} />
        </div>
      </div>
    </header>
  );
}
