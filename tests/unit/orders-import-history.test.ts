/** Unit: history-card text for order / customer audit rows (actor rendered separately by AuditList). */
import { describe, expect, it } from "vitest";
import { historyActor, historyText } from "@/lib/orders/history";

describe("historyText", () => {
  it("describes each action without repeating the actor", () => {
    expect(historyText({ action: "CREATE", summary: "Order SO-000001 created" }, "order")).toBe("created this order");
    expect(historyText({ action: "CREATE", summary: "Order SO-000002 created via CSV import" }, "order")).toBe("created this order via CSV import");
    expect(historyText({ action: "UPDATE", summary: "Order SO-000001 updated", changedFields: ["quantity", "dueDate", "customerPoRef"] }, "order")).toBe("updated quantity, due date, PO ref");
    expect(historyText({ action: "UPDATE", summary: "Customer X updated", changedFields: [] }, "customer")).toBe("updated this customer");
    expect(historyText({ action: "DELETE", summary: "Customer X deleted" }, "customer")).toBe("deleted this customer");
    expect(historyText({ action: "STATUS_CHANGE", summary: "Order SO-000001 status QUEUED → ON_HOLD — Waiting for steel", changedFields: ["status", "reason"] }, "order")).toBe(
      "changed status QUEUED → ON_HOLD — Waiting for steel",
    );
    expect(historyText({ action: "IMPORT", summary: "Imported 5 orders from x.csv" }, "order")).toBe("Imported 5 orders from x.csv");
  });

  it("falls back from name to email to System for the actor", () => {
    expect(historyActor({ actorName: " Priya ", actorEmail: "p@x.test" })).toBe("Priya");
    expect(historyActor({ actorName: null, actorEmail: "p@x.test" })).toBe("p@x.test");
    expect(historyActor({ actorName: "", actorEmail: null })).toBe("System");
  });
});
