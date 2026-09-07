# ProdPlan landing page — reference brief (v2, 2026-09-07)

The client asked for the ProdPlan landing page to match the **structure, motion and responsiveness** of the sister
product's site, **IntakeIQ** (https://intake-iq-rust.vercel.app/), while using a **clearly different theme** that
still looks professional. This document records what was observed on that site (inspected in a browser at 1440 px
and 375 px on 2026-09-07) and how each piece maps to ProdPlan. It overrides `DESIGN_BRIEF.md` §6–§8 for the landing
page (and its §7 roadmap wording is void); `DESIGN_BRIEF.md` §3 palette is superseded by the **v2 teal/amber/stone theme** in §4 below (which the app
also adopts).

Rule of thumb: copy the *anatomy* (section order, rhythm, motion, responsive behaviour, density), never the *skin*
(colours, texture, wording, mock content). No fake customers, ratings, testimonials or prices.

**Production framing (client instruction, 2026-09-07):** ProdPlan is presented everywhere as a complete, shipping
product. Never show the words *milestone*, *prototype*, *beta*, *MVP*, *roadmap*, *coming next*, *planned*,
*phase* or version labels on any user-facing surface (landing page, app UI, emails, docs the client receives).
Describe only capabilities that exist in the product today, and describe them confidently.

---

## 1. Reference anatomy (IntakeIQ, top to bottom)

Container: `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`. Section rhythm: `py-20 sm:py-24`, alternating white /
`slate-50` with `border-t`. Type: Inter only; H1 ≈ 56–64 px bold `tracking-tight`, H2 ≈ 36–44 px, lead 18–20 px.
Buttons: 8 px radius, primary solid brand blue (`#0066ff`), hover darker + `-translate-y-0.5` + shadow.

| # | Section | What it contains | Behaviour / motion |
|---|---|---|---|
| 0 | **Header** (fixed) | Logo mark + wordmark + tiny tagline under it; nav (Product ▾, Industries ▾ dropdowns, Pricing, Security, About Us); right: "Sign In" ghost link + "Launch App →" primary button | `fixed top-0 z-40 bg-white/95 backdrop-blur-md transition-all duration-200`; at top `py-4 border-slate-100`, after ~10 px scroll `py-3 shadow-sm border-slate-200/80`. Nav hidden `< lg`, hamburger opens a full-width panel. |
| 1 | **Hero** | Pill badge with pulsing dot ("Built for …"); H1 on two lines, second line in brand colour; lead paragraph; trust line (★ rating · "Trusted by…"); CTA row: primary "Request a Demo" + outline "▶ See how it works" (anchor to features); three ✓ micro-bullets. Right column: browser-chrome mockup (dark title bar, three dots, URL pill, two tabs) framing an app card: avatar, title/subtitle, progress bar "60% Complete", document rows with REQUIRED/version chips and status badges (Approved / Under Review / Upload File), footer line "Encrypted with TLS 1.3…". | `pt-32 lg:pt-36 pb-20 lg:pb-28`, gradient `from-slate-50 via-white to-white` + `.subtle-grid` (40 px lines at 4 % opacity). Entry: `animate-slide-up` (0.6 s ease-out, 20 px → 0, opacity 0 → 1) on badge/H1/lead/CTAs with staggered `animation-delay`; mockup `animate-fade-in` (0.5 s); the badge dot `animate-pulse`. Below `lg` the columns stack (copy first, mockup second, mockup full width). |
| 2 | **Logo strip** | Uppercase, tracking-widest tiny label "Trusted by…"; six monochrome "logos" (icon + name + descriptor) | `grayscale opacity-70 hover:grayscale-0 hover:opacity-100 transition`; wraps to 2–3 per row on mobile. |
| 3 | **Features** `#features` | Centred pill ("Everything in One Platform"), H2, one-line subtitle; **tab bar of 5 pills** (active = brand fill + white text, inactive = white with border); below: two columns — big mockup card (left) + copy (right: small pill label, H3, paragraph, three bullets with bold lead-ins and ✓ icons, a stat callout "100 % · One portal, unlimited firms", text link "Explore … →") | Tab click swaps mockup + copy with a fade (`animate-fade-in`); tabs scroll horizontally on mobile; columns stack `< lg`. `scroll-mt-24` for anchor offset. |
| 4 | **Industries** `#industries` | Pill, H2, subtitle; **4 cards** (`lg:grid-cols-4`, `md:grid-cols-2`): tiny label pill, H3, paragraph, three ✓ bullets, CTA link with arrow | `bg-slate-50 border-t`; card `hover:-translate-y-1 hover:shadow-card-hover transition duration-300`; icons in tinted squares turn brand on `group-hover`. |
| 5 | **Security** `#security` | Pill, H2, subtitle; **6 cards** (`lg:grid-cols-3`): icon in tinted square, H3, two-line paragraph | Same hover lift; scroll-reveal. |
| 6 | **Quote band** | Dark `slate-900` + `.subtle-grid-dark`; five stars; one large quote (28–32 px, white) with a brand-coloured highlighted phrase; initials avatar; name + role | Reveal on scroll. |
| 7 | **Pricing** `#pricing` | Pill, H2, subtitle; segmented toggle Annual (Save 20 %) / Monthly; **3 cards**, middle "MOST POPULAR" with brand border + shadow + floating badge; big price; "INCLUDED IN …" list with ✓; CTA per card | `bg-slate-50`; toggle switches prices with a fade. |
| 8 | **Founder** `#founder` | Pill, H2, subtitle; one wide dark navy card (rounded-2xl): photo left; quote, bio paragraphs, three "PILLAR 0n" chips and a contact box right | Photo `hover:scale-105` inside `overflow-hidden`; reveal. |
| 9 | **Final CTA** | Dark `brand-950` + grid; pill, H2 (white), paragraph, primary + outline-on-dark CTAs, three ✓ items | — |
| 10 | **Footer** | Newsletter bar (H3, paragraph, email input + Subscribe) then 4 link columns (Product, Industries, Company & Trust, …) + copyright row | `bg-slate-950 text-slate-400`; links `hover:text-white`. |
| — | **Back-to-top** | Floating brand circle with ↑, bottom-right | Appears after scrolling; smooth scroll. |

Motion catalogue (all CSS, no animation library):
```css
@keyframes fadeIn  { 0% {opacity:0} 100% {opacity:1} }                       /* .animate-fade-in  0.5s ease-out forwards */
@keyframes slideUp { 0% {opacity:0; transform:translateY(20px)} 100% {opacity:1; transform:none} } /* .animate-slide-up 0.6s ease-out forwards */
@keyframes pulse   { 50% {opacity:.5} }                                       /* badge dot */
.subtle-grid { background-size:40px 40px; background-image: linear-gradient(90deg, rgba(10,28,48,.04) 1px, transparent 0), linear-gradient(rgba(10,28,48,.04) 1px, transparent 0); }
```
* ~36 elements use an `opacity-0 translate-y-6` → visible toggle driven by an `IntersectionObserver` (scroll
  reveal, `transition duration-700`, with `motion-reduce:transition-none motion-reduce:transform-none`).
* Hover micro-interactions: `-translate-y-0.5` on buttons, `-translate-y-1` on cards, `hover:shadow-lg/xl`,
  colour transitions 200–300 ms, `group-hover` icon tints, logo grayscale → colour.
* Sticky header restyles on scroll; feature tabs and pricing toggle cross-fade content.

Responsive behaviour (375 px): header collapses to logo + hamburger; hero stacks (badge, H1 at ~36 px, lead,
full-width stacked CTAs, bullets, then the mockup card full width, slightly cropped); logo strip wraps; feature tab
bar scrolls horizontally; all grids go single column; cards keep 24 px padding; section padding drops to `py-16`;
back-to-top stays bottom-right; no horizontal overflow.

Mobile addendum (observed at 375 px): the header keeps a compact primary pill ("Demo") next to the hamburger
(`aria-label="Toggle navigation menu"`); H1 ≈ 36 px on two lines with the highlighted second line; lead paragraph
centred; trust line wraps; both CTAs full-width and stacked (primary first); micro-bullets centred; the browser
mockup renders full width with its title bar wrapping the URL; the feature tab pills **wrap into 2–3 rows** (not a
horizontal scroller) and the active pill keeps the brand fill; cards are single-column with 24 px padding; the
back-to-top button stays bottom-right at 44 px.

---

## 2. ProdPlan mapping (same anatomy, honest content)

| # | ProdPlan section | Content |
|---|---|---|
| 0 | Header | Logo mark + "ProdPlan" + tagline "Production planning"; nav: **Product ▾** (Orders & import, Capacity & calendars, Materials & BOM, Dashboard), **Roles**, **Platform**, **Security**, **FAQ**; right: "Sign in" (ghost, `/login`), **"View demo"** (secondary outline button; a POST form calling `demoLoginAction("ADMIN")` from `src/app/(auth)/actions.ts` — see M1_SPEC §6.9) + "Create your workspace →" (primary, `/signup`). When a valid session cookie exists show "Open dashboard →" instead of Sign in. On mobile the header keeps the compact "View demo" pill next to the hamburger (the reference keeps "Demo"). |
| 1 | Hero | Pill: "Built for discrete manufacturing plants" (pulsing dot). H1 (2 lines): "Plan production against **real capacity**, not a whiteboard." — highlight in primary teal. Lead: brief §6 subhead (≤ 30 words). Trust line: "Multi-tenant · Role-based access · Full audit trail" (no stars, no counts). CTAs: "Create your workspace" (primary) + "▶ Explore the live demo" (secondary; POST form → `demoLoginAction("ADMIN")`); a text link "See how it works ↓" under them (→ `#how-it-works`). Bullets: "Set up in an afternoon", "Per-plant data isolation", "Works on floor tablets". Mockup: browser chrome + **ProdPlan dashboard**: 4 KPI tiles (Open orders 24 · Overdue 3 (amber) · Due in 7 days 8 · Materials below reorder 3), "Orders by due date" table with 4 rows (SO-000118 · Vikram Auto · HB-200 · 250 pcs · Due in 2d · IN_PROGRESS, …) using the app's badge colours, a "Machines" strip (CNC-01 ACTIVE · CNC-02 Down · maintenance until 12:00), plus a floating chip "RM-AL6061-BAR · Below reorder · 38.5 kg on hand" that slides in with delay. |
| 2 | Strip | Label "Built for plants like yours"; six industry tags with line icons: Precision machining · Sheet-metal fabrication · Assembly lines · Automotive tier-2 · Electronics · Furniture & fixtures (monochrome, colour on hover). |
| 3 | Features `#features` | Pill "Everything in one workspace"; H2 "From order intake to shop-floor capacity"; tabs: **Orders**, **Capacity**, **Materials & BOM**, **Dashboard**, **Access & audit**. Each: mockup card (orders table with filters · machine 7-day capacity table with downtime · BOM editor with "Buildable from stock" · dashboard tiles · users table with role badges) + copy from `DESIGN_BRIEF.md` §6 feature blocks, three bold-lead bullets, one honest stat callout (e.g. "3 dp · exact quantities in the material ledger", "44 px · every control sized for gloves and tablets"), link "See it in the app →" (`/signup`). |
| — | How it works `#how-it-works` | Four numbered steps (brief §6): Create your plant → Add machines & shift calendars → Load materials, products & BOM → Enter or import orders. Horizontal on desktop with a connecting line, vertical on mobile. |
| 4 | Roles `#roles` | Pill "Built for every role"; H2; 4 cards: Admin, Planner, Supervisor, Viewer — label pill, H3, one paragraph, three ✓ bullets (what they can do), link "Create your workspace →". |
| 5 | Security `#security` | Pill "Security & trust"; H2 "Built like the record of truth it is"; 6 cards: Encryption in transit & at rest · Per-plant data isolation (composite tenant keys + scoped queries) · Role-enforced actions · Immutable audit log · Hardened sessions (`__Host-` cookies, revocation) · Rate-limited sign-in. |
| 6 | Principle band | Dark band; instead of a testimonial: the brand principle in large type — "**Calm control of the plant.** One record for the office and the floor: orders with deadlines, machines with real shift capacity, materials with real stock." — attributed "ProdPlan design principle", with three small facts chips (No spreadsheets · No double entry · Every change logged). |
| 7 | Platform `#platform` | Pill "One platform"; H2 "Everything the plant needs, in one system"; 3 cards, middle one highlighted like the reference's featured card: **Planning office** (customer orders, CSV import, customers, products with BOM and routing, order numbering and audit history), **Shop floor** (work centers, machines, shift calendars, downtime windows, stock movements and status updates on tablets), **Management** (live dashboard, four roles with enforced permissions, complete audit trail, per-plant isolation for multi-unit groups). Each card: label pill, H3, short paragraph, ✓ list, CTA link. No prices, no toggle, no version labels. |
| 8 | FAQ `#faq` | Pill "FAQ"; H2; six `details/summary` items: how to import existing orders (CSV template), how capacity per shift is calculated, what each role can do, how plant data is isolated, whether it works on floor tablets, "Can I try it without signing up?" (yes — the demo plant, one click, no password), how to get started (sign up, load demo data, invite the team). |
| 9 | Final CTA | Dark band; pill "Start planning today"; H2 "Ready to replace the whiteboard?"; paragraph; "Create your workspace" + "Sign in" (outline on dark); three ✓ items (Free to set up · One-click demo, no password · Runs on any device). |
| 10 | Footer | No newsletter. Brand column (logo, one-liner), Product (anchors), Company (Roadmap, Security, FAQ), Account (Sign in, Create workspace); copyright "© 2026 ProdPlan". |
| — | Back-to-top | Same behaviour. |

---

## 3. Motion & responsiveness requirements for the ProdPlan build

* Same three keyframes (fadeIn, slideUp, pulse) plus `floatIn` for the hero chip; staggered `animation-delay`
  (0, 100, 200, 300 ms) on hero children; mockup fades in at 200 ms.
* `Reveal` client component: wraps sections/cards, uses one `IntersectionObserver` (threshold 0.15, rootMargin
  −10 %), toggles `data-visible`; CSS: `[data-reveal]{opacity:0;transform:translateY(24px);transition:opacity .7s,
  transform .7s}` `[data-reveal][data-visible]{opacity:1;transform:none}`; supports `delay` prop; respects
  `prefers-reduced-motion` (no transform, instant).
* Sticky header: `bg-white/90 backdrop-blur` + shadow after 8 px scroll (client hook on `scroll`, passive).
* Feature tabs: client component, keyboard accessible (`role="tablist"`, arrow keys), cross-fade 250 ms.
* Mobile nav: hamburger button (44 px) → panel with the same links + CTAs, closes on link click / Escape.
* Back-to-top: appears after 600 px, smooth scroll, `aria-label`.
* Hover: buttons `-translate-y-0.5` + shadow; cards `-translate-y-1` + shadow; icon tiles tint on `group-hover`.
* Breakpoints: `sm 640 / md 768 / lg 1024 / xl 1280`; hero 2-col from `lg`; features 2-col from `lg`; roles 2-col
  `md`, 4-col `lg`; security 2-col `md`, 3-col `lg`; roadmap 3-col `lg`; type scale H1 `text-4xl sm:text-5xl
  lg:text-6xl`, H2 `text-3xl sm:text-4xl`; CTAs full-width `< sm`; no horizontal scroll at 320–1440 px.
* Performance: no images, no client JS beyond the four small client components; fonts via `next/font`.

---

## 4. Theme v2 — teal · amber · warm stone (distinct from IntakeIQ's blue/slate)

IntakeIQ = pure white + electric blue `#0066ff` + cool slate/navy dark sections + square line grid + Inter.
ProdPlan v2 = **warm stone neutrals + deep teal primary + amber highlight + tinted-teal dark sections + dot grid +
Manrope display / Inter body**. All ratios are WCAG 2.x contrast (computed 2026-09-07).

| Token (shadcn var) | Value | Contrast |
|---|---|---|
| `--background` | stone-50 `#fafaf9` | page ground |
| `--card` / `--popover` | white `#ffffff` | surfaces |
| `--foreground` | stone-900 `#1c1917` | 16.7:1 on stone-50 |
| `--muted-foreground` | stone-600 `#57534e` | 7.3:1 on stone-50 (use stone-500 `#78716c` only ≥ 14 px, 4.8:1) |
| `--muted` / `--accent` (hover surface) | stone-100 `#f5f5f4` | text stone-700 `#44403c` 9.4:1 |
| `--border` | stone-200 `#e7e5e4`; `--input` stone-300 `#d6d3d1` | |
| `--primary` | teal-700 `#0f766e` | white on it 5.47:1 (AA); as link on white 5.47:1 |
| `--primary-hover` | teal-800 `#115e59` | white on it 7.58:1 |
| `--primary-soft` | teal-50 `#f0fdfa`; text teal-900 `#134e4a` | 9.1:1 |
| `--accent-amber` | amber-400 `#fbbf24` (fills; stone-900 text 10.5:1) · amber-700 `#b45309` for amber *text* on white (5.0:1) | |
| `--ring` | teal-600 `#0d9488` | focus ring only (never text on white: 3.7:1) |
| Dark sections | gradient `#0b2b2a → #0f3d3a`, dot grid `rgba(255,255,255,.06)` 24 px; text white (15:1), muted teal-200 `#99f6e4` (12:1), highlight amber-400 (9:1) | |
| Semantic (unchanged, M1_SPEC §5) | success green-600, warning amber-600, danger red-600, info blue-600 — badges keep their fixed meanings | |

Shape & texture: cards `rounded-2xl` (16 px) with `ring-1 ring-stone-900/5` + soft warm shadow
(`0 1px 2px rgb(28 25 23/.04), 0 8px 24px rgb(28 25 23/.06)`); buttons `rounded-lg` (8 px); pills `rounded-full`;
hero/dark backgrounds use a **dot grid** (`radial-gradient(rgb(28 25 23/.08) 1px, transparent 1px)` 24 px) and two
soft teal/amber radial glows, not IntakeIQ's line grid. Display font **Manrope 700/800** for H1/H2, **Inter** for
everything else; numbers in tables `tabular-nums`.

Apply the same tokens in the app (`src/app/globals.css`): `--primary`, `--primary-foreground`, `--ring`,
`--sidebar-primary`, `--chart-1` → teal; neutrals → stone; keep badge colour semantics. Grep the codebase for
hard-coded `indigo-` classes and replace with token classes.

---

## 5. Acceptance checklist

- [ ] Section order and behaviours in §2 present; anchors work with header offset.
- [ ] Hero entry animation + scroll reveals + hover lifts + sticky header + tabs + mobile nav + back-to-top.
- [ ] 375 / 768 / 1024 / 1440 px screenshots: no overflow, readable type, full-width CTAs on mobile.
- [ ] Lighthouse-friendly: no layout shift, no external assets, semantic headings h1→h2→h3, `prefers-reduced-motion`.
- [ ] Copy describes only shipped capabilities; no milestone/roadmap/prototype/beta/version wording anywhere; no fake logos/ratings/testimonials/prices.
- [ ] Theme v2 applied on landing **and** app; contrast ≥ 4.5:1 for text.
