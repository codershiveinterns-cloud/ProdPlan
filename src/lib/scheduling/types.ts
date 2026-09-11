/**
 * Scheduling engine types (docs/M2_SPEC.md §2). The engine is pure: every input is plain data (no Prisma rows,
 * no Decimals) so `scheduleOrders()` can be unit-tested and benchmarked without a database.
 */
import type {
  ConflictSeverity,
  ConflictType,
  DeliveryRisk,
  MachineStatus,
  OperationStatus,
  OrderPriority,
  OrderStatus,
} from "@/generated/prisma/enums";
import type { Calendar, Downtime } from "@/lib/calendar";

export type { Calendar, Downtime };

export type EngineRoutingStep = {
  operationId: string;
  sequence: number;
  workCenterId: string;
  /** Fixed machine of the routing step (when set, the only candidate). */
  machineId?: string | null;
  setupMinutes: number;
  runMinutesPerUnit: number;
};

export type EngineBomLine = { materialId: string; quantityPerUnit: number; scrapPercent: number };

export type EngineOrder = {
  id: string;
  orderNumber: string;
  priority: OrderPriority;
  /** `YYYY-MM-DD` */
  dueDate: string;
  /** `YYYY-MM-DD` */
  earliestStartDate?: string | null;
  quantity: number;
  status: OrderStatus;
  /** Third sort key (after priority and due date); ISO string or Date. */
  createdAt?: Date | string;
  product: { id: string; sku: string; name: string; unit: string };
  routing: EngineRoutingStep[];
  bom: EngineBomLine[];
  /** Sequences already COMPLETED / SKIPPED (never re-planned). */
  completedSequences: number[];
};

export type EngineMachine = {
  id: string;
  code: string;
  name: string;
  workCenterId: string;
  workCenterCode?: string;
  calendarId: string;
  status: MachineStatus;
  efficiencyPercent: number;
};

export type EngineMaterial = { stockOnHand: number; unit: string; code: string; name: string };

/** An existing ScheduleEntry the engine must respect (locked, in progress or completed). */
export type EngineEntry = {
  id: string;
  orderId: string;
  operationId?: string | null;
  sequence: number;
  workCenterId: string;
  machineId: string;
  plannedStartAt: Date;
  plannedEndAt: Date;
  plannedMinutes: number;
  actualStartAt?: Date | null;
  actualEndAt?: Date | null;
  status: OperationStatus;
  locked: boolean;
};

export type EngineInput = {
  orders: EngineOrder[];
  machines: EngineMachine[];
  calendars: Record<string, Calendar>;
  downtime: Record<string, Downtime[]>;
  materials: Record<string, EngineMaterial>;
  /** Manually placed entries (`locked = true`, not started). */
  lockedEntries: EngineEntry[];
  /** Operations already IN_PROGRESS / COMPLETED (or paused after starting). */
  inProgressEntries: EngineEntry[];
};

export type EngineOptions = {
  now: Date;
  horizonDays: number;
  tz: string;
  /** Tenant default calendar — drives the "within 1 working day" risk rule. Falls back to the first machine's. */
  defaultCalendarId?: string | null;
};

export type PlannedEntry = {
  orderId: string;
  operationId: string;
  sequence: number;
  workCenterId: string;
  machineId: string;
  plannedStartAt: Date;
  plannedEndAt: Date;
  /** Wall-clock working minutes on the machine (setup + run, scaled by efficiency). */
  plannedMinutes: number;
  setupMinutes: number;
  runMinutes: number;
};

export type PlannedConflict = {
  type: ConflictType;
  severity: ConflictSeverity;
  orderId?: string;
  machineId?: string;
  materialId?: string;
  /** An EXISTING entry id (locked / in-progress entries). */
  entryId?: string;
  /** A NEW entry (not yet persisted) referenced by order + sequence; run.ts resolves it to the created id. */
  entryRef?: { orderId: string; sequence: number };
  message: string;
  details?: Record<string, unknown>;
};

export type EngineOrderResult = {
  plannedStartAt?: Date;
  plannedEndAt?: Date;
  deliveryRisk: DeliveryRisk;
  riskReason?: string;
  scheduled: boolean;
};

export type EngineStats = {
  ordersConsidered: number;
  ordersScheduled: number;
  machinesUsed: number;
  horizonEnd: Date;
};

export type MachineLoad = {
  machineId: string;
  /** Working minutes (after downtime) inside the horizon. */
  availableMinutes: number;
  /** Minutes of entries (fixed + planned) inside working time within the horizon. */
  occupiedMinutes: number;
  utilisationPercent: number;
};

export type EngineResult = {
  entries: PlannedEntry[];
  conflicts: PlannedConflict[];
  orders: Record<string, EngineOrderResult>;
  stats: EngineStats;
  /** Per-machine load over the horizon (also the source of MACHINE_OVERLOAD warnings). */
  loads: MachineLoad[];
};

export type ScheduleTrigger = "manual" | "move" | "status" | "seed";
