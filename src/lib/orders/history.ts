/**
 * Text for the per-entity history card (order / customer detail). `AuditList` renders the actor name in bold before
 * the summary, so the text here deliberately omits the actor ("changed status QUEUED → IN_PROGRESS — reason").
 */
import type { AuditAction } from "@/generated/prisma/enums";

export type HistoryRowLike = {
  action: AuditAction;
  summary: string;
  entityLabel?: string | null;
  changedFields?: string[] | null;
  actorName?: string | null;
  actorEmail?: string | null;
};

const FIELD_LABELS: Readonly<Record<string, string>> = {
  customerId: "customer",
  productId: "product",
  orderNumber: "order number",
  quantity: "quantity",
  priority: "priority",
  dueDate: "due date",
  earliestStartDate: "start date",
  customerPoRef: "PO ref",
  notes: "notes",
  completedAt: "completion time",
  status: "status",
  name: "name",
  code: "code",
  email: "email",
  phone: "phone",
  isActive: "active flag",
};

function fieldList(fields: readonly string[]): string {
  return fields.map((f) => FIELD_LABELS[f] ?? f).join(", ");
}

/** "created this order", "updated quantity, due date", "changed status QUEUED → COMPLETED", … */
export function historyText(row: HistoryRowLike, noun: string): string {
  const fields = (row.changedFields ?? []).filter((f) => f !== "reason");
  switch (row.action) {
    case "CREATE":
      return row.summary.includes("via CSV import") ? `created this ${noun} via CSV import` : `created this ${noun}`;
    case "UPDATE":
      return fields.length > 0 ? `updated ${fieldList(fields)}` : `updated this ${noun}`;
    case "DELETE":
      return `deleted this ${noun}`;
    case "STATUS_CHANGE": {
      const marker = " status ";
      const idx = row.summary.indexOf(marker);
      return idx === -1 ? row.summary : `changed status ${row.summary.slice(idx + marker.length)}`;
    }
    default:
      return row.summary;
  }
}

export function historyActor(row: Pick<HistoryRowLike, "actorName" | "actorEmail">): string {
  return row.actorName?.trim() || row.actorEmail?.trim() || "System";
}
