"use client";

/**
 * The Gantt board (docs/M2_SPEC.md §3): sticky left column, horizontally-scrollable time axis, one row per
 * machine, entries as positioned bars, click → `EntryDrawer`, pointer-based drag-to-reschedule for `schedule:move`.
 *
 * The page never scrolls horizontally — the single `overflow-x-auto` wrapper below is the board's own scroll
 * container (spec: "the page itself must never scroll horizontally — only the board's internal scroll container
 * does").
 */
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { toast } from "sonner";

import { moveEntryAction } from "@/app/(app)/schedule/actions";
import type { BoardVM, EntryVM, MachineVM } from "@/app/(app)/schedule/view-model";
import { dayColumnLeftPx, shiftIso, snapDragDeltaPx } from "@/components/schedule/bar-math";
import { OPERATION_STATUS_META } from "@/components/schedule/status-meta";
import { EntryDrawer, type SiblingMachine } from "@/components/schedule/EntryDrawer";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { actionErrorMessage } from "@/components/forms/action-state";
import { cn } from "@/lib/utils";

const LEFT_COLUMN_WIDTH = 224;
const ROW_HEIGHT = 56;
const HEADER_HEIGHT = 44;

type PendingMove = { entryId: string; machineId: string; leftPx: number } | null;

function applyPendingMove(board: BoardVM, pending: PendingMove): BoardVM {
  if (!pending) return board;
  const patched: BoardVM = {
    ...board,
    workCenters: board.workCenters.map((wc) => ({
      ...wc,
      machines: wc.machines.map((m) => ({ ...m, entries: m.entries.filter((e) => e.id !== pending.entryId) })),
    })),
  };
  let moved: EntryVM | null = null;
  for (const wc of board.workCenters) {
    for (const m of wc.machines) {
      const found = m.entries.find((e) => e.id === pending.entryId);
      if (found) moved = found;
    }
  }
  if (!moved) return patched;
  const patchedMoved: EntryVM = { ...moved, machineId: pending.machineId, leftPx: pending.leftPx };
  for (const wc of patched.workCenters) {
    for (const m of wc.machines) {
      if (m.id === pending.machineId) m.entries = [...m.entries, patchedMoved];
    }
  }
  return patched;
}

function BarTooltip({ entry, children }: { entry: EntryVM; children: React.ReactNode }) {
  if (entry.conflictSeverity === null) return <>{children}</>;
  const messages = entry.conflicts.map((c) => c.message).join(" · ") || (entry.conflictSeverity === "CRITICAL" ? "Critical conflict" : "Warning");
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{messages}</TooltipContent>
    </Tooltip>
  );
}

export type GanttBoardProps = {
  board: BoardVM;
  tz: string;
  canMove: boolean;
};

export function GanttBoard({ board, tz, canMove }: GanttBoardProps) {
  const router = useRouter();
  const [pendingMove, setPendingMove] = useState<PendingMove>(null);
  const [dragEntryId, setDragEntryId] = useState<string | null>(null);
  const [dragGhostPx, setDragGhostPx] = useState(0);
  const [dragWorkCenterId, setDragWorkCenterId] = useState<string | null>(null);
  const [hoverMachineId, setHoverMachineId] = useState<string | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const dragStart = useRef<{ entryId: string; clientX: number; machineId: string; workCenterId: string; plannedStartAt: string; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);

  const displayBoard = useMemo(() => applyPendingMove(board, pendingMove), [board, pendingMove]);

  const allMachines = useMemo(() => displayBoard.workCenters.flatMap((wc) => wc.machines.map((m) => ({ ...m, workCenterCode: wc.code, workCenterName: wc.name }))), [displayBoard]);

  const selectedEntry = useMemo(() => {
    if (!selectedEntryId) return null;
    for (const m of allMachines) {
      const e = m.entries.find((en) => en.id === selectedEntryId);
      if (e) return e;
    }
    return null;
  }, [allMachines, selectedEntryId]);

  const siblingMachines: SiblingMachine[] = useMemo(() => {
    if (!selectedEntry) return [];
    const wc = displayBoard.workCenters.find((w) => w.machines.some((m) => m.id === selectedEntry.machineId));
    return wc ? wc.machines.map((m) => ({ id: m.id, code: m.code, name: m.name })) : [];
  }, [displayBoard.workCenters, selectedEntry]);

  function openDrawer(entryId: string) {
    setSelectedEntryId(entryId);
    setDrawerOpen(true);
  }

  async function commitMove(entryId: string, machineId: string, plannedStartAtIso: string) {
    const fd = new FormData();
    fd.set("entryId", entryId);
    fd.set("machineId", machineId);
    fd.set("plannedStartAt", plannedStartAtIso);
    const result = await moveEntryAction(null, fd);
    if (!result || !result.ok) {
      setPendingMove(null);
      toast.error(result && !result.ok ? actionErrorMessage(result.error) : "Could not move the operation");
      return;
    }
    toast.success(result.message ?? "Operation moved");
    setPendingMove(null);
    router.refresh();
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLButtonElement>, entry: EntryVM, machine: MachineVM) {
    if (!canMove || entry.status === "IN_PROGRESS" || entry.status === "COMPLETED") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = { entryId: entry.id, clientX: e.clientX, machineId: machine.id, workCenterId: machine.workCenterId, plannedStartAt: entry.plannedStartAt, moved: false };
    setDragEntryId(entry.id);
    setDragWorkCenterId(machine.workCenterId);
    setDragGhostPx(0);
    setHoverMachineId(machine.id);
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    const start = dragStart.current;
    if (!start) return;
    const deltaPx = e.clientX - start.clientX;
    if (Math.abs(deltaPx) > 4) start.moved = true;
    const snapped = snapDragDeltaPx(deltaPx, displayBoard.pxPerHour);
    setDragGhostPx(snapped.px);
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const rowEl = under?.closest<HTMLElement>("[data-machine-id]");
    setHoverMachineId(rowEl?.dataset.machineId ?? start.machineId);
  }

  function handlePointerUp(e: ReactPointerEvent<HTMLButtonElement>) {
    const start = dragStart.current;
    dragStart.current = null;
    setDragEntryId(null);
    setDragWorkCenterId(null);
    if (!start) return;
    if (!start.moved) {
      // A plain click/tap, no drag: the subsequent synthetic `click` event opens the drawer.
      return;
    }
    suppressClickRef.current = true;
    const deltaPx = e.clientX - start.clientX;
    const snapped = snapDragDeltaPx(deltaPx, displayBoard.pxPerHour);
    let targetMachineId = hoverMachineId ?? start.machineId;
    const targetMachine = allMachines.find((m) => m.id === targetMachineId);
    if (!targetMachine || targetMachine.workCenterId !== start.workCenterId) {
      targetMachineId = start.machineId; // different work center: refused client-side, server is the real authority
    }
    setHoverMachineId(null);
    if (snapped.minutes === 0 && targetMachineId === start.machineId) return; // no-op

    const newStartIso = shiftIso(start.plannedStartAt, snapped.minutes);
    const entry = allMachines.flatMap((m) => m.entries).find((en) => en.id === start.entryId);
    const originLeft = entry?.leftPx ?? 0;
    const originDeltaFromOffset = snapped.px;
    setPendingMove({ entryId: start.entryId, machineId: targetMachineId, leftPx: originLeft + originDeltaFromOffset });
    void commitMove(start.entryId, targetMachineId, newStartIso);
  }

  const timelineWidth = displayBoard.totalWidthPx;

  return (
    <div className="rounded-lg border">
      <div className="overflow-x-auto">
        <div style={{ width: LEFT_COLUMN_WIDTH + timelineWidth, minWidth: "100%" }}>
          {/* Header row: sticky corner + day headers */}
          <div className="flex border-b bg-card" style={{ height: HEADER_HEIGHT }}>
            <div className="sticky left-0 z-20 flex shrink-0 items-center border-r bg-card px-3 text-xs font-medium text-muted-foreground" style={{ width: LEFT_COLUMN_WIDTH }}>
              Machine
            </div>
            <div className="relative shrink-0" style={{ width: timelineWidth }}>
              {displayBoard.dayHeaders.map((d, i) => (
                <div
                  key={d.iso}
                  className={cn(
                    "absolute top-0 flex h-full flex-col items-center justify-center border-r text-xs",
                    d.isToday ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground",
                  )}
                  style={{ left: dayColumnLeftPx(i, displayBoard.pxPerHour), width: displayBoard.columnWidthPx }}
                >
                  <span>{d.weekday}</span>
                  <span>{d.dateLabel}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Work centers + machine rows */}
          {displayBoard.workCenters.map((wc) => (
            <div key={wc.id}>
              <div className="sticky left-0 z-10 flex items-center bg-muted/60 px-3 py-1.5 text-xs font-semibold text-foreground" style={{ width: LEFT_COLUMN_WIDTH + timelineWidth, minWidth: "100%" }}>
                {wc.code} · {wc.name}
              </div>
              {wc.machines.map((machine) => {
                const greyed = dragWorkCenterId !== null && machine.workCenterId !== dragWorkCenterId;
                return (
                  <div
                    key={machine.id}
                    data-machine-id={machine.id}
                    data-work-center-id={machine.workCenterId}
                    className={cn("flex border-b transition-opacity", greyed && "pointer-events-none opacity-40")}
                    style={{ height: ROW_HEIGHT }}
                  >
                    <div className="sticky left-0 z-10 flex shrink-0 flex-col justify-center gap-0.5 border-r bg-card px-3" style={{ width: LEFT_COLUMN_WIDTH }}>
                      <span className="font-mono text-sm font-medium">{machine.code}</span>
                      <span className="truncate text-xs text-muted-foreground">{machine.name}</span>
                      <span className="text-[11px] tabular-nums text-muted-foreground">{machine.utilisationPercent}% utilised</span>
                    </div>
                    <div className="relative shrink-0" style={{ width: timelineWidth }}>
                      {/* Non-working day shading */}
                      {displayBoard.dayHeaders.map((d, i) =>
                        machine.nonWorkingDays.includes(d.iso) ? (
                          <div
                            key={d.iso}
                            className="absolute top-0 h-full bg-muted/50"
                            style={{ left: dayColumnLeftPx(i, displayBoard.pxPerHour), width: displayBoard.columnWidthPx }}
                            aria-hidden="true"
                          />
                        ) : null,
                      )}
                      {/* Downtime, hatched */}
                      {machine.downtime.map((d) => (
                        <div
                          key={d.id}
                          className="absolute top-1 h-[calc(100%-8px)] rounded border border-dashed border-muted-foreground/40"
                          style={{
                            left: d.leftPx,
                            width: d.widthPx,
                            backgroundImage: "repeating-linear-gradient(45deg, color-mix(in oklch, var(--muted-foreground) 18%, transparent) 0 6px, transparent 6px 12px)",
                          }}
                          title={d.label}
                          aria-hidden="true"
                        />
                      ))}
                      {/* Entries */}
                      {machine.entries.map((entry) => {
                        const meta = OPERATION_STATUS_META[entry.status as keyof typeof OPERATION_STATUS_META] ?? OPERATION_STATUS_META.QUEUED;
                        const isDragging = dragEntryId === entry.id;
                        const left = entry.leftPx + (isDragging ? dragGhostPx : 0);
                        const severityBorder =
                          entry.conflictSeverity === "CRITICAL"
                            ? "border-l-4 border-l-red-600"
                            : entry.conflictSeverity === "WARNING"
                              ? "border-l-4 border-l-amber-500"
                              : "";
                        return (
                          <BarTooltip key={entry.id} entry={entry}>
                            <button
                              type="button"
                              className={cn(
                                "absolute top-1.5 flex h-[calc(100%-12px)] items-center gap-1 overflow-hidden rounded border px-2 text-left text-xs font-medium shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                meta.barClassName,
                                severityBorder,
                                isDragging && "z-30 opacity-90 shadow-md",
                                canMove && entry.status !== "IN_PROGRESS" && entry.status !== "COMPLETED" ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                              )}
                              style={{ left, width: entry.widthPx }}
                              onPointerDown={(e) => handlePointerDown(e, entry, machine)}
                              onPointerMove={handlePointerMove}
                              onPointerUp={handlePointerUp}
                              onClick={() => {
                                if (suppressClickRef.current) {
                                  suppressClickRef.current = false;
                                  return;
                                }
                                openDrawer(entry.id);
                              }}
                              title={`${entry.orderNumber} · ${entry.productSku}`}
                              aria-label={`${entry.orderNumber} op ${entry.sequence}, ${entry.productSku}, ${meta.label}${entry.locked ? ", locked" : ""}`}
                            >
                              {entry.locked ? <Lock className="size-3 shrink-0" aria-hidden="true" /> : null}
                              <span className="truncate">
                                {entry.orderNumber} · {entry.productSku}
                              </span>
                            </button>
                          </BarTooltip>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <EntryDrawer
        entry={selectedEntry}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        siblingMachines={siblingMachines}
        canMove={canMove}
        tz={tz}
        onChanged={() => {
          setDrawerOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}
