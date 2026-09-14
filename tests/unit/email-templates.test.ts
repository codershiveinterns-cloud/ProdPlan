/**
 * Unit: src/lib/email/templates.ts — every template renders valid HTML with no unescaped user input (XSS check:
 * a `<script>`-laced string renders as literal text, never executable markup), docs/M3_SPEC.md §7.
 */
import { describe, expect, it } from "vitest";
import {
  conflictLineTitle,
  deliveryRiskEscalatedTemplate,
  escapeHtml,
  orderStatusChangedTemplate,
  renderTemplate,
  scheduleRunFinishedTemplate,
  TEMPLATE_NAMES,
} from "@/lib/email/templates";

const XSS = '<script>alert("pwned")</script>';

describe("escapeHtml", () => {
  it("escapes the minimal unsafe set", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("leaves plain text untouched", () => {
    expect(escapeHtml("Waiting for aluminium bar")).toBe("Waiting for aluminium bar");
  });
});

describe("scheduleRunFinishedTemplate", () => {
  it("lists top conflicts and renders a valid HTML document", () => {
    const { html, text } = scheduleRunFinishedTemplate({
      tenantName: "Tata Autocomp",
      orderCount: 18,
      conflictCount: 2,
      conflicts: [
        { title: "Machine overloaded: CNC-01", message: "CNC-01 is overloaded on 12 Sep by 3 h" },
        { title: "Material shortage: AL-BAR", message: "Short by 12.5 kg" },
      ],
      scheduleUrl: "https://prodplan.example.com/schedule",
    });
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain("18 orders scheduled, 2 open conflicts");
    expect(html).toContain("Machine overloaded: CNC-01");
    expect(html).toContain("https://prodplan.example.com/schedule");
    expect(text).toContain("18 orders scheduled, 2 open conflicts");
    expect(text).toContain("Machine overloaded: CNC-01");
  });

  it("escapes an XSS-laced conflict message instead of executing it", () => {
    const { html } = scheduleRunFinishedTemplate({
      tenantName: "Acme",
      orderCount: 1,
      conflictCount: 1,
      conflicts: [{ title: "Deadline missed: SO-1", message: XSS }],
      scheduleUrl: "https://x.test/schedule",
    });
    expect(html).not.toContain(XSS);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toMatch(/<script>alert/);
  });

  it("singular counts read naturally", () => {
    const { text } = scheduleRunFinishedTemplate({
      tenantName: "Acme",
      orderCount: 1,
      conflictCount: 1,
      conflicts: [],
      scheduleUrl: "https://x.test/schedule",
    });
    expect(text).toContain("1 order scheduled, 1 open conflict.");
  });
});

describe("deliveryRiskEscalatedTemplate", () => {
  it("renders due date and projected completion when given", () => {
    const { html, text } = deliveryRiskEscalatedTemplate({
      tenantName: "Acme",
      orderNumber: "SO-000123",
      risk: "LATE",
      dueDate: "12 Sep 2026",
      projectedEnd: "14 Sep 2026, 16:30",
      orderUrl: "https://x.test/orders/o1",
    });
    expect(html).toContain("Order SO-000123 is late");
    expect(html).toContain("Due 12 Sep 2026");
    expect(html).toContain("projected 14 Sep 2026, 16:30");
    expect(text).toContain("Order SO-000123 is late");
  });

  it("falls back to a plain sentence when no dates are given", () => {
    const { html } = deliveryRiskEscalatedTemplate({
      tenantName: "Acme",
      orderNumber: "SO-2",
      risk: "DELAYED",
      orderUrl: "https://x.test/orders/o2",
    });
    expect(html).toContain("does not meet the due date");
  });
});

describe("orderStatusChangedTemplate", () => {
  it("escapes an XSS-laced hold reason", () => {
    const { html, text } = orderStatusChangedTemplate({
      tenantName: "Acme",
      orderNumber: "SO-9",
      status: "ON_HOLD",
      reason: XSS,
      actorName: "Priya",
      orderUrl: "https://x.test/orders/o9",
    });
    expect(html).not.toContain(XSS);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Priya changed it to on hold");
    expect(text).toContain(XSS); // text/plain is never HTML-interpreted; the raw reason is fine there.
  });

  it("escapes an XSS-laced actor name too", () => {
    const { html } = orderStatusChangedTemplate({
      tenantName: "Acme",
      orderNumber: "SO-10",
      status: "CANCELLED",
      actorName: XSS,
      orderUrl: "https://x.test/orders/o10",
    });
    expect(html).not.toContain(XSS);
  });

  it("falls back to 'Someone' when no actor name is given", () => {
    const { html } = orderStatusChangedTemplate({
      tenantName: "Acme",
      orderNumber: "SO-11",
      status: "CANCELLED",
      orderUrl: "https://x.test/orders/o11",
    });
    expect(html).toContain("Someone changed it to cancelled");
  });
});

describe("renderTemplate", () => {
  it("dispatches to the matching template for every name in TEMPLATE_NAMES", () => {
    expect(TEMPLATE_NAMES).toEqual(["schedule-run-finished", "delivery-risk-escalated", "order-status-changed"]);
    const a = renderTemplate("schedule-run-finished", {
      tenantName: "Acme",
      orderCount: 1,
      conflictCount: 0,
      conflicts: [],
      scheduleUrl: "https://x.test/schedule",
    });
    expect(a.html).toContain("Schedule updated");
    const b = renderTemplate("delivery-risk-escalated", {
      tenantName: "Acme",
      orderNumber: "SO-1",
      risk: "LATE",
      orderUrl: "https://x.test/orders/o1",
    });
    expect(b.html).toContain("is late");
    const c = renderTemplate("order-status-changed", {
      tenantName: "Acme",
      orderNumber: "SO-1",
      status: "ON_HOLD",
      orderUrl: "https://x.test/orders/o1",
    });
    expect(c.html).toContain("on hold");
  });
});

describe("conflictLineTitle", () => {
  it("appends the subject label when given", () => {
    expect(conflictLineTitle("MACHINE_OVERLOAD", "CNC-01")).toBe("Machine overloaded: CNC-01");
  });

  it("falls back to the bare type title without a subject", () => {
    expect(conflictLineTitle("NO_ROUTING", null)).toBe("No routing");
  });
});
