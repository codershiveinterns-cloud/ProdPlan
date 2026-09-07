/**
 * Tenant slug generation (docs/M1_SPEC.md §3). Slugs are internal in M1 but must be unique.
 */
export const SLUG_MAX_LENGTH = 40;
export const SLUG_FALLBACK = "company";
export const SLUG_MAX_ATTEMPTS = 5;

export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "admin",
  "api",
  "app",
  "www",
  "login",
  "signup",
  "settings",
  "demo",
]);

function trimDashes(s: string): string {
  return s.replace(/^-+|-+$/g, "");
}

/**
 * `a-z0-9-` only, ≤ 40 chars, diacritics folded (Über → uber), no leading/trailing/double dashes.
 * Falls back to "company"; reserved words get a "-1" suffix so they never collide with app routes.
 */
export function slugify(name: string): string {
  let slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  slug = trimDashes(slug).slice(0, SLUG_MAX_LENGTH);
  slug = trimDashes(slug);
  if (!slug) slug = SLUG_FALLBACK;
  if (RESERVED_SLUGS.has(slug)) slug = `${slug}-1`;
  return slug;
}

/**
 * Attempt 1 → `base`; attempt n ≥ 2 → `base-n`, truncating the base so the total stays ≤ 40 chars.
 */
export function slugCandidate(base: string, attempt: number): string {
  if (attempt <= 1) return base;
  const suffix = `-${attempt}`;
  const head = trimDashes(base.slice(0, SLUG_MAX_LENGTH - suffix.length));
  return `${head || SLUG_FALLBACK}${suffix}`;
}
