/**
 * Static demo datasets for `seedDemoData()` (docs/M1_SPEC.md §7). Everything here is relative: day offsets are
 * applied to "today" in the tenant timezone, quantities are plain numbers. Two variants exist:
 *
 *  - `acme`  — the full plant (6 customers, 3 work centers, 6 machines, 12 materials, 5 products, 24 orders …).
 *  - `beta`  — a small second plant that reuses SKU `HB-200` and a customer name from Acme to prove that business
 *              keys are unique per tenant only.
 */
import type { DowntimeType, MachineStatus, OrderPriority, OrderStatus } from "@/generated/prisma/enums";

export type DemoVariant = "acme" | "beta";

export type DemoCustomer = { name: string; code: string; email?: string; phone?: string; notes?: string };
export type DemoWorkCenter = { code: string; name: string; description?: string };
export type DemoShift = { name: string; startTime: string; endTime: string; daysOfWeek: number[]; breakMinutes: number };
export type DemoCalendar = { name: string; shifts: DemoShift[] };
export type DemoMachine = {
  code: string;
  name: string;
  workCenter: string;
  calendar: string;
  status: MachineStatus;
  efficiencyPercent: number;
  ratedCapacityPerShift?: number;
  capacityUnit?: string;
  notes?: string;
};
export type DemoMaterial = {
  code: string;
  name: string;
  unit: string;
  reorderThreshold: number;
  reorderLeadTimeDays: number;
  unitCost?: number;
  supplier?: string;
  /** Two RECEIPT movements (older, newer). The seed derives stockOnHand from receipts minus issues. */
  receipts: [number, number];
};
export type DemoBomLine = { material: string; quantityPerUnit: number; scrapPercent: number; note?: string };
export type DemoOperation = { workCenter: string; setupMinutes: number; runMinutesPerUnit: number; machine?: string };
export type DemoProduct = {
  sku: string;
  name: string;
  description?: string;
  unit: string;
  bom: DemoBomLine[];
  routing: DemoOperation[];
};
export type DemoOrder = {
  product: string;
  customer: string;
  quantity: number;
  priority: OrderPriority;
  /** Due date = today + dueOffset (negative = past). */
  dueOffset: number;
  status: OrderStatus;
  /** createdAt = today − createdDaysAgo (always ≥ 1 so it is in the past). */
  createdDaysAgo: number;
  /** QUEUED → IN_PROGRESS happened today − startedDaysAgo (IN_PROGRESS and COMPLETED orders). */
  startedDaysAgo?: number;
  /** The final transition (ON_HOLD / COMPLETED / CANCELLED) happened today − changedDaysAgo. */
  changedDaysAgo?: number;
  customerPoRef?: string;
  notes?: string;
  /** Reason recorded on the ON_HOLD / CANCELLED transition. */
  reason?: string;
};
export type DemoDowntime = {
  machine: string;
  type: DowntimeType;
  reason: string;
  /** Local wall-clock window on a day relative to today … */
  day?: { offset: number; start: string; end: string };
  /** … or a window relative to the seed instant (minutes), used for the "down now" demo. */
  relativeMinutes?: { start: number; end: number };
  /** createdAt = today − createdDaysAgo (defaults to the window's own day). */
  createdDaysAgo?: number;
};

export type DemoDataset = {
  customers: DemoCustomer[];
  workCenters: DemoWorkCenter[];
  /** The first calendar becomes the tenant default. "General shift" is created only when the tenant lacks it. */
  calendars: DemoCalendar[];
  machines: DemoMachine[];
  materials: DemoMaterial[];
  products: DemoProduct[];
  orders: DemoOrder[];
  downtime: DemoDowntime[];
  /** Note on the non-working exception placed on the first Friday after today + 7. */
  holidayNote: string;
};

export const TWO_SHIFTS_CALENDAR: DemoCalendar = {
  name: "Two shifts",
  shifts: [
    { name: "Morning", startTime: "06:00", endTime: "14:00", daysOfWeek: [1, 2, 3, 4, 5, 6], breakMinutes: 30 },
    { name: "Evening", startTime: "14:00", endTime: "22:00", daysOfWeek: [1, 2, 3, 4, 5, 6], breakMinutes: 30 },
  ],
};

export const GENERAL_SHIFT_CALENDAR: DemoCalendar = {
  name: "General shift",
  shifts: [{ name: "Day", startTime: "09:00", endTime: "17:00", daysOfWeek: [1, 2, 3, 4, 5, 6], breakMinutes: 60 }],
};

/** Customer shared by both demo tenants (same name, different tenant → allowed by @@unique([tenantId, name])). */
export const SHARED_CUSTOMER_NAME = "Pune Gear Works";
/** SKU shared by both demo tenants (@@unique([tenantId, sku])). */
export const SHARED_SKU = "HB-200";

// ---------------------------------------------------------------------------------------------------------------
// Acme Precision Works
// ---------------------------------------------------------------------------------------------------------------

const ACME: DemoDataset = {
  customers: [
    { name: "Sundaram Auto Components", code: "SAC", email: "purchase@sundaramauto.example", phone: "+91 44 2345 6780" },
    { name: "Mahavir Hydraulics Ltd", code: "MHL", email: "po@mahavirhydraulics.example", phone: "+91 79 2658 1140" },
    { name: SHARED_CUSTOMER_NAME, code: "PGW", email: "orders@punegear.example", phone: "+91 20 6720 3390" },
    { name: "Indo-Nippon Drives", code: "IND", email: "scm@indonippon.example", phone: "+91 80 4112 7788" },
    { name: "Rajdhani Tractors Ltd", code: "RTL", email: "buying@rajdhanitractors.example", phone: "+91 11 4567 2210" },
    { name: "Arjun Earthmovers", code: "AEM", email: "procurement@arjunearth.example", phone: "+91 22 6789 4455", notes: "Ship to Bhiwandi yard; inspection report required with every dispatch." },
  ],
  workCenters: [
    { code: "CNC", name: "CNC machining", description: "Vertical mills and turning centres" },
    { code: "ASM", name: "Assembly", description: "Sub-assembly and final assembly benches" },
    { code: "PNT", name: "Paint shop", description: "Powder coating and priming" },
  ],
  calendars: [TWO_SHIFTS_CALENDAR, GENERAL_SHIFT_CALENDAR],
  machines: [
    { code: "CNC-01", name: "Haas VF-2 vertical mill", workCenter: "CNC", calendar: "Two shifts", status: "ACTIVE", efficiencyPercent: 92, ratedCapacityPerShift: 180, capacityUnit: "pcs" },
    { code: "CNC-02", name: "DMG Mori NLX 2500 lathe", workCenter: "CNC", calendar: "Two shifts", status: "ACTIVE", efficiencyPercent: 85, ratedCapacityPerShift: 150, capacityUnit: "pcs" },
    { code: "CNC-03", name: "Mazak VCN-530C", workCenter: "CNC", calendar: "Two shifts", status: "MAINTENANCE", efficiencyPercent: 100, ratedCapacityPerShift: 200, capacityUnit: "pcs", notes: "Spindle bearing replacement in progress; back on line after the service visit." },
    { code: "ASM-01", name: "Assembly line A", workCenter: "ASM", calendar: "General shift", status: "ACTIVE", efficiencyPercent: 95 },
    { code: "ASM-02", name: "Assembly bench B", workCenter: "ASM", calendar: "General shift", status: "ACTIVE", efficiencyPercent: 90 },
    { code: "PNT-01", name: "Powder coating booth", workCenter: "PNT", calendar: "Two shifts", status: "ACTIVE", efficiencyPercent: 100, ratedCapacityPerShift: 400, capacityUnit: "pcs" },
  ],
  materials: [
    { code: "RM-AL6061-BAR", name: "Aluminium 6061 bar stock", unit: "kg", reorderThreshold: 150, reorderLeadTimeDays: 10, unitCost: 420, supplier: "Deccan Metals", receipts: [800, 500] },
    { code: "RM-SS304-SHT", name: "Stainless steel 304 sheet 2 mm", unit: "kg", reorderThreshold: 100, reorderLeadTimeDays: 14, unitCost: 310, supplier: "Western Steel Traders", receipts: [120, 20] },
    { code: "RM-MS-PLATE", name: "Mild steel plate 6 mm", unit: "kg", reorderThreshold: 200, reorderLeadTimeDays: 7, unitCost: 78, supplier: "Western Steel Traders", receipts: [900, 400] },
    { code: "RM-CI-CAST", name: "Cast iron housing blank", unit: "pcs", reorderThreshold: 40, reorderLeadTimeDays: 21, unitCost: 950, supplier: "Kolhapur Foundry Co", receipts: [200, 80] },
    { code: "HW-M8-BOLT", name: "M8 × 25 hex bolt, zinc plated", unit: "pcs", reorderThreshold: 500, reorderLeadTimeDays: 5, unitCost: 3.2, supplier: "Shakti Fasteners", receipts: [6000, 3000] },
    { code: "HW-M10-NUT", name: "M10 nyloc nut", unit: "pcs", reorderThreshold: 400, reorderLeadTimeDays: 5, unitCost: 2.1, supplier: "Shakti Fasteners", receipts: [1200, 600] },
    { code: "HW-BRG-6205", name: "Deep-groove ball bearing 6205", unit: "pcs", reorderThreshold: 60, reorderLeadTimeDays: 12, unitCost: 185, supplier: "Precision Bearings India", receipts: [400, 250] },
    { code: "HW-ORING-45", name: "O-ring NBR 45 mm", unit: "pcs", reorderThreshold: 300, reorderLeadTimeDays: 7, unitCost: 4.5, supplier: "Sealtech Polymers", receipts: [1500, 1000] },
    { code: "PT-RAL9005", name: "Powder coat RAL 9005 jet black", unit: "l", reorderThreshold: 40, reorderLeadTimeDays: 10, unitCost: 620, supplier: "Colourcoat Industries", receipts: [40, 20] },
    { code: "PT-PRIMER-ZN", name: "Zinc-rich primer", unit: "l", reorderThreshold: 30, reorderLeadTimeDays: 10, unitCost: 540, supplier: "Colourcoat Industries", receipts: [50, 30] },
    { code: "PK-CARTON-L", name: "Export carton, large", unit: "pcs", reorderThreshold: 100, reorderLeadTimeDays: 5, unitCost: 38, supplier: "Pune Packaging", receipts: [200, 100] },
    { code: "CS-CUTOIL-20", name: "Cutting oil (20 l drum)", unit: "l", reorderThreshold: 60, reorderLeadTimeDays: 7, unitCost: 210, supplier: "Lubritech Supplies", receipts: [100, 60] },
  ],
  products: [
    {
      sku: SHARED_SKU,
      name: "Hydraulic Bracket",
      description: "Machined aluminium mounting bracket for hydraulic pump assemblies.",
      unit: "pcs",
      bom: [
        { material: "RM-AL6061-BAR", quantityPerUnit: 0.85, scrapPercent: 3 },
        { material: "HW-M8-BOLT", quantityPerUnit: 4, scrapPercent: 0 },
        { material: "HW-ORING-45", quantityPerUnit: 2, scrapPercent: 0 },
        { material: "PT-RAL9005", quantityPerUnit: 0.03, scrapPercent: 5, note: "Two coats" },
      ],
      routing: [
        { workCenter: "CNC", setupMinutes: 45, runMinutesPerUnit: 1.8 },
        { workCenter: "ASM", setupMinutes: 15, runMinutesPerUnit: 0.6 },
        { workCenter: "PNT", setupMinutes: 30, runMinutesPerUnit: 0.4, machine: "PNT-01" },
      ],
    },
    {
      sku: "GX-40",
      name: "Gearbox Housing",
      description: "Cast iron housing, finish-machined and primed.",
      unit: "pcs",
      bom: [
        { material: "RM-CI-CAST", quantityPerUnit: 1, scrapPercent: 0 },
        { material: "HW-BRG-6205", quantityPerUnit: 2, scrapPercent: 0 },
        { material: "HW-M10-NUT", quantityPerUnit: 6, scrapPercent: 0 },
        { material: "PT-PRIMER-ZN", quantityPerUnit: 0.05, scrapPercent: 4 },
        { material: "PT-RAL9005", quantityPerUnit: 0.06, scrapPercent: 5 },
      ],
      routing: [
        { workCenter: "CNC", setupMinutes: 60, runMinutesPerUnit: 2.4 },
        { workCenter: "ASM", setupMinutes: 20, runMinutesPerUnit: 1.2 },
        { workCenter: "PNT", setupMinutes: 30, runMinutesPerUnit: 0.6 },
      ],
    },
    {
      sku: "FL-110",
      name: "Flange Plate",
      description: "Laser-cut and machined mild steel flange, primed.",
      unit: "pcs",
      bom: [
        { material: "RM-MS-PLATE", quantityPerUnit: 1.4, scrapPercent: 4 },
        { material: "HW-M8-BOLT", quantityPerUnit: 8, scrapPercent: 0 },
        { material: "PT-PRIMER-ZN", quantityPerUnit: 0.04, scrapPercent: 3 },
      ],
      routing: [
        { workCenter: "CNC", setupMinutes: 30, runMinutesPerUnit: 1.2 },
        { workCenter: "PNT", setupMinutes: 20, runMinutesPerUnit: 0.3 },
      ],
    },
    {
      sku: "SP-75",
      name: "Stainless Pump Cover",
      description: "Deep-drawn 304 stainless cover with O-ring groove.",
      unit: "pcs",
      bom: [
        { material: "RM-SS304-SHT", quantityPerUnit: 0.62, scrapPercent: 5 },
        { material: "HW-ORING-45", quantityPerUnit: 1, scrapPercent: 0 },
        { material: "HW-M10-NUT", quantityPerUnit: 4, scrapPercent: 0 },
      ],
      routing: [
        { workCenter: "CNC", setupMinutes: 40, runMinutesPerUnit: 1.5 },
        { workCenter: "ASM", setupMinutes: 10, runMinutesPerUnit: 0.5 },
      ],
    },
    {
      sku: "CV-300",
      name: "Conveyor Roller Assembly",
      description: "Steel roller with sealed bearings, powder coated, boxed in tens.",
      unit: "pcs",
      bom: [
        { material: "RM-MS-PLATE", quantityPerUnit: 2.2, scrapPercent: 3 },
        { material: "HW-BRG-6205", quantityPerUnit: 2, scrapPercent: 0 },
        { material: "HW-M8-BOLT", quantityPerUnit: 6, scrapPercent: 0 },
        { material: "PT-RAL9005", quantityPerUnit: 0.08, scrapPercent: 5 },
        { material: "PK-CARTON-L", quantityPerUnit: 0.1, scrapPercent: 0, note: "One carton per 10 rollers" },
      ],
      routing: [
        { workCenter: "CNC", setupMinutes: 35, runMinutesPerUnit: 1.6 },
        { workCenter: "ASM", setupMinutes: 25, runMinutesPerUnit: 1.5 },
        { workCenter: "PNT", setupMinutes: 30, runMinutesPerUnit: 0.5 },
      ],
    },
  ],
  orders: [
    // Open and overdue (6)
    { product: "HB-200", customer: "Sundaram Auto Components", quantity: 300, priority: "HIGH", dueOffset: -9, status: "IN_PROGRESS", createdDaysAgo: 16, startedDaysAgo: 8, customerPoRef: "SAC-PO-4471" },
    { product: "GX-40", customer: "Mahavir Hydraulics Ltd", quantity: 80, priority: "URGENT", dueOffset: -7, status: "IN_PROGRESS", createdDaysAgo: 15, startedDaysAgo: 7, customerPoRef: "MHL-2291", notes: "Customer line-down risk; expedite through paint." },
    { product: "FL-110", customer: SHARED_CUSTOMER_NAME, quantity: 500, priority: "NORMAL", dueOffset: -5, status: "QUEUED", createdDaysAgo: 12, customerPoRef: "PGW-0917" },
    { product: "CV-300", customer: "Arjun Earthmovers", quantity: 60, priority: "HIGH", dueOffset: -4, status: "ON_HOLD", createdDaysAgo: 11, changedDaysAgo: 6, customerPoRef: "AEM-PO-118", reason: "Customer revised the drawing; awaiting approval of rev C." },
    { product: "SP-75", customer: "Indo-Nippon Drives", quantity: 120, priority: "NORMAL", dueOffset: -2, status: "IN_PROGRESS", createdDaysAgo: 10, startedDaysAgo: 4, customerPoRef: "IND-5530" },
    { product: "HB-200", customer: "Rajdhani Tractors Ltd", quantity: 250, priority: "NORMAL", dueOffset: -1, status: "QUEUED", createdDaysAgo: 9, customerPoRef: "RTL-77012" },
    // Due within 7 days (8)
    { product: "GX-40", customer: SHARED_CUSTOMER_NAME, quantity: 120, priority: "HIGH", dueOffset: 0, status: "QUEUED", createdDaysAgo: 8, customerPoRef: "PGW-0921" },
    { product: "HB-200", customer: "Sundaram Auto Components", quantity: 400, priority: "NORMAL", dueOffset: 1, status: "IN_PROGRESS", createdDaysAgo: 8, startedDaysAgo: 2, customerPoRef: "SAC-PO-4488" },
    { product: "SP-75", customer: "Mahavir Hydraulics Ltd", quantity: 150, priority: "URGENT", dueOffset: 2, status: "QUEUED", createdDaysAgo: 6, customerPoRef: "MHL-2302", notes: "Ship with material test certificate." },
    { product: "CV-300", customer: "Rajdhani Tractors Ltd", quantity: 250, priority: "NORMAL", dueOffset: 3, status: "QUEUED", createdDaysAgo: 6, customerPoRef: "RTL-77020" },
    { product: "FL-110", customer: "Indo-Nippon Drives", quantity: 320, priority: "LOW", dueOffset: 4, status: "QUEUED", createdDaysAgo: 5, customerPoRef: "IND-5541" },
    { product: "GX-40", customer: "Arjun Earthmovers", quantity: 45, priority: "HIGH", dueOffset: 5, status: "IN_PROGRESS", createdDaysAgo: 5, startedDaysAgo: 1, customerPoRef: "AEM-PO-121" },
    { product: "HB-200", customer: SHARED_CUSTOMER_NAME, quantity: 200, priority: "NORMAL", dueOffset: 6, status: "ON_HOLD", createdDaysAgo: 4, changedDaysAgo: 2, customerPoRef: "PGW-0930", reason: "Aluminium bar allocation pending; release once RM-AL6061-BAR receipt lands." },
    { product: "CV-300", customer: "Sundaram Auto Components", quantity: 90, priority: "NORMAL", dueOffset: 7, status: "QUEUED", createdDaysAgo: 3, customerPoRef: "SAC-PO-4502" },
    // Open, due later (4)
    { product: "FL-110", customer: "Mahavir Hydraulics Ltd", quantity: 600, priority: "LOW", dueOffset: 10, status: "QUEUED", createdDaysAgo: 3, customerPoRef: "MHL-2310" },
    { product: "SP-75", customer: "Rajdhani Tractors Ltd", quantity: 200, priority: "NORMAL", dueOffset: 14, status: "QUEUED", createdDaysAgo: 2, customerPoRef: "RTL-77031" },
    { product: "GX-40", customer: "Indo-Nippon Drives", quantity: 100, priority: "NORMAL", dueOffset: 21, status: "QUEUED", createdDaysAgo: 2, customerPoRef: "IND-5552" },
    { product: "HB-200", customer: "Arjun Earthmovers", quantity: 350, priority: "HIGH", dueOffset: 30, status: "QUEUED", createdDaysAgo: 1, customerPoRef: "AEM-PO-130", notes: "Frame contract call-off 3 of 6." },
    // Completed (4) — past due dates, completedAt set
    { product: "HB-200", customer: "Sundaram Auto Components", quantity: 280, priority: "NORMAL", dueOffset: -12, status: "COMPLETED", createdDaysAgo: 24, startedDaysAgo: 18, changedDaysAgo: 13, customerPoRef: "SAC-PO-4402" },
    { product: "FL-110", customer: SHARED_CUSTOMER_NAME, quantity: 450, priority: "NORMAL", dueOffset: -10, status: "COMPLETED", createdDaysAgo: 22, startedDaysAgo: 15, changedDaysAgo: 10, customerPoRef: "PGW-0899" },
    { product: "GX-40", customer: "Mahavir Hydraulics Ltd", quantity: 60, priority: "HIGH", dueOffset: -8, status: "COMPLETED", createdDaysAgo: 20, startedDaysAgo: 14, changedDaysAgo: 9, customerPoRef: "MHL-2270" },
    { product: "CV-300", customer: "Rajdhani Tractors Ltd", quantity: 75, priority: "NORMAL", dueOffset: -6, status: "COMPLETED", createdDaysAgo: 18, startedDaysAgo: 11, changedDaysAgo: 6, customerPoRef: "RTL-76990" },
    // Cancelled (2)
    { product: "SP-75", customer: "Arjun Earthmovers", quantity: 90, priority: "LOW", dueOffset: -3, status: "CANCELLED", createdDaysAgo: 14, changedDaysAgo: 9, customerPoRef: "AEM-PO-109", reason: "Customer cancelled the purchase order." },
    { product: "FL-110", customer: "Sundaram Auto Components", quantity: 150, priority: "NORMAL", dueOffset: 12, status: "CANCELLED", createdDaysAgo: 7, changedDaysAgo: 5, customerPoRef: "SAC-PO-4490", reason: "Duplicate of an existing order." },
  ],
  downtime: [
    { machine: "CNC-01", type: "MAINTENANCE", reason: "Scheduled spindle service", day: { offset: 2, start: "08:00", end: "12:00" }, createdDaysAgo: 2 },
    { machine: "CNC-02", type: "BREAKDOWN", reason: "Coolant pump failure", day: { offset: -5, start: "10:30", end: "15:45" }, createdDaysAgo: 5 },
    { machine: "ASM-02", type: "OTHER", reason: "Tooling changeover", relativeMinutes: { start: -30, end: 90 } },
  ],
  holidayNote: "Public holiday",
};

// ---------------------------------------------------------------------------------------------------------------
// Beta Fabrication
// ---------------------------------------------------------------------------------------------------------------

const BETA: DemoDataset = {
  customers: [
    { name: SHARED_CUSTOMER_NAME, code: "PGW", email: "orders@punegear.example" },
    { name: "Coastal Marine Engineering", code: "CME", email: "buy@coastalmarine.example" },
    { name: "Nashik Agro Implements", code: "NAI", email: "stores@nashikagro.example" },
  ],
  workCenters: [
    { code: "FAB", name: "Fabrication", description: "Laser cutting and press brake" },
    { code: "WLD", name: "Welding", description: "MIG welding cells" },
    { code: "PNT", name: "Paint shop", description: "Wet paint booth" },
  ],
  calendars: [TWO_SHIFTS_CALENDAR, GENERAL_SHIFT_CALENDAR],
  machines: [
    { code: "LSR-01", name: "Fibre laser cutter", workCenter: "FAB", calendar: "Two shifts", status: "ACTIVE", efficiencyPercent: 95, ratedCapacityPerShift: 60, capacityUnit: "sheets" },
    { code: "WLD-01", name: "MIG welding cell", workCenter: "WLD", calendar: "General shift", status: "ACTIVE", efficiencyPercent: 85 },
    { code: "PNT-01", name: "Wet paint booth", workCenter: "PNT", calendar: "General shift", status: "ACTIVE", efficiencyPercent: 100 },
  ],
  materials: [
    { code: "RM-MS-SHT-3", name: "Mild steel sheet 3 mm", unit: "kg", reorderThreshold: 300, reorderLeadTimeDays: 7, unitCost: 72, supplier: "Western Steel Traders", receipts: [800, 400] },
    { code: "RM-MS-TUBE-40", name: "Mild steel square tube 40 mm", unit: "kg", reorderThreshold: 200, reorderLeadTimeDays: 7, unitCost: 80, supplier: "Western Steel Traders", receipts: [500, 200] },
    { code: "HW-M12-BOLT", name: "M12 × 40 hex bolt", unit: "pcs", reorderThreshold: 200, reorderLeadTimeDays: 5, unitCost: 6.4, supplier: "Shakti Fasteners", receipts: [1000, 400] },
    { code: "PT-RAL7035", name: "Enamel RAL 7035 light grey", unit: "l", reorderThreshold: 20, reorderLeadTimeDays: 10, unitCost: 480, supplier: "Colourcoat Industries", receipts: [40, 10] },
    { code: "PT-PRIMER-ZN", name: "Zinc-rich primer", unit: "l", reorderThreshold: 20, reorderLeadTimeDays: 10, unitCost: 540, supplier: "Colourcoat Industries", receipts: [30, 10] },
  ],
  products: [
    {
      sku: SHARED_SKU,
      name: "Heavy-duty Bracket",
      description: "Welded mild steel bracket (same SKU as Acme's aluminium bracket — different plant).",
      unit: "pcs",
      bom: [
        { material: "RM-MS-SHT-3", quantityPerUnit: 1.1, scrapPercent: 4 },
        { material: "HW-M12-BOLT", quantityPerUnit: 2, scrapPercent: 0 },
        { material: "PT-PRIMER-ZN", quantityPerUnit: 0.03, scrapPercent: 3 },
      ],
      routing: [
        { workCenter: "FAB", setupMinutes: 20, runMinutesPerUnit: 0.9 },
        { workCenter: "WLD", setupMinutes: 15, runMinutesPerUnit: 1.4 },
        { workCenter: "PNT", setupMinutes: 20, runMinutesPerUnit: 0.4 },
      ],
    },
    {
      sku: "FR-500",
      name: "Machine Frame",
      description: "Welded tubular base frame for packaging machines.",
      unit: "pcs",
      bom: [
        { material: "RM-MS-TUBE-40", quantityPerUnit: 18.5, scrapPercent: 3 },
        { material: "RM-MS-SHT-3", quantityPerUnit: 4.2, scrapPercent: 4 },
        { material: "HW-M12-BOLT", quantityPerUnit: 16, scrapPercent: 0 },
        { material: "PT-RAL7035", quantityPerUnit: 0.6, scrapPercent: 5 },
      ],
      routing: [
        { workCenter: "FAB", setupMinutes: 30, runMinutesPerUnit: 12 },
        { workCenter: "WLD", setupMinutes: 30, runMinutesPerUnit: 45 },
        { workCenter: "PNT", setupMinutes: 20, runMinutesPerUnit: 10 },
      ],
    },
    {
      sku: "GD-120",
      name: "Safety Guard",
      description: "Perforated sheet guard with hinged door.",
      unit: "pcs",
      bom: [
        { material: "RM-MS-SHT-3", quantityPerUnit: 3.4, scrapPercent: 5 },
        { material: "HW-M12-BOLT", quantityPerUnit: 6, scrapPercent: 0 },
        { material: "PT-RAL7035", quantityPerUnit: 0.15, scrapPercent: 5 },
      ],
      routing: [
        { workCenter: "FAB", setupMinutes: 25, runMinutesPerUnit: 4 },
        { workCenter: "PNT", setupMinutes: 20, runMinutesPerUnit: 2 },
      ],
    },
  ],
  orders: [
    { product: SHARED_SKU, customer: SHARED_CUSTOMER_NAME, quantity: 200, priority: "NORMAL", dueOffset: 5, status: "QUEUED", createdDaysAgo: 4, customerPoRef: "PGW-B-0102" },
    { product: "FR-500", customer: "Coastal Marine Engineering", quantity: 12, priority: "HIGH", dueOffset: 14, status: "IN_PROGRESS", createdDaysAgo: 9, startedDaysAgo: 3, customerPoRef: "CME-4410" },
    { product: "GD-120", customer: "Nashik Agro Implements", quantity: 40, priority: "NORMAL", dueOffset: -2, status: "QUEUED", createdDaysAgo: 7, customerPoRef: "NAI-0071" },
  ],
  downtime: [
    { machine: "LSR-01", type: "MAINTENANCE", reason: "Lens and nozzle service", day: { offset: 3, start: "09:00", end: "11:00" }, createdDaysAgo: 1 },
  ],
  holidayNote: "Public holiday",
};

export const DEMO_DATASETS: Record<DemoVariant, DemoDataset> = { acme: ACME, beta: BETA };

export function demoDataset(variant: DemoVariant = "acme"): DemoDataset {
  return DEMO_DATASETS[variant];
}

/** Demo tenants + logins created by `prisma/seed.ts` (docs/M1_SPEC.md §7; credentials are public — rotate before real use). */
export const DEMO_PASSWORD = "Password123!";

export type DemoTenantSpec = {
  variant: DemoVariant;
  slug: string;
  name: string;
  timezone: string;
  users: { email: string; name: string; role: "ADMIN" | "PLANNER" | "SUPERVISOR" | "VIEWER" }[];
};

export const DEMO_TENANTS: DemoTenantSpec[] = [
  {
    variant: "acme",
    slug: "acme",
    name: "Acme Precision Works",
    timezone: "Asia/Kolkata",
    users: [
      { email: "admin@acme.test", name: "Priya Sharma", role: "ADMIN" },
      { email: "planner@acme.test", name: "Arjun Mehta", role: "PLANNER" },
      { email: "supervisor@acme.test", name: "Ravi Kulkarni", role: "SUPERVISOR" },
      { email: "viewer@acme.test", name: "Neha Iyer", role: "VIEWER" },
    ],
  },
  {
    variant: "beta",
    slug: "beta",
    name: "Beta Fabrication",
    timezone: "Asia/Kolkata",
    users: [{ email: "admin@beta.test", name: "Sanjay Rao", role: "ADMIN" }],
  },
];
