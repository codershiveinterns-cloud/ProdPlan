import { describe, expect, it } from "vitest";
import {
  dueHint,
  isBelowReorder,
  isOpenStatus,
  KPI_LIST_HREFS,
  OPEN_STATUSES,
  parseStatusFilter,
  whereActiveDowntime,
  whereBelowReorder,
  whereDueWithin,
  whereInProgress,
  whereOpen,
  whereOverdue,
} from "@/lib/orders/kpis";

const TODAY = "2026-09-05";

describe("where fragments", () => {
  it("whereOpen filters the three open statuses", () => {
    expect(OPEN_STATUSES).toEqual(["QUEUED", "IN_PROGRESS", "ON_HOLD"]);
    expect(whereOpen()).toEqual({ status: { in: ["QUEUED", "IN_PROGRESS", "ON_HOLD"] } });
    expect(isOpenStatus("ON_HOLD")).toBe(true);
    expect(isOpenStatus("COMPLETED")).toBe(false);
  });

  it("whereOverdue is open ∧ dueDate < today (UTC-midnight Date)", () => {
    expect(whereOverdue(TODAY)).toEqual({
      status: { in: ["QUEUED", "IN_PROGRESS", "ON_HOLD"] },
      dueDate: { lt: new Date("2026-09-05T00:00:00.000Z") },
    });
  });

  it("whereDueWithin is open ∧ today ≤ dueDate ≤ today + days (default 7)", () => {
    expect(whereDueWithin(TODAY)).toEqual({
      status: { in: ["QUEUED", "IN_PROGRESS", "ON_HOLD"] },
      dueDate: { gte: new Date("2026-09-05T00:00:00.000Z"), lte: new Date("2026-09-12T00:00:00.000Z") },
    });
    expect(whereDueWithin(TODAY, 1).dueDate).toEqual({
      gte: new Date("2026-09-05T00:00:00.000Z"),
      lte: new Date("2026-09-06T00:00:00.000Z"),
    });
  });

  it("whereInProgress / whereActiveDowntime / whereBelowReorder", () => {
    expect(whereInProgress()).toEqual({ status: "IN_PROGRESS" });
    const now = new Date("2026-09-05T10:00:00.000Z");
    expect(whereActiveDowntime(now)).toEqual({ startsAt: { lte: now }, endsAt: { gt: now } });
    expect(whereBelowReorder()).toEqual({ isActive: true });
    const ref = { __fieldRef: "reorderThreshold" };
    expect(whereBelowReorder(ref)).toEqual({ isActive: true, stockOnHand: { lte: ref } });
    expect(isBelowReorder({ stockOnHand: "5.000", reorderThreshold: "5.000" })).toBe(true);
    expect(isBelowReorder({ stockOnHand: 4, reorderThreshold: 5 })).toBe(true);
    expect(isBelowReorder({ stockOnHand: 6, reorderThreshold: 5 })).toBe(false);
  });
});

describe("parseStatusFilter", () => {
  it("defaults to open", () => {
    for (const p of [undefined, null, "", "  ", "open", "OPEN", []]) {
      const r = parseStatusFilter(p);
      expect(r.mode).toBe("open");
      expect(r.value).toBe("open");
      expect(r.statuses).toEqual(["QUEUED", "IN_PROGRESS", "ON_HOLD"]);
      expect(r.where).toEqual(whereOpen());
    }
  });

  it("all → no filter", () => {
    const r = parseStatusFilter("all");
    expect(r).toEqual({ value: "all", mode: "all", statuses: null, where: {} });
    expect(parseStatusFilter("queued,in_progress,on_hold,completed,cancelled").mode).toBe("all");
  });

  it("parses comma lists case-insensitively, ignores junk and canonicalises", () => {
    const r = parseStatusFilter("completed, Cancelled ,bogus");
    expect(r.mode).toBe("custom");
    expect(r.statuses).toEqual(["COMPLETED", "CANCELLED"]);
    expect(r.value).toBe("COMPLETED,CANCELLED");
    expect(r.where).toEqual({ status: { in: ["COMPLETED", "CANCELLED"] } });
    expect(parseStatusFilter(["IN_PROGRESS", "ON-HOLD"]).statuses).toEqual(["IN_PROGRESS", "ON_HOLD"]);
    expect(parseStatusFilter("in progress").statuses).toEqual(["IN_PROGRESS"]);
    expect(parseStatusFilter("bogus").mode).toBe("open");
    // The exact open set collapses back to "open".
    expect(parseStatusFilter("ON_HOLD,QUEUED,IN_PROGRESS").value).toBe("open");
    expect(parseStatusFilter("IN_PROGRESS")).toEqual({
      value: "IN_PROGRESS",
      mode: "custom",
      statuses: ["IN_PROGRESS"],
      where: { status: { in: ["IN_PROGRESS"] } },
    });
  });
});

describe("dueHint boundaries", () => {
  it.each([
    ["2026-09-01", "overdue", -4, "Overdue 4d"],
    ["2026-09-04", "overdue", -1, "Overdue 1d"],
    ["2026-09-05", "today", 0, "Due today"],
    ["2026-09-06", "tomorrow", 1, "Due tomorrow"],
    ["2026-09-07", "soon", 2, "Due in 2d"],
    ["2026-09-12", "soon", 7, "Due in 7d"],
    ["2026-09-13", "later", 8, "13 Sep 2026"],
    ["2027-01-01", "later", 118, "01 Jan 2027"],
  ] as const)("%s vs today → %s", (due, kind, days, label) => {
    expect(dueHint(due, TODAY)).toEqual({ kind, days, label });
  });

  it("throws on malformed dates", () => {
    expect(() => dueHint("2026-9-5", TODAY)).toThrow(RangeError);
  });
});

describe("KPI_LIST_HREFS", () => {
  it("links to identically filtered lists", () => {
    expect(KPI_LIST_HREFS.open()).toBe("/orders?status=open");
    expect(KPI_LIST_HREFS.overdue(TODAY)).toBe("/orders?status=open&dueTo=2026-09-04");
    expect(KPI_LIST_HREFS.dueWithin(TODAY)).toBe("/orders?status=open&dueFrom=2026-09-05&dueTo=2026-09-12");
    expect(KPI_LIST_HREFS.inProgress()).toBe("/orders?status=IN_PROGRESS");
  });
});
