/**
 * Unit: the pure parts of src/lib/notifications/service.ts — recipient resolution (roles ∪ userIds, active only,
 * actor excluded) and the 24 h dedupe partition (bump vs create).
 */
import { describe, expect, it } from "vitest";
import {
  DEDUPE_WINDOW_MS,
  dedupeThreshold,
  partitionByDedupe,
  resolveRecipientIds,
  toNotificationItem,
  type RecipientCandidate,
} from "@/lib/notifications/service";

const users: RecipientCandidate[] = [
  { id: "admin", role: "ADMIN", isActive: true },
  { id: "planner", role: "PLANNER", isActive: true },
  { id: "planner-off", role: "PLANNER", isActive: false },
  { id: "sup", role: "SUPERVISOR", isActive: true },
  { id: "viewer", role: "VIEWER", isActive: true },
];

describe("resolveRecipientIds", () => {
  it("selects active users by role", () => {
    expect(resolveRecipientIds(users, { roles: ["ADMIN", "PLANNER"] })).toEqual(["admin", "planner"]);
  });

  it("unions roles and explicit userIds without duplicates, preserving user order", () => {
    expect(resolveRecipientIds(users, { roles: ["ADMIN"], userIds: ["viewer", "admin"] })).toEqual(["admin", "viewer"]);
  });

  it("excludes the actor", () => {
    expect(resolveRecipientIds(users, { roles: ["ADMIN", "PLANNER"] }, "planner")).toEqual(["admin"]);
    expect(resolveRecipientIds(users, { userIds: ["sup"] }, "sup")).toEqual([]);
  });

  it("never includes inactive users, even when named explicitly", () => {
    expect(resolveRecipientIds(users, { userIds: ["planner-off"] })).toEqual([]);
  });

  it("ignores ids that are not tenant users and empty recipient sets", () => {
    expect(resolveRecipientIds(users, { userIds: ["ghost"] })).toEqual([]);
    expect(resolveRecipientIds(users, {})).toEqual([]);
  });
});

describe("dedupeThreshold", () => {
  it("is exactly 24 h before now", () => {
    const now = new Date("2026-09-11T12:00:00Z");
    expect(dedupeThreshold(now).toISOString()).toBe("2026-09-10T12:00:00.000Z");
    expect(DEDUPE_WINDOW_MS).toBe(86_400_000);
    expect(dedupeThreshold(now.getTime()).getTime()).toBe(now.getTime() - DEDUPE_WINDOW_MS);
  });
});

describe("partitionByDedupe", () => {
  it("bumps recipients with an existing row and creates for the rest", () => {
    const out = partitionByDedupe(["a", "b", "c"], [{ id: "row-b", userId: "b" }]);
    expect(out).toEqual({ bumpRowIds: ["row-b"], createUserIds: ["a", "c"] });
  });

  it("bumps every matching row of a user (defensive against pre-existing duplicates)", () => {
    const out = partitionByDedupe(["a"], [
      { id: "r1", userId: "a" },
      { id: "r2", userId: "a" },
    ]);
    expect(out).toEqual({ bumpRowIds: ["r1", "r2"], createUserIds: [] });
  });

  it("ignores existing rows of users who are not recipients", () => {
    const out = partitionByDedupe(["a"], [{ id: "rx", userId: "x" }]);
    expect(out).toEqual({ bumpRowIds: [], createUserIds: ["a"] });
  });
});

describe("toNotificationItem", () => {
  it("formats relative/absolute time on the server and flattens readAt to a boolean", () => {
    const now = new Date("2026-09-11T10:00:00Z");
    const item = toNotificationItem(
      {
        id: "n1",
        type: "ORDER_STATUS",
        title: "Order SO-000001 is now on hold",
        body: "Priya changed it from queued",
        href: "/orders/o1",
        entityType: "Order",
        entityId: "o1",
        readAt: null,
        createdAt: new Date("2026-09-11T08:00:00Z"),
      },
      "Asia/Kolkata",
      now,
    );
    expect(item.read).toBe(false);
    expect(item.relative).toBe("2 h ago");
    expect(item.absolute).toBe("11 Sep 2026, 13:30");
    expect(item.createdAt).toBe("2026-09-11T08:00:00.000Z");
  });
});
