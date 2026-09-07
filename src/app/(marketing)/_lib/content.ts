/**
 * Landing-page copy (docs/LANDING_REFERENCE.md §2, docs/DESIGN_BRIEF.md §2 voice, §6 copy blocks).
 * Kept in one place so wording changes never touch markup. Everything here describes the shipped product.
 */

export const SITE = {
  name: "ProdPlan",
  title: "ProdPlan — Production planning for discrete manufacturers",
  tagline: "Production planning",
  description:
    "ProdPlan replaces the planning spreadsheet with one live record of customer orders, shift capacity and material stock — with the right access for everyone from admin to floor supervisor.",
} as const;

export type NavItem = { label: string; href: string; description?: string };

export const PRODUCT_MENU: ReadonlyArray<NavItem> = [
  { label: "Orders & import", href: "#features", description: "Customer orders, priorities, CSV import with a validated preview." },
  { label: "Capacity & calendars", href: "#features", description: "Shift calendars, machine efficiency and downtime windows." },
  { label: "Materials & BOM", href: "#features", description: "Bills of materials, scrap allowance and a stock ledger." },
  { label: "Dashboard", href: "#features", description: "Overdue, due-soon, machines down and materials below reorder." },
];

export const NAV_LINKS: ReadonlyArray<NavItem> = [
  { label: "Roles", href: "#roles" },
  { label: "Platform", href: "#platform" },
  { label: "Security", href: "#security" },
  { label: "FAQ", href: "#faq" },
];

export const HERO = {
  pill: "Built for discrete manufacturing plants",
  headlineStart: "Plan production against",
  headlineHighlight: "real capacity,",
  headlineEnd: "not a whiteboard.",
  lead: "ProdPlan replaces the planning spreadsheet with one live record of customer orders, shift capacity and material stock — with the right access for everyone from admin to floor supervisor.",
  trust: ["Multi-tenant", "Role-based access", "Full audit trail"],
  primaryCta: "Create your workspace",
  demoCta: "Explore the live demo",
  signedInCta: "Open dashboard",
  howLink: "See how it works",
  bullets: ["Set up in an afternoon", "Per-plant data isolation", "Works on floor tablets"],
} as const;

export const INDUSTRIES = {
  label: "Built for plants like yours",
  items: [
    { name: "Precision machining", detail: "CNC & turning" },
    { name: "Sheet-metal fabrication", detail: "Laser, press, weld" },
    { name: "Assembly lines", detail: "Sub-assemblies & kits" },
    { name: "Automotive tier-2", detail: "OEM schedules" },
    { name: "Electronics", detail: "Boards & enclosures" },
    { name: "Furniture & fixtures", detail: "Made to order" },
  ],
} as const;

export type FeatureKey = "orders" | "capacity" | "materials" | "dashboard" | "access";

export type Feature = {
  key: FeatureKey;
  tab: string;
  eyebrow: string;
  title: string;
  copy: string;
  bullets: ReadonlyArray<{ lead: string; text: string }>;
  stat: { value: string; label: string; detail: string };
};

export const FEATURES: ReadonlyArray<Feature> = [
  {
    key: "orders",
    tab: "Orders",
    eyebrow: "Orders & import",
    title: "Orders that carry their deadline",
    copy: "Create orders one at a time or import up to 2,000 rows from CSV with a validated preview. Priorities, due dates and status keep every order's position clear to the office and the floor.",
    bullets: [
      { lead: "Validated CSV import:", text: "errors and warnings per row, new customers listed, only valid rows imported." },
      { lead: "Due hints everywhere:", text: "Overdue 3d, Due today, Due in 5d — computed in the plant's timezone." },
      { lead: "Status with rules:", text: "queued, in progress, on hold, completed — legal transitions only, every change audited." },
    ],
    stat: { value: "2,000", label: "rows per CSV import", detail: "each batch stays traceable in the orders list" },
  },
  {
    key: "capacity",
    tab: "Capacity",
    eyebrow: "Capacity & calendars",
    title: "Capacity from real shift calendars",
    copy: "Define shifts, breaks, holidays and machine efficiency once. ProdPlan turns them into available minutes per machine per day, with maintenance windows and breakdowns already subtracted.",
    bullets: [
      { lead: "Shift calendars:", text: "working days, shift times and breaks per calendar, holidays as exceptions." },
      { lead: "Machine efficiency:", text: "net shift minutes × efficiency, per machine, for the next seven days." },
      { lead: "Downtime windows:", text: "maintenance and breakdowns reduce capacity and flag the machine as down now." },
    ],
    stat: { value: "7 days", label: "of capacity per machine", detail: "net shift minutes × efficiency − downtime" },
  },
  {
    key: "materials",
    tab: "Materials & BOM",
    eyebrow: "Materials & BOM",
    title: "Bills of materials that check stock",
    copy: "Every product carries its BOM with scrap allowance and routing. Order detail shows required versus on-hand quantities and flags materials that fall short before work starts.",
    bullets: [
      { lead: "Stock ledger:", text: "receipts, issues, returns and counted adjustments, balance after every movement." },
      { lead: "Never negative:", text: "an issue larger than stock on hand is rejected, not silently recorded." },
      { lead: "Reorder thresholds:", text: "materials at or below reorder are highlighted on the list and the dashboard." },
    ],
    stat: { value: "3 dp", label: "exact quantities in the ledger", detail: "78.120 kg, not “about 80”" },
  },
  {
    key: "dashboard",
    tab: "Dashboard",
    eyebrow: "Dashboard",
    title: "A dashboard for the morning meeting",
    copy: "Open, overdue and due-soon orders, machines down now and materials below reorder — each tile opens the matching filtered list. Recent activity shows who changed what, and when.",
    bullets: [
      { lead: "Live tiles:", text: "counts are computed from the record, not cached from yesterday." },
      { lead: "One click to the list:", text: "every tile links to the orders, machines or materials behind the number." },
      { lead: "Recent activity:", text: "the last changes across the plant with actor, entity and time." },
    ],
    stat: { value: "6", label: "tiles on one screen", detail: "orders, machines, materials — no report to build" },
  },
  {
    key: "access",
    tab: "Access & audit",
    eyebrow: "Access & audit",
    title: "Four roles, enforced on the server",
    copy: "Admin, Planner, Supervisor and Viewer are checked for every page and every action — not just hidden buttons. Every order, stock and master-data change is written to an append-only audit log.",
    bullets: [
      { lead: "Users & roles:", text: "admins invite users, set roles, deactivate accounts and reset passwords." },
      { lead: "Audit trail:", text: "who changed what, from what to what, with a timestamp — on every record." },
      { lead: "Per-plant isolation:", text: "every row carries its workspace; every query is scoped; users belong to one plant." },
    ],
    stat: { value: "44 px", label: "minimum control size", detail: "sized for gloves and floor tablets" },
  },
];

export const STEPS: ReadonlyArray<{ title: string; copy: string }> = [
  {
    title: "Create your plant",
    copy: "Company name, plant timezone and your admin login. A default shift calendar is created with the workspace.",
  },
  {
    title: "Add machines & shift calendars",
    copy: "Work centers, machines with their calendar and efficiency, maintenance windows. Or load demo data to explore first.",
  },
  {
    title: "Load materials, products & BOM",
    copy: "Materials with units and reorder thresholds, products with BOM lines, scrap allowance and routing.",
  },
  {
    title: "Enter or import orders",
    copy: "Create orders or import a CSV: the preview validates every row, then the dashboard shows the plant on one screen.",
  },
];

export const ROLES: ReadonlyArray<{ name: string; label: string; blurb: string; bullets: ReadonlyArray<string> }> = [
  {
    name: "Admin",
    label: "Owns the workspace",
    blurb: "Users and roles, plant timezone, default calendar. Full access to every module and the complete audit trail.",
    bullets: ["Invite users and set roles", "Rename the plant, set its timezone", "Read the full audit log"],
  },
  {
    name: "Planner",
    label: "Runs the planning office",
    blurb: "Creates and edits orders, imports CSV, and maintains customers, products, BOM, materials, machines and calendars.",
    bullets: ["Create, edit and import orders", "Maintain products, BOM and routing", "Record stock movements"],
  },
  {
    name: "Supervisor",
    label: "Runs the floor",
    blurb: "Moves orders through queued, in progress, on hold and completed; records receipts, issues and returns; logs downtime.",
    bullets: ["Update order status on a tablet", "Record receipts, issues and returns", "Log maintenance and breakdowns"],
  },
  {
    name: "Viewer",
    label: "Needs the status, not the controls",
    blurb: "Read-only access to the dashboard and every list — for managers and sales who need to know where an order stands.",
    bullets: ["See the dashboard and every list", "Open any order or material", "No edit controls, ever"],
  },
];

export const SECURITY: ReadonlyArray<{ title: string; copy: string }> = [
  { title: "Encryption in transit & at rest", copy: "Every request runs over TLS; the database is encrypted at rest by the hosting provider." },
  { title: "Per-plant data isolation", copy: "Composite tenant keys on every table and scoped queries — no row is reachable from another plant." },
  { title: "Role-enforced actions", copy: "Every page and server action checks the role on the server. Hidden buttons are never the only guard." },
  { title: "Immutable audit log", copy: "Order, stock and master-data changes are appended with actor, before/after and timestamp — never edited." },
  { title: "Hardened sessions", copy: "Signed __Host- cookies, HttpOnly and Secure, revoked instantly when an admin deactivates a user." },
  { title: "Rate-limited sign-in", copy: "Login, signup and demo access are rate-limited per address so credentials cannot be brute-forced." },
];

export const PRINCIPLE = {
  eyebrow: "ProdPlan design principle",
  lead: "Calm control of the plant.",
  body: "One record for the office and the floor: orders with deadlines, machines with real shift capacity, materials with real stock.",
  chips: ["No spreadsheets", "No double entry", "Every change logged"],
} as const;

export const PLATFORM: ReadonlyArray<{ name: string; label: string; copy: string; bullets: ReadonlyArray<string>; featured?: boolean }> = [
  {
    name: "Planning office",
    label: "Orders & master data",
    copy: "Everything the planner keeps in the spreadsheet today, in one validated record.",
    bullets: ["Customer orders with priority and due date", "CSV import with a validated preview", "Customers, products with BOM and routing", "Order numbering and audit history"],
  },
  {
    name: "Shop floor",
    label: "Machines & stock",
    copy: "What the supervisor needs on a tablet between two shifts.",
    bullets: ["Work centers and machines", "Shift calendars and downtime windows", "Stock receipts, issues and returns", "Order status updates on tablets"],
    featured: true,
  },
  {
    name: "Management",
    label: "Visibility & control",
    copy: "The plant on one screen, with the right access for every person.",
    bullets: ["Live dashboard with linked tiles", "Four roles with enforced permissions", "Complete audit trail", "Per-plant isolation for multi-unit groups"],
  },
];

export const FAQ: ReadonlyArray<{ question: string; answer: string }> = [
  {
    question: "How do I import the orders I already have?",
    answer:
      "Download the CSV template, fill it from your ERP or spreadsheet and upload it — up to 2,000 rows per file. The preview validates every row, lists errors, warnings and new customers, then imports only the valid rows. Each batch stays traceable in the orders list.",
  },
  {
    question: "How is capacity per shift calculated?",
    answer:
      "Each machine follows a shift calendar: working days, shift times and breaks. Net shift minutes are multiplied by the machine's efficiency, and any maintenance or breakdown window that overlaps the shift is subtracted. Holidays are calendar exceptions with zero capacity.",
  },
  {
    question: "What can each role do?",
    answer:
      "Admins manage users, the plant and its default calendar. Planners own orders, imports and master data. Supervisors update order status, record stock movements and log downtime. Viewers read everything and change nothing. Every check runs on the server.",
  },
  {
    question: "How is my plant's data isolated?",
    answer:
      "Every record carries the workspace it belongs to; every query is scoped in the application layer and every cross-table reference is enforced in the database with composite keys. Users belong to exactly one workspace.",
  },
  {
    question: "Does it work on a tablet on the floor?",
    answer:
      "Yes. Controls are at least 44 px, tables collapse to the essential columns on narrow screens and forms keep a sticky action bar, so a supervisor can move an order or record an issue with gloves on.",
  },
  {
    question: "Can I try it without signing up?",
    answer:
      "Yes. “View demo” opens the shared demo plant as an Admin in one click — no password, no form. The demo data is refreshed daily. When you are ready, create your own workspace and load demo data or import your orders.",
  },
];

export const FINAL_CTA = {
  pill: "Start planning today",
  headline: "Ready to replace the whiteboard?",
  line: "Create a workspace, import a CSV, and see your plant on one screen before the next shift.",
  primary: "Create your workspace",
  secondary: "Sign in",
  checks: ["Free to set up", "One-click demo, no password", "Runs on any device"],
} as const;

export const FOOTER = {
  blurb: "One live record of customer orders, shift capacity and material stock for discrete manufacturing plants.",
  product: [
    { label: "Orders & import", href: "#features" },
    { label: "Capacity & calendars", href: "#features" },
    { label: "Materials & BOM", href: "#features" },
    { label: "Dashboard", href: "#features" },
    { label: "How it works", href: "#how-it-works" },
  ],
  company: [
    { label: "Roles", href: "#roles" },
    { label: "Platform", href: "#platform" },
    { label: "Security", href: "#security" },
    { label: "FAQ", href: "#faq" },
    { label: "System status", href: "/api/health" },
  ],
} as const;
