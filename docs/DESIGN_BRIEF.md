# ProdPlan — Design brief (landing page + app theme)

Status: M1 deliverable, written 2026-09-07. Owner: design research track. Binding product facts come from
`docs/M1_SPEC.md`; verified API details from `docs/STACK_NOTES.md`; component props from `docs/UI_KIT.md`. This brief
governs the public landing page (`/` for anonymous visitors) and the visual tokens the app already uses in
`src/app/globals.css`. Brand assets live in `public/brand/**` and `src/app/icon.svg`.

Contents: 1 Research · 2 Brand essence and voice · 3 Palette · 4 Typography · 5 Component styling rules ·
6 Landing page content · 7 Roadmap wording · 8 Imagery and mockups · 9 Logo and brand assets · 10 Implementation
notes · 11 References.

---

## 1. Research

### 1.1 Manufacturing planning / MRP marketing sites

Fetched 2026-09-07. `mrpeasy.com`, `plex.com` and `autodesk.com/…/fusion-operations` blocked direct fetches (403 /
TLS); those rows are compiled from their product pages and search snippets, marked (†).

| Site | Positioning | Hero structure | Feature framing | Visual language | CTAs |
|---|---|---|---|---|---|
| **Katana** (katanamrp.com) | "Know your stock. Everywhere. All the time." — inventory-first "operating system for multi-channel commerce"; manufacturing is one of five pillars. | Headline + subhead + two CTAs; product UI screenshot; G2 / Capterra badge strip and "1,500+ product businesses". | Five verb-led capability cards ("Take control of your inventory in real time", "Get end-to-end manufacturing visibility") each with a "Learn more". Use-case sections by business type with benefit stats. | Clean, teal/blue accents, sans-serif, icon-led cards; screenshots mixed with illustrated workflow diagrams. | "Get started" (primary), "Talk to sales", "Calculate your price". |
| **MRPeasy** (mrpeasy.com) † | "Simple yet powerful manufacturing ERP" for small manufacturers (10–200 employees); transparent pricing, rapid implementation, "2,000 manufacturers". | Headline on segment + product screenshot; free trial, "no card required". | Module lists (production planning, inventory, CRM, procurement) with screenshots per module; heavy use of customer counts. | Light, conservative, blue; dense screenshots. | "Start a free trial". |
| **Fulcrum** (fulcrumpro.com) | "Work together, win together" — cloud manufacturing software with live shop data for "better decisions, faster"; AI assistant ("Archie") up front. | Short headline, one-line subhead, demo CTA, phone number; large UI mockups (job costing, tracking, scheduling). | Punchy claim + benefit pairs ("Paper is dead" / "Equip operators with live information"; "On-time delivery on autopilot"). Icon + title + one line + action link. | Minimal, high-contrast, product-first imagery, no lifestyle photography, strong type hierarchy. | "Demo Fulcrum", "Schedule demo", "Take a tour". |
| **Autodesk Fusion Operations** (ex-Prodsmart) † | "Cloud-connected MES for planning, controlling and monitoring production"; real-time shop-floor tracking via devices. | Corporate Autodesk template: headline, subhead, "Try free"/"Talk to sales", product video. | Capability blocks (production tracking, scheduling, maintenance, traceability, integrations) with dashboard screenshots. | Autodesk black/white with product screenshots; dense corporate layout. | "Try free", "Talk to sales". |
| **Plex** (Rockwell) † | "Connect, automate, track and analyze every aspect of your business" — enterprise smart-manufacturing platform (MES + ERP + quality + APM). | Enterprise hero with platform diagram; analyst badges. | Platform-pillar framing (MES, ERP, quality, supply chain, APM) rather than tasks. | Corporate blue/red, photography of plants. | "Request a demo". |
| **Odoo Manufacturing** (odoo.com/app/manufacturing) | "The future of MRP" — MRP + MES + PLM + quality + maintenance "on one single platform, fast and easy to use". | Headline, subhead, "Start now – It's free" + "Meet an advisor"; screenshots; "28 million users"; customer story. | Outcome sections ("Planning that puts you ahead of schedule", "Become a paperless company") each with a UI screenshot. | Purple brand, playful doodles, illustrated persona "Bob". | "Start now – It's free", "Meet an advisor". |

**Takeaways for ProdPlan**
* Every competitor leads with a product visual; the best (Fulcrum, Katana) use real UI, not illustrations. ProdPlan
  draws its UI with CSS/SVG (§8) so the landing page never goes stale or needs assets.
* Feature framing works best as *claim + concrete mechanism* ("Capacity from real shift calendars → available minutes
  per machine per day"). Avoid platform-pillar language (Plex) and "future of…" hype (Odoo).
* Social proof at this stage cannot be customer counts. Use verifiable product facts (setup time, audit trail,
  isolation) — see §6.4.
* Segment clarity matters: Katana is for product sellers, MRPeasy for 10–200-employee plants. ProdPlan: discrete
  manufacturing plants that plan on spreadsheets today; office planners plus floor supervisors on tablets.
* Nobody in this set has a calm, high-contrast, accessible look. That is the opening: slate + indigo + one amber
  accent, big type, dense but legible tables.

### 1.2 B2B SaaS landing-page practice (2026)

Synthesised from Genesys Growth, Storylane, Flowout, SaaSHero, Growth Spree and Flowtrix (URLs in §11):
* Five-second test: what it is, who it is for, what to do next — above the fold. H1 under ~8–12 words; subhead one
  sentence; primary CTA + low-commitment secondary CTA.
* Hero shows the product (screenshot or drawn UI), ideally demonstrating a transformation, not a static tagline.
* Proof strip directly under the hero. Without customers: specific, verifiable facts or security/architecture
  statements beat generic trust bars.
* Feature sections alternate copy and UI snippet; each block one outcome, one mechanism, one visual.
* "How it works" in 3–4 numbered steps reduces perceived setup risk.
* Role/persona sections address buying committees (owner, planner, supervisor, management).
* FAQ handles objections (scope, import, security, pricing, device support). Footer repeats CTA and links.
* Mobile-first: most landing traffic is mobile; touch targets ≥ 44 px (already the app rule), single-column sections,
  mockups that scale as SVG.
* CTA wording: concrete verbs ("Create your workspace"), friction reducers under the button, no "Book a demo" only.

### 1.3 Accessible palettes for operations products

* WCAG 2.2 SC 1.4.3: 4.5:1 for normal text, 3:1 for large text (≥ 24 px, or ≥ 18.66 px bold); SC 1.4.11: 3:1 for UI
  component boundaries and meaningful graphics.
* Mid-tone greens, ambers and teals fail 4.5:1 with white text — which is why dashboards with those hues put dark
  text on tinted surfaces. Blue/indigo primaries clear the bar with white text (verified in §3.3).
* OKLCH lets us keep perceptual lightness consistent across hues (Tailwind v4 defines its palette in OKLCH; the
  app's tokens already use those exact values). All ratios below were computed from the sRGB hex fallbacks with the
  WCAG 2.x relative-luminance formula ((L1 + 0.05) / (L2 + 0.05)); re-check with any WCAG contrast tool if a
  value changes.

### 1.4 Type pairings on `next/font/google`

Available as variable fonts via `next/font/google` (self-hosted at build, no runtime request to Google): `Inter`,
`Manrope`, `IBM_Plex_Sans`, `Geist`, `Geist_Mono`, `IBM_Plex_Mono`. Considered:
* **Inter + Manrope** — same x-height family, open apertures; Manrope's geometric display weights (700/800) give
  headlines presence without leaving the Inter texture of the app. **Chosen.**
* Geist + Inter — very close in feel; Geist adds little contrast over Inter at display sizes.
* IBM Plex Sans (display) + Inter — "engineered" look but the Plex terminals read technical/IBM rather than plant.
* Single-family Inter — acceptable fallback (`--font-display` falls back to `--font-inter`).

---

## 2. Brand essence and voice

**Essence — "Calm control of the plant."** ProdPlan is the single, trustworthy record a planning office and a shop
floor share: orders with deadlines, machines with real shift capacity, materials with real stock. It replaces the
whiteboard and the spreadsheet, and it is honest about what it does today (M1) and what comes next (scheduling, AI).

**Personality**: precise, unhurried, plain-spoken, practical. A good shift supervisor, not a sales deck.

**Voice rules**
* Concrete over abstract: "available minutes per machine per day", not "optimise capacity".
* Numbers, units and dates everywhere: `250 pcs`, `78.120 kg`, `05 Sep 2026`, `Overdue 3d`.
* Plant vocabulary, matching the app's labels exactly: order, work center, machine, shift calendar, downtime,
  material, BOM, stock on hand, reorder threshold, planner, supervisor.
* Production framing: ProdPlan is a complete, shipping product. Describe only capabilities that exist today, and
  never use the words milestone, prototype, beta, MVP, roadmap, "coming next", planned or phase anywhere a client or
  user can see (landing, app UI, client documents).
* No fake proof: no customer counts, logos, testimonials, ratings or uptime numbers until they are real.
* Sentence case for headings and buttons ("Create your workspace"), no exclamation marks, no emoji.
* British/Indian-neutral English with US spelling of product terms where the app uses them ("work center").

---

## 3. Palette (light theme)

> **Superseded (2026-09-07): palette v2.** To keep ProdPlan visually distinct from the sister product IntakeIQ
> (blue/slate), the theme moved to **deep teal primary (`#0f766e`, hover `#115e59`) · amber highlight
> (`#fbbf24` fills, `#b45309` text) · warm stone neutrals (`#fafaf9` ground, `#1c1917` text, `#57534e` muted,
> `#e7e5e4` borders) · tinted-teal dark sections (`#0b2b2a → #0f3d3a`) · dot-grid texture · Manrope display +
> Inter body**. Exact tokens and contrast ratios: `docs/LANDING_REFERENCE.md` §4. The indigo/slate tables below
> are kept for history only; where they conflict, LANDING_REFERENCE.md wins. Badge colour semantics (M1_SPEC §5)
> are unchanged.

The app already ships these tokens in `src/app/globals.css` (Tailwind v4 OKLCH values). This section documents them
with hex fallbacks and contrast, and adds a small set of **landing-only** tokens. shadcn variable names are kept.

### 3.1 Core tokens → shadcn variables

| Role | shadcn variable(s) | Tailwind | Hex | OKLCH | Contrast / use |
|---|---|---|---|---|---|
| Page background | `--background` | slate-50 | `#f8fafc` | `oklch(0.984 0.003 247.858)` | Page ground. Text tokens below are checked against it. |
| Surface | `--card`, `--popover` | white | `#ffffff` | `oklch(1 0 0)` | Cards, tables, dialogs, inputs. |
| Border | `--border`, `--sidebar-border` | slate-200 | `#e2e8f0` | `oklch(0.929 0.013 255.508)` | Dividers and card rings (1.23:1 on white — decorative; structure is also carried by spacing and `ring-foreground/10`). |
| Input border | `--input` | slate-300 | `#cbd5e1` | `oklch(0.869 0.022 252.894)` | 1.48:1 on white: below SC 1.4.11's 3:1. Accepted M1 trade-off (label + 44 px height + focus ring carry the affordance). If strict 1.4.11 is requested, move to slate-500 `#64748b` (4.76:1). |
| Text | `--foreground`, `--card-foreground`, `--popover-foreground` | slate-900 | `#0f172a` | `oklch(0.208 0.042 265.755)` | 17.9:1 on white, 17.5:1 on slate-50. |
| Muted text | `--muted-foreground` | slate-500 | `#64748b` | `oklch(0.554 0.046 257.417)` | 4.76:1 on white, **4.55:1 on slate-50** — AA for ≥ 14 px only. For 12–13 px secondary text use slate-600 `#475569` `oklch(0.446 0.043 257.281)` (7.58:1). |
| Muted surface | `--muted`, `--accent` (shadcn hover surface) | slate-100 | `#f1f5f9` | `oklch(0.968 0.007 247.896)` | Table headers, hover rows. Text on it: slate-700 `#334155` (9.45:1). |
| Secondary | `--secondary` / `--secondary-foreground` | slate-200 / slate-800 | `#e2e8f0` / `#1e293b` | `oklch(0.929 0.013 255.508)` / `oklch(0.279 0.041 260.031)` | 12.9:1. |
| **Primary** | `--primary`, `--sidebar-primary`, `--chart-1` | indigo-600 | `#4f46e5` | `oklch(0.511 0.262 276.966)` | White on it **6.29:1** (AA normal, AAA large). As link text on white/slate-50: 6.29 / 6.01:1. |
| Primary hover | *(new)* `--primary-hover` | indigo-700 | `#4338ca` | `oklch(0.457 0.24 277.023)` | White on it 7.90:1. The app's `Button` uses `hover:bg-primary/90`; the landing page uses the solid token so hover stays AA on any backdrop. |
| Primary foreground | `--primary-foreground` | white | `#ffffff` | `oklch(1 0 0)` | |
| Primary tint | `--sidebar-accent` (+ landing `--primary-soft`) | indigo-50 | `#eef2ff` | `oklch(0.962 0.018 272.314)` | Active nav, eyebrow chips. Text on it: indigo-700 (7.07:1) or slate-600 (6.78:1). |
| Focus ring | `--ring`, `--sidebar-ring` | indigo-500 | `#6366f1` | `oklch(0.585 0.233 277.117)` | 3 px ring at 50 % alpha (shadcn default); ≥ 3:1 against white as a solid. |
| **Brand accent** | *(new)* `--brand-accent` | amber-400 | `#fbbf24` | `oklch(0.828 0.189 84.429)` | Logo slot, hero underline, marks on dark/indigo surfaces. **3.77:1 on indigo-600**, 10.7:1 for slate-900 text on it. Never as text on white. |
| Brand accent (ink) | *(new)* `--brand-accent-ink` | amber-700 | `#b45309` | `oklch(0.555 0.163 48.998)` | Accent *text* on white (5.02:1) / slate-50 (4.80:1). |
| Success | `--success` / `--success-foreground` | green-600 / white | `#16a34a` | `oklch(0.627 0.194 149.214)` | White on green-600 is **3.30:1 → icons and large text only**. Success *text*: green-700 `#15803d` (5.02:1 on white); on green-50 tint use green-800 `#166534` (6.81:1). |
| Warning | `--warning` / `--warning-foreground` | amber-600 / white | `#d97706` | `oklch(0.666 0.179 58.318)` | White on amber-600 is **3.19:1 → icons/large text only**. Warning *text*: amber-700 (5.02:1); on amber-50 tint use amber-800 `#92400e` (6.84:1) — matches `StatusBadge` ON_HOLD. |
| Danger / destructive | `--danger`, `--destructive` / `-foreground` | red-600 / white | `#dc2626` | `oklch(0.577 0.245 27.325)` | White on red-600 **4.83:1 ✓** (URGENT badge). Danger text: red-700 `#b91c1c` (6.47:1); on red-50 use red-800 (7.60:1). |
| Info | `--info` / `--info-foreground`, `--chart-2` | blue-600 / white | `#2563eb` | `oklch(0.546 0.245 262.881)` | White on blue-600 **5.17:1 ✓**. Info text blue-700 `#1d4ed8` (6.70:1); on blue-50 use blue-800 (8.01:1). Blue is reserved for IN_PROGRESS/info so it never competes with the indigo primary. |
| Charts 3–5 | `--chart-3..5` | green-600, amber-500, red-600 | | as in globals.css | Keep. |
| Radius | `--radius` | | `0.5rem` | | See §5. |

### 3.2 Landing-only tokens (scoped to the landing root, not added to `:root`)

```css
/* src/app/(marketing)/landing.css — or a `.landing` block in the page's CSS module */
.landing {
  --primary-hover: oklch(0.457 0.24 277.023);      /* indigo-700 #4338ca */
  --primary-soft: oklch(0.962 0.018 272.314);      /* indigo-50  #eef2ff */
  --brand-accent: oklch(0.828 0.189 84.429);       /* amber-400  #fbbf24 */
  --brand-accent-ink: oklch(0.555 0.163 48.998);   /* amber-700  #b45309 */
  --band: oklch(0.208 0.042 265.755);              /* slate-900  #0f172a — dark band (roadmap, footer) */
  --band-foreground: #ffffff;                       /* 17.9:1 */
  --band-muted: oklch(0.869 0.022 252.894);        /* slate-300 #cbd5e1 — 12.0:1 on band */
  --band-subtle: oklch(0.704 0.04 256.788);        /* slate-400 #94a3b8 — 6.96:1 on band (small print) */
  --band-link: oklch(0.785 0.115 274.713);         /* indigo-300 #a5b4fc — 8.96:1 on band (indigo-500 fails at 4.0:1) */
  --band-accent: oklch(0.828 0.189 84.429);        /* amber-400 — 10.7:1 on band */
  --font-heading: var(--font-display, var(--font-inter));
}
```

### 3.3 Contrast summary (WCAG 2.x, sRGB fallbacks)

| Pair | Ratio | Verdict |
|---|---|---|
| slate-900 on white / slate-50 | 17.85 / 17.5 | AAA |
| slate-500 on white / slate-50 | 4.76 / 4.55 | AA normal (≥ 14 px) |
| slate-600 on white / slate-50 | 7.58 / 7.24 | AAA |
| white on indigo-600 / indigo-700 | 6.29 / 7.90 | AA normal, AAA large |
| indigo-600 on white / slate-50 / indigo-50 | 6.29 / 6.01 / 5.62 | AA |
| amber-400 on indigo-600 (graphic) | 3.77 | SC 1.4.11 ✓ |
| slate-900 on amber-400 / amber-100 | 10.69 / 16.0 | AAA |
| amber-700 on white; amber-800 on amber-50 | 5.02 / 6.84 | AA |
| white on amber-600 / green-600 | 3.19 / 3.30 | large text + icons only |
| green-700 on white; green-800 on green-50 | 5.02 / 6.81 | AA |
| white on red-600; red-700 on white | 4.83 / 6.47 | AA |
| white on blue-600; blue-700 on white | 5.17 / 6.70 | AA |
| white / slate-300 / slate-400 / indigo-300 / amber-400 on slate-900 | 17.85 / 12.0 / 6.96 / 8.96 / 10.7 | AA–AAA |
| indigo-500 on slate-900 | 4.00 | **fails** — do not use as link colour on the dark band |

Rules: colour never carries meaning alone (badges keep their text label; DueHint keeps "Overdue 3d"). Tinted
surfaces use the 50 shade with 700/800 text and a 200 border — exactly the pattern in `StatusBadge`,
`PriorityBadge`, `MachineStatusBadge`. Solid semantic fills with white text are reserved for URGENT (red-600) and
icon chips.

---

## 4. Typography

| Role | Font | Loading | Weights |
|---|---|---|---|
| Body / UI | **Inter** (already `--font-inter` in `src/app/layout.tsx`) | `Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" })` | 400, 500, 600 (variable) |
| Display (landing headings) | **Manrope** | `Manrope({ subsets: ["latin"], variable: "--font-display", display: "swap", weight: "variable" })` — load in the landing route segment only, set `--font-heading: var(--font-display)` on the landing root | 600, 700, 800 |
| Numbers / codes | system mono (`--font-mono` in globals.css) | none | 400, 500 |

Notes: `next/font/google` self-hosts both families at build time (Netlify build has network). Manrope falls back to
Inter via the token chain, so the app never changes if the landing font fails to load. Both families ship tabular
figures; keep `font-variant-numeric: tabular-nums` on tables and KPI values (already in globals.css).

### 4.1 Scale

Landing (desktop / mobile), line-height, tracking:

| Style | Size | Notes |
|---|---|---|
| Display 1 (hero H1) | 56 / 38 px, lh 1.05, tracking −0.03em, Manrope 800 | max-width 14ch. |
| Display 2 (section H2) | 36 / 28 px, lh 1.1, tracking −0.02em, Manrope 700 | |
| H3 (feature/card titles) | 22 / 20 px, lh 1.25, Manrope 700 | |
| Eyebrow | 12 px, lh 16, uppercase, tracking +0.08em, Inter 600, colour indigo-700 on indigo-50 chip or slate-600 | |
| Lead | 20 / 18 px, lh 1.5, Inter 400, slate-600 | Hero subhead, section intros; max-width 60ch. |
| Body | 16 px, lh 1.6, Inter 400, slate-600 (slate-900 for emphasis) | |
| Small | 14 px, lh 1.45, Inter 400/500 | Proof strip detail, FAQ answers on mobile. |
| Caption | 12–13 px, Inter 500, **slate-600** (not slate-500) | Footnotes, mockup labels. |

App (unchanged, for reference): page title 24/32 semibold; card title 16/24 semibold; body 14/20; table 14;
KPI value 30/36 semibold (`text-3xl`); badge 12 medium.

---

## 5. Component styling rules

* **Radius**: `--radius: 0.5rem`. Buttons, inputs, selects `rounded-lg` (8 px); cards, tables, dialogs `rounded-xl`
  (≈ 11 px); KPI tiles `rounded-xl`; badges `rounded-4xl` (pill); landing mockup frames `rounded-2xl` (≈ 14 px);
  the logo tile is 25 % of its side (8/32).
* **Shadows**: the app is essentially flat — cards/tables use `ring-1 ring-foreground/10` (no drop shadow); buttons
  `shadow-xs`; popovers/dialogs `shadow-md`. Landing mockups may use one long soft shadow
  `shadow-[0_32px_64px_-32px_rgb(15_23_42_/_0.35)]` plus `ring-1 ring-slate-900/10`, nothing else. No glows,
  gradients or glass effects; the one allowed decorative element is a faint dotted grid
  (`radial-gradient(circle, #cbd5e1 1px, transparent 1px)` at 24 px) behind the hero mockup.
* **Density**: 44 px controls everywhere (`h-11`), 36 px `sm` only inside dense desktop tables, table rows 48 px,
  menu items ≥ 40 px, 20 px checkboxes with 44 px hit areas. Landing page buttons: `h-12 px-6 text-base` (48 px).
* **Tables** (`DataTable`): frame `rounded-xl bg-card ring-1 ring-foreground/10`, header `bg-muted` (slate-100) with
  14 px medium slate-600 text (sortable headers turn slate-900 with a 14 px arrow), body rows white, 48 px, sticky
  first column with an inset 1 px border, numbers right-aligned and tabular, monospace for order numbers and codes,
  amber-50 row tint for materials at/below reorder. Mockups reproduce this exactly at 13 px.
* **Badges**: outline pill, `h-5 px-2 text-xs font-medium`, tinted background 50 + border 200 + text 700/800 as in
  `StatusBadge`; only URGENT is a solid red-600 fill with white text. Label text is always present.
* **KPI tiles** (`StatCard`): white, `ring-1 ring-foreground/10`, label 14 px slate-500, value 30 px semibold
  slate-900; `warn` → amber-700 value + amber-200 ring, `danger` → red-700 value + red-200 ring; used only when the
  count is > 0.
* **Sidebar**: white rail, slate-700 items, active item indigo-50 background + indigo-700 text, 44 px rows.
* **Links**: indigo-600 text, underline on hover, `underline-offset-4`. On the dark band: indigo-300.
* **Focus**: shadcn ring (`ring-3 ring-ring/50`) on every interactive element; never remove outlines.
* **Motion**: 150–200 ms ease-out for hover/press; a single fade-up (12 px, 400 ms) for hero content on load;
  respect `prefers-reduced-motion`.

---

## 6. Landing page content

Route: `/` for anonymous visitors (see §10 for the redirect change). Sections in order: Nav · Hero · Proof strip ·
Features (6) · How it works · Built for every role · Coming next · FAQ · Final CTA · Footer.

### 6.1 Navigation

Left: logo lockup (`public/brand/logo.svg` markup inlined). Centre (≥ md): **Product** (#features) ·
**How it works** (#how-it-works) · **Roles** (#roles) · **FAQ** (#faq). Right: **Sign in** (ghost, → `/login`) ·
**Create workspace** (primary, → `/signup`). Below md: hamburger Sheet with the same items; the primary CTA stays
visible in the bar. Height 64 px, `bg-background/90 backdrop-blur`, bottom border slate-200 once scrolled.

### 6.2 Hero

* Eyebrow chip: `Production planning · Milestone 1 preview`
* **Headline (8 words)**: **Plan production against real orders, machines and materials.**
* **Subhead (28 words)**: ProdPlan replaces the planning spreadsheet with one live record of customer orders, shift
  capacity and material stock — with the right access for everyone from admin to floor supervisor.
* Primary CTA: **Create your workspace** → `/signup`. Secondary CTA: **See how it works** → `#how-it-works`
  (outline). Tertiary text link: "Already have a workspace? Sign in".
* Friction reducer (13 px, slate-600, under the buttons): "No installation. Your admin account and a default shift
  calendar are created at signup."
* Visual: Mockup A (planning dashboard, §8.2) on the right at ≥ lg, below the copy on smaller screens.
* Do not claim pricing ("free", "per user") until the client confirms a model; the friction reducer stays factual.

### 6.3 Proof strip (three honest facts)

| Title | Detail |
|---|---|
| **Set up in an afternoon** | Sign up, add machines and materials, import orders from CSV. Or load demo data from the dashboard to explore first. |
| **Every change on record** | Orders, stock movements and master-data edits are audited with who, what and when. |
| **One plant, one workspace** | Each plant's data is isolated at the application and database level; roles are enforced on every action. |

Layout: three columns with a 20 px lucide icon (`Timer`, `History`, `ShieldCheck`) in an indigo-50 chip.

### 6.4 Feature blocks (title · copy · screen to depict)

1. **Orders that carry their deadline** — Create orders or import up to 2,000 rows from CSV with a validated
   preview. Priorities, due dates and status keep every order's position clear. *(24 words)*
   Screen: Orders list — `SO-000118`… rows with `DueHint` ("Overdue 3d" red, "Due today" amber) and
   `StatusBadge`/`PriorityBadge`; a small inset of the import preview chips "38 valid · 2 with errors · 3 new
   customers".
2. **Capacity from real shift calendars** — Define shifts, breaks, holidays and machine efficiency once. ProdPlan
   turns them into available minutes per machine per day, downtime already subtracted. *(21 words)*
   Screen: Machine detail "Capacity — next 7 days" → Mockup B (§8.3).
3. **Machines and work centers, with downtime** — Group machines by work center, mark maintenance windows and
   breakdowns, and see at a glance which machines are running, in maintenance or down right now. *(25 words)*
   Screen: Machines list with `MachineStatusBadge` and the red "Down · Maintenance until 12:00" badge; filter chips
   "Work center: CNC".
4. **Bills of materials that check stock** — Every product carries its BOM with scrap allowance. Order detail shows
   required versus on-hand quantities and flags materials that fall short before work starts. *(24 words)*
   Screen: Order detail "Material requirement" → Mockup C (§8.4).
5. **Stock you can trust** — Receipts, issues, returns and counted adjustments post to a ledger. Stock never goes
   negative, and reorder thresholds highlight materials to buy. *(21 words)*
   Screen: Material detail — on-hand card `64.500 kg` with "Below reorder" badge, ledger rows (Receipt +40.000,
   Issue −18.500, balance after).
6. **A dashboard for the morning meeting** — Open, overdue and due-soon orders, machines down now and materials
   below reorder — each tile opens the matching list. Recent activity shows who changed what. *(24 words)*
   Screen: Dashboard tiles + "Recent activity" (Mockup A cropped to the tiles and activity list).

Layout: alternating two-column rows (copy 5/12, visual 7/12), visuals as SVG/CSS compositions in a
`rounded-2xl` frame. Each block carries an eyebrow naming the app area ("Orders", "Machines", "Materials").

### 6.5 How it works (4 steps)

1. **Create your workspace** — Company name, plant timezone and your admin login. A default "General shift" calendar
   (Mon–Sat, 09:00–17:00) is created with it.
2. **Describe the plant** — Work centers, machines with their shift calendar and efficiency, materials with reorder
   thresholds, products with BOM and routing. Or load demo data to explore first.
3. **Bring in orders** — Create them one at a time or import a CSV: the preview validates every row, lists new
   customers and errors, then imports only the valid rows.
4. **Run the day** — The dashboard shows overdue and due-soon orders, machines down and materials below reorder;
   supervisors move orders through their statuses; every change is audited.

Layout: numbered 1–4 in indigo-600 circles on a connecting slate-200 line; four columns ≥ lg, stacked below.

### 6.6 Built for every role

Intro: "Four roles, enforced on the server for every page and action — not just hidden buttons."

| Role | Blurb |
|---|---|
| **Admin** | Owns the workspace: users and roles, plant timezone, default calendar. Full access to every module and the complete audit trail. |
| **Planner** | Creates and edits orders, imports CSV, maintains customers, products, BOM, materials, machines and calendars, and records stock movements. |
| **Supervisor** | Moves orders through queued, in progress, on hold and completed; records receipts, issues and returns; logs downtime and breakdowns. |
| **Viewer** | Read-only access to the dashboard and every list — for managers and sales who need the status, not the controls. |

Side card "Isolation and audit": "Each plant is its own workspace. Every table carries the workspace id, every
query is scoped, every cross-table reference is enforced by the database, and every order or master-data change is
written to an append-only audit log."

### 6.7 FAQ (6)

1. **Does ProdPlan schedule jobs onto machines?** Not yet. Today it holds orders, capacity and materials so a
   schedule has something reliable to run on. The day-by-day planning board with conflict detection is the next
   milestone.
2. **Can I import orders from my ERP or spreadsheet?** Yes — CSV, up to 2,000 rows per file. Download the template,
   upload, review the validated preview (errors and warnings per row, new customers listed), then import only the
   valid rows. Each batch stays traceable in the orders list.
3. **How is my plant's data kept separate from other tenants?** Every record carries the workspace it belongs to;
   every query is scoped in the application layer and every cross-table reference is enforced in the database.
   Users belong to exactly one workspace.
4. **Who can do what?** Four roles — Admin, Planner, Supervisor, Viewer — checked on the server for every page and
   action. Admins manage users; Planners own orders and master data; Supervisors update status, stock and
   downtime; Viewers read.
5. **Does it work on a tablet on the floor?** Yes. Controls are at least 44 px, tables collapse to the essential
   columns on narrow screens and forms keep a sticky action bar. A dedicated floor app is not part of this release.
6. **What if someone forgets their password?** An Admin resets it from Settings › Users and shares a temporary
   password; the user sets a new one at the next sign-in. Self-service email reset arrives with notifications in a
   later milestone.

### 6.8 Final CTA band

Headline: **Start with the orders you have.** Line: "Create a workspace, import a CSV, and see your plant on one
screen before the next shift." Buttons: **Create your workspace** · **Sign in**. Dark band tokens (§3.2).

### 6.9 Footer

* Column 1: logo lockup (mono, `--band-foreground`), one-liner "Production planning for discrete manufacturers."
* **Product**: Features · How it works · Roles · Coming next · FAQ.
* **Account**: Sign in · Create workspace.
* **Resources**: Documentation (handover docs link, client-hosted) · System status (`/api/health`) · Contact
  (client-provided email — render only when configured).
* **Legal**: Privacy · Terms — render only when the client supplies URLs; never link placeholders.
* Bottom row: "© 2026 ProdPlan · Milestone 1 preview" left, "Built with Next.js and PostgreSQL" right (optional).

---

## 7. Roadmap wording — VOID

Superseded on 2026-09-07 by the client's production-framing instruction (see `LANDING_REFERENCE.md`): do not
mention roadmap, milestones, or future features anywhere user-facing. Present the shipped capabilities only.

## 8. Imagery strategy and mockup compositions

### 8.1 Strategy

No stock photos, no external images, no raster assets. Every visual is drawn in JSX with Tailwind classes and
inline SVG using the app's own tokens, so mockups match the real UI pixel-for-pixel in colour and type and scale
losslessly. Data shown is the demo tenant "Acme Precision Works" (spec §7) with fictional customers. Mockups are
`aria-hidden` decorative graphics with a short `<figcaption>` for screen readers ("Illustration of the ProdPlan
dashboard"). Shared frame: `rounded-2xl bg-background ring-1 ring-slate-900/10` + the single long shadow (§5),
13 px base type, tabular numerals; everything inside is plain `div`/`table` markup — no app components imported
(keeps the landing route free of auth/db code).

### 8.2 Mockup A — Planning dashboard (hero; cropped for feature 6)

Frame 960 × 600 (aspect 16:10), scale with `width: 100%`.
* **Sidebar** 200 px, white, right border slate-200. Top: 32 px mark + "ProdPlan" 14 px semibold + "Acme Precision
  Works" 12 px slate-500. Groups (11 px uppercase slate-500 labels): *Plan* → Dashboard (active: indigo-50 bg,
  indigo-700 text, `LayoutDashboard` icon), Orders; *Master data* → Customers, Products, Materials, Machines, Work
  centers, Shift calendars; *Settings*. Rows 36 px, 13 px slate-700, icons 16 px.
* **Topbar** 48 px, white, bottom border: "Acme Precision Works" 13 px semibold; right: "+ New" button (32 px,
  indigo-600, white text), 28 px avatar circle "AR" (indigo-100 / indigo-700).
* **Content** padding 20 px on slate-50. Title "Dashboard" 18 px semibold; subtitle "Monday, 07 Sep 2026 · Asia/Kolkata"
  12 px slate-500.
* **KPI row** (4 tiles, gap 12, height 88, white, ring slate-900/10, radius 10): label 12 px slate-500, value 24 px
  semibold. `Open orders 24` (icon `ClipboardList`, slate chip) · `Overdue 6` (red-700 value, red-200 ring, red-50
  icon chip `AlertTriangle`) · `Due in 7 days 8` (amber-700 value, amber-200 ring, `CalendarClock`) · `In progress 5`
  (blue-700 value, `Play`).
* **Second row** (2 tiles): `Machines 6` hint "4 active · 1 in maintenance · 1 down now" (`Cog`) · `Materials below
  reorder 3` (amber tone, `Boxes`).
* **"Orders by due date" table** (white card, header slate-100, 13 px, rows 36 px), columns Order # · Customer ·
  Product · Qty · Due · Priority · Status:
  1. `SO-000118` · Bharat Autotech · HB-200 Hydraulic Bracket · 250 pcs · 04 Sep 2026 **Overdue 3d** (red-700) ·
     High (orange pill) · In progress (blue pill)
  2. `SO-000121` · Deccan Motors · GX-40 Gearbox Housing · 120 pcs · 07 Sep 2026 **Due today** (amber-700) · Urgent
     (solid red) · Queued (slate pill)
  3. `SO-000123` · Kaveri Pumps · PF-12 Pump Flange · 400 pcs · 08 Sep 2026 **Due tomorrow** (amber-700) · Normal ·
     Queued
  4. `SO-000119` · Nilgiri Tools · HB-200 Hydraulic Bracket · 180 pcs · 10 Sep 2026 Due in 3d · Normal · On hold
     (amber pill)
  5. `SO-000124` · Ashoka Castings · SL-08 Spindle Lock · 60 pcs · 12 Sep 2026 Due in 5d · Low (outline) · Queued
  Footer link "View all 24" indigo-600 right-aligned.
* **"Recent activity"** (right column, 300 px, white card): three rows, 12 px: "Priya Nair changed order SO-000118
  status Queued → In progress · 12 min ago" · "Arun Rao recorded Issue −18.500 kg RM-AL6061-BAR · 1 h ago" ·
  "Meera Iyer added downtime CNC-02 Maintenance 08 Sep 08:00–12:00 · 3 h ago". Actor names in slate-900 medium,
  entity codes monospace, time slate-500.
* Hero crop: show sidebar + topbar + tiles + first three table rows; feature 6 crop: tiles + activity only.

### 8.3 Mockup B — Capacity strip (feature 2)

Card 640 × 280, white, ring, radius 12, padding 20.
* Header row: `CNC-02` monospace 13 px semibold + "Haas VF-2 · CNC · Two shifts" 12 px slate-500; right: green pill
  "Active" and slate-500 text "Efficiency 90 %".
* Title "Capacity — next 7 days" 14 px semibold; caption "Net shift minutes × efficiency − downtime" 12 px slate-500.
* Seven columns (Mon 07 … Sun 13 Sep), gap 10. Each column: day label 11 px slate-500 (weekday) + 13 px slate-900
  (date); a 120 px-tall vertical track (slate-100, radius 6) filled from the bottom in indigo-500 proportional to
  available minutes on a 900 scale; downtime drawn as an amber-400 segment stacked on top of the indigo fill;
  non-working days show an empty track with a dashed slate-300 border; value under the track 13 px tabular
  (`810`, `570`, `810`, `810`, `0`, `810`, `0`) and a 11 px slate-500 line: "2 shifts", "Maint. 08–12", "2 shifts",
  "2 shifts", "Holiday", "2 shifts", "Non-working".
  Numbers: Day 06:00–14:00 and Evening 14:00–22:00, 30-min break each → 450 + 450 net × 0.90 = 810; Tuesday
  maintenance 08:00–12:00 overlaps the Day shift for 240 min → 810 − 240 = 570; Friday is a `CalendarException`
  (non-working, "Holiday"); Sunday not in `daysOfWeek`.
* Footer: "Week total **3,810 min** · Downtime 240 min · 1 holiday" 12 px; legend dots indigo-500 "Available",
  amber-400 "Downtime", slate-200 "Non-working".

### 8.4 Mockup C — Material shortage alert (feature 4)

Card 560 × 320, white, ring, radius 12, padding 20.
* Header: `SO-000121` monospace + "GX-40 Gearbox Housing · 120 pcs" 13 px; pills "Queued" (slate), "Urgent" (solid
  red-600); right: "Due 07 Sep 2026 · **Due today**" (amber-700).
* Alert bar (amber-50 bg, amber-200 border, radius 8, `TriangleAlert` icon amber-700, 13 px amber-900):
  "2 of 3 materials are short for this quantity · Buildable from unallocated stock: **99 pcs**".
* Title "Material requirement" 14 px semibold, caption "qty × (qty per unit × (1 + scrap %))" slate-500.
* Table (header slate-100, 13 px, 36 px rows), columns Material · Required · On hand · Short by · Status:
  1. `RM-AL6061-BAR` Aluminium bar 6061 · **78.120 kg** (0.620 × 1.05 × 120) · 64.500 kg · **13.620 kg** (red-700)
     · pill "Short" (red-50 / red-700, red-200 border); row tint red-50/40
  2. `HW-M8-BOLT` Bolt M8 × 30 · 489.600 pcs (4 × 1.02 × 120) · 1,200.000 pcs · — · pill "Covered" (green-50 /
     green-700)
  3. `PT-RAL9005` Paint RAL 9005 · 6.180 l (0.050 × 1.03 × 120) · 6.000 l · **0.180 l** (red-700) · pill "Short"
  Buildable = floor(min(64.5 / 0.651, 1200 / 4.08, 6 / 0.0515)) = floor(min(99.08, 294.1, 116.5)) = **99 pcs**.
* Footer note 12 px slate-500: "vs unallocated stock on hand — does not net other open orders".

### 8.5 Small inset graphics

* Import preview chips (feature 1): `38 valid` (green-50/green-700), `2 with errors` (red-50/red-700), `1 warning`
  (amber-50/amber-800), `3 new customers` (indigo-50/indigo-700); button "Import 38 valid rows".
* Machine status row (feature 3): `CNC-01` Active · `CNC-02` Active + red pill "Down · Maintenance until 12:00" ·
  `CNC-03` Maintenance (amber) · `ASM-01` Active · `PNT-01` Inactive (grey).
* Ledger rows (feature 5): "05 Sep 09:12 · Receipt · +40.000 kg · 83.000 kg · PO-4471 · Arun Rao" / "06 Sep 15:40 ·
  Issue · −18.500 kg · 64.500 kg · SO-000118 · Meera Iyer". Positive quantities green-700, negative red-700.

---

## 9. Logo and brand assets

Files (all hand-written SVG, no external assets):

| File | Purpose |
|---|---|
| `public/brand/logo-mark.svg` | Mark only, 32 × 32 viewBox: indigo-600 tile (radius 8), three white "plan rows" stepping right, amber-400 end slot. |
| `public/brand/logo-mark-mono.svg` | Same geometry in `currentColor`, no tile (accent at 55 % opacity). For indigo/slate-900 backgrounds and print. |
| `public/brand/logo.svg` | Horizontal lockup, 140 × 40: mark + "ProdPlan" wordmark (Inter 600, 21 px, −0.5 tracking, slate-900). |
| `src/app/icon.svg` | App icon / favicon (Next.js `app/icon.svg` convention → `<link rel="icon" type="image/svg+xml">`). Identical to the mark. |

**Construction**: 32-unit grid, 7-unit margin, rows 4 units tall with 3-unit gaps (y 7, 14, 21). Row starts step by
3 units (x 7, 10, 13), row ends 19, 25, 19 — a staggered sequence of jobs; the amber slot (x 21–25) completes the
last row and marks "the next job". Reads at 16 px (favicon) as three bars with a warm dot; at 24 px every gap is
≥ 2 px.

**Rules**
* Clear space: half the tile width on every side. Minimum sizes: mark 16 px; lockup 96 px wide.
* Colours: tile indigo-600 `#4f46e5`, rows white, slot amber-400 `#fbbf24`. On coloured backgrounds use the mono
  variant in white or slate-900. Never recolour the slot red or green (it would read as a status).
* The in-app `Brand` (`src/components/layout/Brand.tsx`) and the auth `Wordmark` currently render a lucide `Factory`
  in an indigo tile; swap the icon for the inline mark paths (same 36/40 px tile) so app and site match — see §10.
* Wordmark in `logo.svg` is live `<text>` (Inter with a system fallback). Where a font-independent file is required
  (email signatures, print), export outlines once from Figma/Inkscape; the app never needs it because the
  wordmark is rendered as HTML text.

---

## 10. Implementation notes for the landing page owner

* `src/app/page.tsx` currently `redirect("/dashboard")` unconditionally. `src/proxy.ts` passes `/` through for
  everyone (`LANDING_PATHS`) and expects the page to decide: call `getSession()` from `src/lib/auth/session.ts`,
  `redirect("/dashboard")` when it returns `{ status: "ok" }`, otherwise render the landing content. That makes the
  route dynamic (cookie read), which is fine — the marketing markup itself needs no db access. A `revoked` session
  should also see the landing page (the app layout handles `/logout?reason=revoked` once they click Sign in).
* Fonts: add `Manrope` in the landing route segment (or root layout) with `variable: "--font-display"`, put the
  variable class on the landing root along with `.landing` (§3.2). The `font-heading` utility resolves
  `var(--font-heading)` at use time, so the override is scoped.
* Icons: lucide only (`Timer`, `History`, `ShieldCheck`, `ClipboardList`, `CalendarClock`, `Cog`, `Boxes`,
  `Package`, `LayoutDashboard`, `TriangleAlert`, `Play`).
* Metadata: title "ProdPlan — Production planning for discrete manufacturers", description = hero subhead, OG image
  optional (`opengraph-image.tsx` drawing the mark + headline with `ImageResponse`).
* Anchors: `#features`, `#how-it-works`, `#roles`, `#coming-next`, `#faq`. Nav links use them; skip-link first.
* Accessibility: mockups `aria-hidden` with `<figcaption>`; headings in order; all colour pairs from §3.3; buttons
  48 px; `prefers-reduced-motion` respected.
* Do not import app components (`DataTable`, `StatCard`, …) into the landing page; recreate the look with plain
  markup (keeps the route free of server-only modules and lets it be static).
* `src/app/favicon.ico` (Next starter default) still exists; delete it or replace it with an ICO rendered from
  `icon.svg` so both `<link rel="icon">` tags point at the brand.

---

## 11. References

Competitors
* Katana — https://katanamrp.com/
* MRPeasy — https://www.mrpeasy.com/ (homepage blocked; product page https://www.mrpeasy.com/manufacturing-erp-software/ and press coverage https://www.manufacturing.net/mrpeasy/news/22942433/mrpeasy-empowers-2000-manufacturers-to-grow-with-easytouse-erp-software)
* Fulcrum — https://www.fulcrumpro.com/
* Autodesk Fusion Operations (formerly Prodsmart) — https://www.autodesk.com/products/fusion-operations/overview (blocked; https://www.autodesk.com/campaigns/fusion-operations/production-scheduling-software, https://softwareconnect.com/reviews/fusion-operations-mes/)
* Plex, by Rockwell Automation — https://www.plex.com/ (TLS error; https://plex.rockwellautomation.com/en-us.html, https://www.rockwellautomation.com/en-us/products/software/factorytalk/operationsuite/mes/plex-smart-manufacturing-platform.html)
* Odoo Manufacturing — https://www.odoo.com/app/manufacturing

Landing-page practice
* Genesys Growth, "Best Practices for Designing B2B SaaS Landing Pages – 2026" — https://genesysgrowth.com/blog/designing-b2b-saas-landing-pages
* Storylane, "SaaS Landing Pages Best Practices" — https://www.storylane.io/blog/saas-landing-pages-best-practices
* Flowout, "B2B SaaS Landing Page Best Practices" — https://www.flowout.com/blog/landing-page-best-practices
* SaaSHero, "High-Converting SaaS Landing Pages: 2026" — https://www.saashero.net/design/enterprise-landing-page-design-2026/
* Growth Spree, "B2B SaaS Landing Page Benchmarks" — https://www.growthspreeofficial.com/blogs/b2b-saas-landing-page-best-practices-demo-conversion-2026
* Flowtrix, "B2B Landing Page Design: 12 Examples" — https://www.flowtrix.co/blogs/12-b2b-landing-page-design-examples-for-2026

Colour and accessibility
* W3C WCAG 2.2, SC 1.4.3 Contrast (Minimum) and SC 1.4.11 Non-text Contrast — https://www.w3.org/TR/WCAG22/
* LogRocket, "OKLCH in CSS: consistent, accessible color palettes" — https://blog.logrocket.com/oklch-css-consistent-accessible-color-palettes
* Accessible Palette (OKLCH scales with contrast grading) — https://accessiblepalette.com/
* InclusiveColors (WCAG palette builder for Tailwind/CSS) — https://www.inclusivecolors.com/
* AdminLTE, "Best admin dashboard color schemes" (why non-blue primaries need dark text) — https://adminlte.io/blog/best-admin-dashboard-color-schemes/
* Tailwind CSS v4 colour scale (source of the OKLCH values) — https://tailwindcss.com/docs/colors

Typography
* Next.js, "Font Optimization" (`next/font/google`) — https://nextjs.org/docs/app/getting-started/fonts
* Google Fonts: Inter — https://fonts.google.com/specimen/Inter · Manrope — https://fonts.google.com/specimen/Manrope · IBM Plex Sans — https://fonts.google.com/specimen/IBM+Plex+Sans · Geist — https://fonts.google.com/specimen/Geist
* Brand Generator, "SaaS Typography Guide — best fonts & pairings" — https://brand-generator.com/blog/typography-guide-saas
* BonFX, "What fonts go with Inter?" — https://bonfx.com/what-fonts-go-with-inter/
