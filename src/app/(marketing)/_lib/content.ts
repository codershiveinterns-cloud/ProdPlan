/**
 * Landing-page copy (docs/DESIGN_BRIEF.md §6–§7). Kept in one place so wording changes never touch markup.
 * Everything here describes the shipped product (docs/LANDING_REFERENCE.md: production framing, no roadmap wording).
 */

export const SITE = {
  name: "ProdPlan",
  title: "ProdPlan — Production planning for discrete manufacturers",
  tagline: "Production planning for discrete manufacturers.",
} as const;

export const NAV_LINKS: ReadonlyArray<{ label: string; href: string }> = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Roles", href: "#roles" },
  { label: "FAQ", href: "#faq" },
];

export const HERO = {
  eyebrow: "Production planning for discrete manufacturers",
  headline: "Plan production against real orders, machines and materials.",
  subhead:
    "ProdPlan replaces the planning spreadsheet with one live record of customer orders, shift capacity and material stock — with the right access for everyone from admin to floor supervisor.",
  primaryCta: "Create your workspace",
  secondaryCta: "See how it works",
  signedInCta: "Open dashboard",
  tertiary: { prefix: "Already have a workspace?", label: "Sign in" },
  frictionReducer: "No installation. Your admin account and a default shift calendar are created at signup.",
} as const;

export const PROOF_POINTS: ReadonlyArray<{ title: string; detail: string }> = [
  {
    title: "Set up in an afternoon",
    detail:
      "Sign up, add machines and materials, import orders from CSV. Or load demo data from the dashboard to explore first.",
  },
  {
    title: "Every change on record",
    detail: "Orders, stock movements and master-data edits are audited with who, what and when.",
  },
  {
    title: "One plant, one workspace",
    detail:
      "Each plant's data is isolated at the application and database level; roles are enforced on every action.",
  },
];

export type FeatureKey = "orders" | "capacity" | "machines" | "bom" | "stock" | "dashboard";

export const FEATURES: ReadonlyArray<{ key: FeatureKey; area: string; title: string; copy: string }> = [
  {
    key: "orders",
    area: "Orders",
    title: "Orders that carry their deadline",
    copy: "Create orders or import up to 2,000 rows from CSV with a validated preview. Priorities, due dates and status keep every order's position clear.",
  },
  {
    key: "capacity",
    area: "Shift calendars",
    title: "Capacity from real shift calendars",
    copy: "Define shifts, breaks, holidays and machine efficiency once. ProdPlan turns them into available minutes per machine per day, downtime already subtracted.",
  },
  {
    key: "machines",
    area: "Machines",
    title: "Machines and work centers, with downtime",
    copy: "Group machines by work center, mark maintenance windows and breakdowns, and see at a glance which machines are running, in maintenance or down right now.",
  },
  {
    key: "bom",
    area: "Products & BOM",
    title: "Bills of materials that check stock",
    copy: "Every product carries its BOM with scrap allowance. Order detail shows required versus on-hand quantities and flags materials that fall short before work starts.",
  },
  {
    key: "stock",
    area: "Materials",
    title: "Stock you can trust",
    copy: "Receipts, issues, returns and counted adjustments post to a ledger. Stock never goes negative, and reorder thresholds highlight materials to buy.",
  },
  {
    key: "dashboard",
    area: "Dashboard",
    title: "A dashboard for the morning meeting",
    copy: "Open, overdue and due-soon orders, machines down now and materials below reorder — each tile opens the matching list. Recent activity shows who changed what.",
  },
];

export const STEPS: ReadonlyArray<{ title: string; copy: string }> = [
  {
    title: "Create your workspace",
    copy: "Company name, plant timezone and your admin login. A default “General shift” calendar (Mon–Sat, 09:00–17:00) is created with it.",
  },
  {
    title: "Describe the plant",
    copy: "Work centers, machines with their shift calendar and efficiency, materials with reorder thresholds, products with BOM and routing. Or load demo data to explore first.",
  },
  {
    title: "Bring in orders",
    copy: "Create them one at a time or import a CSV: the preview validates every row, lists new customers and errors, then imports only the valid rows.",
  },
  {
    title: "Run the day",
    copy: "The dashboard shows overdue and due-soon orders, machines down and materials below reorder; supervisors move orders through their statuses; every change is audited.",
  },
];

export const ROLES_INTRO = "Four roles, enforced on the server for every page and action — not just hidden buttons.";

export const ROLES: ReadonlyArray<{ name: string; blurb: string }> = [
  {
    name: "Admin",
    blurb:
      "Owns the workspace: users and roles, plant timezone, default calendar. Full access to every module and the complete audit trail.",
  },
  {
    name: "Planner",
    blurb:
      "Creates and edits orders, imports CSV, maintains customers, products, BOM, materials, machines and calendars, and records stock movements.",
  },
  {
    name: "Supervisor",
    blurb:
      "Moves orders through queued, in progress, on hold and completed; records receipts, issues and returns; logs downtime and breakdowns.",
  },
  {
    name: "Viewer",
    blurb: "Read-only access to the dashboard and every list — for managers and sales who need the status, not the controls.",
  },
];

export const ISOLATION_CARD = {
  title: "Isolation and audit",
  copy: "Each plant is its own workspace. Every table carries the workspace id, every query is scoped, every cross-table reference is enforced by the database, and every order or master-data change is written to an append-only audit log.",
} as const;

export const FAQ: ReadonlyArray<{ question: string; answer: string }> = [
  {
    question: "Does ProdPlan schedule jobs onto machines?",
    answer:
      "Not yet. Today it holds orders, capacity and materials so a schedule has something reliable to run on. Scheduling builds on this same record, so nothing is entered twice.",
  },
  {
    question: "Can I import orders from my ERP or spreadsheet?",
    answer:
      "Yes — CSV, up to 2,000 rows per file. Download the template, upload, review the validated preview (errors and warnings per row, new customers listed), then import only the valid rows. Each batch stays traceable in the orders list.",
  },
  {
    question: "How is my plant's data kept separate from other tenants?",
    answer:
      "Every record carries the workspace it belongs to; every query is scoped in the application layer and every cross-table reference is enforced in the database. Users belong to exactly one workspace.",
  },
  {
    question: "Who can do what?",
    answer:
      "Four roles — Admin, Planner, Supervisor, Viewer — checked on the server for every page and action. Admins manage users; Planners own orders and master data; Supervisors update status, stock and downtime; Viewers read.",
  },
  {
    question: "Does it work on a tablet on the floor?",
    answer:
      "Yes. Controls are at least 44 px, tables collapse to the essential columns on narrow screens and forms keep a sticky action bar.",
  },
  {
    question: "What if someone forgets their password?",
    answer:
      "An Admin resets it from Settings › Users and shares a temporary password; the user sets a new one at the next sign-in. Admins can reset any password from Settings in seconds.",
  },
];

export const FINAL_CTA = {
  headline: "Start with the orders you have.",
  line: "Create a workspace, import a CSV, and see your plant on one screen before the next shift.",
} as const;

export const FOOTER = {
  product: [
    { label: "Features", href: "#features" },
    { label: "How it works", href: "#how-it-works" },
    { label: "Roles", href: "#roles" },
    
    { label: "FAQ", href: "#faq" },
  ],
  resources: [{ label: "System status", href: "/api/health" }],
  builtWith: "Built with Next.js and PostgreSQL",
  milestone: "Production planning",
} as const;
