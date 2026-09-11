# ProdPlan — Milestone 2 Build Specification

Binding contract for the second delivery (PRD "Milestone 2"). Everything from `M1_SPEC.md` (tenancy, RBAC, audit,
UI conventions, colour semantics, list URL contract, production framing) stays in force. Read `M1_SPEC.md` §2–§5,
`STACK_NOTES.md`, `UI_KIT.md` and the existing code before building.

## 0. Scope (PRD Milestone 2)

1. Production scheduling engine: sequences orders against machine capacity and material availability, factoring in
   deadline priority.
2. Conflict detection: flags overloaded machines, insufficient material, and at-risk deadlines at scheduling time.
3. Visual planning board (Gantt-style, day-by-day, machine-by-machine) with drag-to-reschedule.
4. Production status tracking: stage-wise status per order (queued, in progress, on hold, completed) with a
   floor-level update flow.
5. Delivery deadline tracking with automatic at-risk / delayed flags.
6. In-app notification framework wired to scheduling conflicts and status changes.

Quality bar: 10+ year senior engineer. Every rule below is deterministic and unit-tested; every mutation is
tenant-scoped, permission-checked, audited in the same transaction; the UI follows the M1 kit. No wording such as
milestone/phase/roadmap anywhere user-facing.

## 1. Data model additions (migration `m2_scheduling`)

Enums: `OperationStatus { QUEUED, IN_PROGRESS, ON_HOLD, COMPLETED, SKIPPED }`, `DeliveryRisk { ON_TRACK, AT_RISK,
DELAYED, LATE }`, `ConflictType { MACHINE_OVERLOAD, MACHINE_UNAVAILABLE, MATERIAL_SHORTAGE, DEADLINE_AT_RISK,
DEADLINE_MISSED, NO_ROUTING, NO_MACHINE, UNSCHEDULED }`, `ConflictSeverity { WARNING, CRITICAL }`,
`NotificationType { SCHEDULE_RUN, SCHEDULE_CONFLICT, MATERIAL_SHORTAGE, DELIVERY_RISK, ORDER_STATUS,
OPERATION_STATUS }`, `ScheduleRunStatus { RUNNING, COMPLETED, FAILED }`.

```
ScheduleRun       id, tenantId, status ScheduleRunStatus, trigger String ("manual"|"move"|"status"|"seed"), triggeredById?, horizonDays Int, startedAt, finishedAt?, ordersConsidered Int, ordersScheduled Int, conflictCount Int, summary Json?, error String?
ScheduleEntry     id, tenantId, orderId (composite FK, Cascade), operationId? (plain FK → ProductOperation, SetNull), sequence Int, workCenterId (composite FK, NoAction), machineId (composite FK, NoAction), plannedStartAt DateTime, plannedEndAt DateTime, plannedMinutes Int, setupMinutes Int, runMinutes Int, status OperationStatus (QUEUED), actualStartAt?, actualEndAt?, quantityDone Decimal(14,3) (0), locked Bool (false)  — a manually placed entry the engine must not move —, lockedById?, lockedAt?, note?, runId? (plain FK → ScheduleRun, SetNull), createdAt, updatedAt
                  @@unique([tenantId, id]) @@unique([tenantId, orderId, sequence]) @@index([tenantId, machineId, plannedStartAt]) @@index([tenantId, status])
ScheduleConflict  id, tenantId, runId? (SetNull), type ConflictType, severity ConflictSeverity, orderId? (composite FK, Cascade), machineId? (plain FK, Cascade), materialId? (plain FK, Cascade), entryId? (plain FK → ScheduleEntry, Cascade), message String, details Json?, resolvedAt?, createdAt   @@index([tenantId, resolvedAt, createdAt]) @@index([tenantId, orderId])
Notification      id, tenantId, userId (composite FK → User, Cascade), type NotificationType, title, body, href?, entityType?, entityId?, dedupeKey String?, readAt?, createdAt   @@index([tenantId, userId, readAt, createdAt]) @@index([tenantId, dedupeKey])
Order (add)       deliveryRisk DeliveryRisk (ON_TRACK), riskReason String?, plannedStartAt DateTime?, plannedEndAt DateTime?, scheduledAt DateTime?, scheduleDirty Bool (true)
Tenant (add)      scheduleHorizonDays Int (30), lastScheduleRunAt DateTime?
```
All new tables carry `tenantId` and are added to `TENANT_SCOPED_MODELS` (the coverage unit test enforces this).
`ScheduleConflict` is append-only except `resolvedAt`; `Notification` allows `readAt` updates and deletes by the owner.

## 2. Scheduling engine (`src/lib/scheduling/`)

Pure core + persistence wrapper. `engine.ts` exports:
```
scheduleOrders(input: EngineInput, opts: { now: Date; horizonDays: number; tz: string }): EngineResult
EngineInput  = { orders: EngineOrder[]; machines: EngineMachine[]; calendars: Record<id, Calendar>; downtime: Record<machineId, Downtime[]>; materials: Record<materialId, { stockOnHand: number; unit: string; code: string; name: string }>; lockedEntries: EngineEntry[]; inProgressEntries: EngineEntry[] }
EngineOrder  = { id, orderNumber, priority, dueDate: "YYYY-MM-DD", earliestStartDate?: "YYYY-MM-DD", quantity: number, status, product: { id, sku, name, unit }, routing: { operationId, sequence, workCenterId, machineId?: string, setupMinutes, runMinutesPerUnit }[], bom: { materialId, quantityPerUnit, scrapPercent }[], completedSequences: number[] }
EngineResult = { entries: PlannedEntry[]; conflicts: PlannedConflict[]; orders: Record<orderId, { plannedStartAt?, plannedEndAt?, deliveryRisk, riskReason?, scheduled: boolean }>; stats: { ordersConsidered, ordersScheduled, machinesUsed, horizonEnd } }
```
Algorithm (deterministic, no randomness):
1. Candidates: orders with status QUEUED or IN_PROGRESS (ON_HOLD orders keep existing entries but are not
   re-planned; COMPLETED/CANCELLED never). Sort by priority (URGENT > HIGH > NORMAL > LOW), then `dueDate` asc, then
   `createdAt` asc, then `orderNumber` — a stable list.
2. Fixed inputs: `lockedEntries` (manually placed) and `inProgressEntries` (operations already IN_PROGRESS or
   COMPLETED) occupy their machines at their planned/actual times and are never moved. Completed sequences of an
   order are skipped; the next sequence may start no earlier than the previous one's end (actual end when present).
3. For each order, for each routing step in `sequence` order: `duration = ceil((setupMinutes + quantity ×
   runMinutesPerUnit) × 100 / efficiencyPercent)` minutes on the chosen machine. Candidate machines = the step's fixed
   `machineId` if set, else all ACTIVE machines of the work center (INACTIVE/MAINTENANCE excluded). Earliest start =
   max(now rounded up to 5 min, order.earliestStartDate 00:00 in tz, previous step end). Working time comes from
   `calendar.availabilityRange`/`shiftsOn` (tenant tz) minus downtime windows minus already-occupied intervals on that
   machine; an operation is placed in the first gap sequence where the required minutes fit — it may span several
   shifts/days (non-working gaps are skipped, the entry's `plannedEndAt` is the real finish instant). Pick the
   machine with the earliest finish; ties → lower machine code. If no placement exists within the horizon →
   conflict `NO_MACHINE`/`MACHINE_OVERLOAD` (CRITICAL) and the order is left unscheduled (`UNSCHEDULED`).
4. Orders without routing → conflict `NO_ROUTING` (CRITICAL), unscheduled. Work centers with no ACTIVE machine →
   `MACHINE_UNAVAILABLE` (CRITICAL).
5. Materials: walk orders in the planned start order and consume `requirementFor(qty, bom)` from a running
   available balance (starting at `stockOnHand`); the first order that cannot be covered gets
   `MATERIAL_SHORTAGE` (WARNING when partial, CRITICAL when nothing available) with `{ materialId, code, required,
   available, shortBy, unit }`; it is still scheduled (the planner decides), and its risk reason mentions it.
6. Delivery risk per order (computed from the planned end `E` and due date `D` end-of-day in tz): `LATE` when the
   order is not COMPLETED and today > D (already past due); `DELAYED` when `E > D`; `AT_RISK` when `E` is within the
   last 10 % of the remaining lead time or within 1 working day of D, or the order has a MATERIAL_SHORTAGE, or it is
   unscheduled with D inside the horizon; otherwise `ON_TRACK`. `DEADLINE_MISSED` conflict (CRITICAL) for DELAYED/LATE,
   `DEADLINE_AT_RISK` (WARNING) for AT_RISK. `riskReason` is a short human sentence ("Ends 2 days after the due date
   on CNC-02", "Material RM-AL6061-BAR short by 38.5 kg").
7. Machine load: for each machine, if occupied minutes over the horizon > available minutes → `MACHINE_OVERLOAD`
   (WARNING) with utilisation %. Overlaps between locked entries (or a locked entry inside downtime / outside working
   time) → `MACHINE_OVERLOAD` CRITICAL with both entry ids.

`run.ts` exports `runSchedule(db, session, ctx, { trigger, horizonDays? }): Promise<ScheduleRunResult>`: loads inputs
through the scoped client, calls the engine, and in ONE transaction: deletes unlocked/non-started entries of the
considered orders, writes the new entries (with `runId`), resolves open conflicts of those orders (`resolvedAt`) and
inserts the new ones, updates each order's `plannedStartAt/plannedEndAt/deliveryRisk/riskReason/scheduledAt/
scheduleDirty=false`, updates `Tenant.lastScheduleRunAt`, writes the `ScheduleRun` row and an audit row
(`entityType: "ScheduleRun"`, action UPDATE, summary "Scheduled 18 orders, 3 conflicts"), then fans out
notifications (§5). Engine time budget: < 2 s for 200 orders × 3 operations on 20 machines (unit test with a
synthetic dataset asserts < 2 s).

`scheduleDirty`: set to true by order create/edit/import/status changes and machine/calendar/downtime/routing/stock
edits (a helper `markScheduleDirty(tx)` called from those actions — owned by the engine agent, invoked by others via
`integrationNotes` if the files are not theirs); the board shows a "Schedule is out of date — Run schedule" banner
when any order is dirty or `lastScheduleRunAt` is null.

Permissions (add to `rbac.ts`): `schedule:read` (all roles), `schedule:run` (ADMIN, PLANNER), `schedule:move` (ADMIN,
PLANNER), `operations:status` (ADMIN, PLANNER, SUPERVISOR), `notifications:read` (all). Demo tenant: all allowed.

## 3. Planning board (`/schedule`)

* Server page loads machines (grouped by work center, ACTIVE + MAINTENANCE), entries in the visible window,
  downtime windows, working shifts per day (from `shiftsOn`), open conflicts, dirty flag. URL: `?from=YYYY-MM-DD&days=7|14|30&workCenterId=`.
  Default: from today (tenant tz), 14 days.
* Client `GanttBoard`: sticky left column (machine code, name, work center, utilisation % for the window), time axis
  with day headers (weekday + date, today highlighted, non-working days shaded per machine calendar, downtime hatched),
  one row per machine, bars = entries positioned by time (px per hour; horizontal scroll inside the board, the page
  never scrolls horizontally). Bar shows order # + product sku, status colour (QUEUED slate, IN_PROGRESS blue,
  ON_HOLD amber, COMPLETED green), a lock icon when locked, a red left border + tooltip when the order has a
  CRITICAL conflict, amber for WARNING. Clicking a bar opens `EntryDrawer` (order link, product, qty, planned window,
  machine, status, conflicts, "Unlock" / "Move to…" fallback form for keyboard users).
* Drag-to-reschedule (`schedule:move`): pointer-based (no library required; `@dnd-kit/core` is installed if
  preferred). Horizontal drag snaps to 15 min; vertical drag onto another machine row is allowed only within the
  same work center (or refused when the routing step has a fixed machine). Drop → server action
  `moveEntryAction({ entryId, machineId, plannedStartAt })`: validates permission, machine eligibility, that the entry
  is not IN_PROGRESS/COMPLETED, moves the start to the next working instant if dropped in non-working time, sets
  `locked=true, lockedById, lockedAt`, then calls `runSchedule(trigger: "move")` so downstream steps and other orders
  re-flow around the locked entry; returns the refreshed window; toast "SO-000123 op 20 moved to CNC-02, Tue 09:30".
  `unlockEntryAction` clears the lock and re-runs. Optimistic UI with rollback on error.
* Toolbar: window navigation (‹ today ›, 7/14/30), work-center filter, "Run schedule" (with horizon select 14/30/60
  from Tenant default), conflicts badge → `/schedule/conflicts`, last run time, dirty banner.
* `/schedule/conflicts`: list (type, severity badge, order link, machine/material, message, created) with filters
  `type`, `severity`, `resolved`; row actions: open order / open board at that entry. `/orders/[id]` gets a
  **Schedule** card: steps table (seq, work center, machine, planned window, status, done qty) + risk badge + reason
  + "Open on board" link; the orders list gets a Delivery risk column (badge: ON_TRACK green outline, AT_RISK amber,
  DELAYED red, LATE red filled) and filter `risk=`.
* Mobile/tablet: the board is usable with horizontal scroll and tap-to-open drawer; drag only with pointer.

## 4. Production status tracking (floor flow)

* Per-operation status on `ScheduleEntry.status` with transitions (`src/lib/scheduling/operation-status.ts`,
  unit-tested): QUEUED → IN_PROGRESS | ON_HOLD | SKIPPED(ADMIN/PLANNER); IN_PROGRESS → ON_HOLD | COMPLETED;
  ON_HOLD → QUEUED | IN_PROGRESS; COMPLETED terminal (ADMIN/PLANNER may reopen → IN_PROGRESS). Starting sets
  `actualStartAt` (once); completing sets `actualEndAt` and `quantityDone` (default = order quantity; ≤ quantity;
  partial completions allowed with a note). An operation cannot start before the previous sequence is COMPLETED or
  SKIPPED (ADMIN/PLANNER may override with a reason).
* Roll-up to `Order.status` (`rollupOrderStatus`, same transaction): any step IN_PROGRESS → IN_PROGRESS; all steps
  COMPLETED/SKIPPED → COMPLETED (+ `completedAt`); order ON_HOLD is set explicitly by the order-level dialog (holds
  all steps: step statuses become ON_HOLD, resumed to their previous state on release — store `heldFrom` in `note`
  JSON or a dedicated column `holdReason`); existing M1 order transitions and audit rules still apply and the
  roll-up uses `canTransition` with the acting role (ADMIN for system roll-ups).
* `/floor` (all roles; actions need `operations:status`): tablet-first page — filter by work center / machine
  (remembered in the URL), grouped by machine, cards for today's + overdue operations in planned order: order #,
  product, qty, planned window, status badge, big 44 px buttons **Start**, **Pause** (→ ON_HOLD with reason),
  **Resume**, **Complete** (dialog: quantity done, note). Also "Up next" (next 3 per machine). Refreshes after each
  action; shows the machine's downtime badge. Order detail and the board reflect the same data.
* Every operation status change → audit (`entityType: "ScheduleEntry"`, STATUS_CHANGE, summary "CNC-01 · SO-000118
  op 10 started by Ravi") and marks the schedule dirty when the actual timing deviates from plan by > 30 min
  (late start or overrun) so the next run re-flows; delivery risk for that order is re-evaluated immediately
  (`reassessOrderRisk(tx, orderId)` — cheap: remaining planned end vs due, plus overrun).

## 5. Notifications (in-app)

* `src/lib/notifications/service.ts`: `notify(tx, { tenantId, recipients: { roles?: Role[]; userIds?: string[] },
  type, title, body, href?, entityType?, entityId?, dedupeKey? })` fans out one row per active recipient user;
  when `dedupeKey` is given and an unread notification with the same key exists for that user within 24 h, it is
  not duplicated (the existing row's createdAt is bumped instead). `markRead`, `markAllRead`, `unreadCount`,
  `listNotifications` (paginated, own rows only — the scoped client + `userId = session.user.id`).
* Events wired: schedule run finished (to ADMIN+PLANNER: "Schedule updated — 18 orders, 3 conflicts" → /schedule);
  each new CRITICAL conflict and each MATERIAL_SHORTAGE (dedupe by `conflict:<type>:<orderId|machineId|materialId>`);
  order deliveryRisk changing to AT_RISK/DELAYED/LATE (dedupe `risk:<orderId>:<risk>`); order status changes made by
  someone else (to ADMIN+PLANNER, and to the SUPERVISORs for ON_HOLD/IN_PROGRESS); operation started/completed/paused
  (to PLANNER+ADMIN, dedupe per entry+status). Actor never receives a notification for their own action.
* UI: bell in the Topbar (`NotificationBell`, client) with unread badge, polling every 60 s via a route handler
  `GET /api/notifications/unread-count`; dropdown with the 8 latest (title, relative time, unread dot, click →
  marks read + navigates); `/notifications` page (all, filters `unread=1`, `type=`; "Mark all as read"). Sidebar
  gets **Schedule** (`/schedule`, CalendarRange icon, `schedule:read`) and **Floor** (`/floor`, Wrench icon,
  `operations:status`… visible to all with `schedule:read`) under Plan, and **Notifications** is reachable from the
  bell only.

## 6. Dashboard & seed

* Dashboard: new tiles **Delivery risk** (AT_RISK + DELAYED + LATE counts → `/orders?risk=AT_RISK,DELAYED,LATE`) and
  **Schedule conflicts** (open CRITICAL/WARNING → `/schedule/conflicts`); "Orders by due date" gains the risk badge;
  a **Today on the floor** mini-list (operations planned today, by machine, with status) → `/floor`; the setup
  checklist gains step 7 "Run the schedule".
* Seed / demo plant: after seeding, run the engine (`trigger: "seed"`) so the board, conflicts, risks and a few
  notifications exist; put 2 operations IN_PROGRESS with actual starts and 1 locked entry; ensure at least one
  MATERIAL_SHORTAGE and one DEADLINE conflict appear naturally from the data (adjust quantities/due dates in
  `demo-data.ts` if needed, never fake rows).

## 7. Tests & gates

Unit: engine placement (calendar gaps, downtime, multi-shift spanning, fixed machine, locked entries respected,
in-progress entries respected, priority/due ordering, horizon overflow), material walk and shortage maths, risk
classification boundaries, conflict generation, operation transitions and roll-up, notification dedupe, move
validation (working-time snapping, work-center eligibility), performance test (< 2 s). Integration: runSchedule
persists entries/conflicts/risk atomically and is idempotent for unchanged input; move → lock → re-run keeps the
locked entry; floor start/complete → roll-up → audit → notification; notifications are per-tenant and per-user.
`npm run typecheck`, `npm run lint`, `npm test`, `npm run build` green; browser QA of board (drag), floor, bell.

## 8. Ownership (parallel build)

| Agent | Owns |
|---|---|
| engine | `src/lib/scheduling/**` (engine, run, risk, conflicts, dirty marking, operation-status, rollup), `src/lib/validation/scheduling.ts`, `tests/unit/scheduling-*.test.ts`, `tests/integration/scheduling-*.test.ts` |
| notifications | `src/lib/notifications/**`, `src/app/(app)/notifications/**`, `src/app/api/notifications/**`, `src/components/layout/NotificationBell.tsx` (+ one line in `Topbar.tsx`), `tests/**/notifications-*.test.ts` |
| board | `src/app/(app)/schedule/**` (board, conflicts page, actions), `src/components/schedule/**`, `tests/unit/board-*.test.ts` |
| floor | `src/app/(app)/floor/**`, order detail **Schedule** card (`src/app/(app)/orders/[id]/_components/ScheduleCard.tsx` + its include in `orders/[id]/page.tsx`), orders list risk column/filter (`src/lib/orders/list.ts`, `src/app/(app)/orders/page.tsx` — coordinate: only add the column/filter), `tests/**/floor-*.test.ts` |
| dashboard-seed | `src/app/(app)/dashboard/**`, `src/lib/dashboard/**`, `src/lib/demo/**`, `prisma/seed.ts`, nav entries in `src/components/layout/nav.ts` |
Shared, pre-written by the orchestrator: schema + migration, `rbac.ts` permissions, `db.ts` scoped model list.
