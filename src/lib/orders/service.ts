/**
 * Orders business logic (docs/M1_SPEC.md §4 "Orders", §6.1): create, edit (with lock rules), status transitions and
 * the detail read model. Every mutation runs in ONE scoped transaction that also writes its audit row.
 */
import type { Order } from "@/generated/prisma/client";
import type { OrderPriority, OrderStatus } from "@/generated/prisma/enums";
import { audit, auditContext, type AuditCtx } from "@/lib/audit";
import type { Session } from "@/lib/auth/guards";
import { requirementFor, type BomRequirement } from "@/lib/bom";
import { findOrCreateCustomer } from "@/lib/customers";
import { fromDateOnly, toDateOnly } from "@/lib/dates";
import type { TenantDb, TenantTx } from "@/lib/db";
import { DomainError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { notify } from "@/lib/notifications/service";
import { orderStatusChanged } from "@/lib/notifications/events";
import { holdOrder, releaseOrder } from "@/lib/scheduling/operation-status";
import { fieldIssue } from "@/lib/orders/issues";
import { normalizeOrderNumber } from "@/lib/orders/numbers";
import { isOrderNumberConflict, reserveOrderNumbers, withOrderNumberRetry } from "@/lib/orders/reserve";
import {
  canTransition,
  completedAtFor,
  editableFields,
  isTerminal,
  transitionRequiresReason,
  transitionSummary,
  type OrderEditableField,
} from "@/lib/orders/status";
import { operationMinutes } from "@/lib/routing";
import { toPlain } from "@/lib/serialize";
import type { CreateOrderInput, CustomerRef } from "@/lib/validation/orders";

export function orderExistsMessage(orderNumber: string): string {
  return `Order ${orderNumber} already exists`;
}

/** JSON-safe audit snapshot of an order row. */
export function orderSnapshot(o: Order) {
  return toPlain({
    orderNumber: o.orderNumber,
    customerId: o.customerId,
    productId: o.productId,
    quantity: o.quantity,
    priority: o.priority,
    dueDate: toDateOnly(o.dueDate),
    earliestStartDate: o.earliestStartDate ? toDateOnly(o.earliestStartDate) : null,
    status: o.status,
    completedAt: o.completedAt,
    customerPoRef: o.customerPoRef,
    notes: o.notes,
    importBatchId: o.importBatchId,
  });
}

async function resolveCustomer(tx: TenantTx, ctx: AuditCtx, ref: CustomerRef): Promise<string> {
  if (ref.id !== undefined) {
    const existing = await tx.customer.findFirst({ where: { id: ref.id, isActive: true }, select: { id: true } });
    if (!existing) fieldIssue("customer", "Select an active customer");
    return existing.id;
  }
  const { customer, created } = await findOrCreateCustomer(tx, ref.create);
  if (created) {
    await audit(tx, ctx, {
      entityType: "Customer",
      entityId: customer.id,
      entityLabel: customer.name,
      action: "CREATE",
      after: toPlain({ name: customer.name, isActive: customer.isActive }),
      summary: `Customer ${customer.name} created from an order`,
    });
  }
  return customer.id;
}

async function assertActiveProduct(tx: TenantTx, productId: string): Promise<void> {
  const product = await tx.product.findFirst({ where: { id: productId, isActive: true }, select: { id: true } });
  if (!product) fieldIssue("productId", "Select an active product");
}

async function assertOrderNumberFree(tx: TenantTx, orderNumber: string, excludeId?: string): Promise<void> {
  const clash = await tx.order.findFirst({
    where: { orderNumber, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });
  if (clash) fieldIssue("orderNumber", orderExistsMessage(orderNumber));
}

// ---------------------------------------------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------------------------------------------

export async function createOrder(db: TenantDb, session: Session, input: CreateOrderInput): Promise<Order> {
  const ctx = await auditContext(session);
  const manualNumber = input.orderNumber ? normalizeOrderNumber(input.orderNumber) : undefined;

  const run = () =>
    db.$transaction(async (tx) => {
      await assertActiveProduct(tx, input.productId);
      const customerId = await resolveCustomer(tx, ctx, input.customer);
      let orderNumber: string;
      if (manualNumber) {
        await assertOrderNumberFree(tx, manualNumber);
        orderNumber = manualNumber;
      } else {
        [orderNumber] = await reserveOrderNumbers(tx, session.tenant.id, 1);
      }
      const order = await tx.order.create({
        data: {
          tenantId: session.tenant.id,
          orderNumber,
          customerId,
          productId: input.productId,
          quantity: input.quantity,
          priority: input.priority,
          dueDate: fromDateOnly(input.dueDate),
          earliestStartDate: input.earliestStartDate ? fromDateOnly(input.earliestStartDate) : null,
          status: "QUEUED",
          customerPoRef: input.customerPoRef ?? null,
          notes: input.notes ?? null,
          createdById: session.user.id,
        },
      });
      await audit(tx, ctx, {
        entityType: "Order",
        entityId: order.id,
        entityLabel: order.orderNumber,
        action: "CREATE",
        after: orderSnapshot(order),
        summary: `Order ${order.orderNumber} created`,
      });
      return order;
    });

  try {
    return manualNumber ? await run() : await withOrderNumberRetry(run);
  } catch (err) {
    if (manualNumber && isOrderNumberConflict(err)) fieldIssue("orderNumber", orderExistsMessage(manualNumber));
    throw err;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Edit
// ---------------------------------------------------------------------------------------------------------------

/** Already-validated values; every key is optional so partial forms (terminal: notes only) can be applied. */
export type OrderPatch = {
  customer?: CustomerRef;
  customerPoRef?: string | null;
  productId?: string;
  quantity?: number;
  priority?: OrderPriority;
  dueDate?: string;
  earliestStartDate?: string | null;
  orderNumber?: string;
  notes?: string | null;
};

const FIELD_LABELS: Record<OrderEditableField, string> = {
  customerId: "Customer",
  productId: "Product",
  orderNumber: "Order number",
  quantity: "Quantity",
  priority: "Priority",
  dueDate: "Due date",
  earliestStartDate: "Start not before",
  customerPoRef: "Customer PO ref",
  notes: "Notes",
};

export function lockedFieldMessage(field: OrderEditableField, status: OrderStatus): string {
  return isTerminal(status)
    ? `${FIELD_LABELS[field]} cannot be changed once the order is ${status === "COMPLETED" ? "completed" : "cancelled"}`
    : `${FIELD_LABELS[field]} is locked once the order has started`;
}

function assertEditable(status: OrderStatus, field: OrderEditableField, changed: boolean): void {
  if (changed && !editableFields(status).has(field)) throw new DomainError(lockedFieldMessage(field, status), "locked", 409);
}

function sameDate(a: Date | null, b: string | null | undefined): boolean {
  const aIso = a ? toDateOnly(a) : null;
  return aIso === (b ?? null);
}

export async function updateOrder(db: TenantDb, session: Session, orderId: string, patch: OrderPatch): Promise<Order> {
  const ctx = await auditContext(session);
  let manualNumber: string | undefined;
  try {
    return await db.$transaction(async (tx) => {
      const before = await tx.order.findUnique({ where: { id: orderId } });
      if (!before) throw new NotFoundError("Order not found.");
      const status = before.status;
      const data: Parameters<typeof tx.order.update>[0]["data"] = {};

      if (patch.customer !== undefined) {
        const changed = patch.customer.id === undefined || patch.customer.id !== before.customerId;
        assertEditable(status, "customerId", changed);
        if (changed) data.customerId = await resolveCustomer(tx, ctx, patch.customer);
      }
      if (patch.productId !== undefined) {
        const changed = patch.productId !== before.productId;
        assertEditable(status, "productId", changed);
        if (changed) {
          await assertActiveProduct(tx, patch.productId);
          data.productId = patch.productId;
        }
      }
      if (patch.orderNumber !== undefined) {
        const next = normalizeOrderNumber(patch.orderNumber);
        const changed = next !== before.orderNumber;
        assertEditable(status, "orderNumber", changed);
        if (changed) {
          await assertOrderNumberFree(tx, next, orderId);
          manualNumber = next;
          data.orderNumber = next;
        }
      }
      if (patch.quantity !== undefined) {
        const changed = Number(String(before.quantity)) !== patch.quantity;
        assertEditable(status, "quantity", changed);
        if (changed) data.quantity = patch.quantity;
      }
      if (patch.priority !== undefined) {
        const changed = patch.priority !== before.priority;
        assertEditable(status, "priority", changed);
        if (changed) data.priority = patch.priority;
      }
      if (patch.dueDate !== undefined) {
        const changed = !sameDate(before.dueDate, patch.dueDate);
        assertEditable(status, "dueDate", changed);
        if (changed) data.dueDate = fromDateOnly(patch.dueDate);
      }
      if (patch.earliestStartDate !== undefined) {
        const changed = !sameDate(before.earliestStartDate, patch.earliestStartDate);
        assertEditable(status, "earliestStartDate", changed);
        if (changed) data.earliestStartDate = patch.earliestStartDate ? fromDateOnly(patch.earliestStartDate) : null;
      }
      if (patch.customerPoRef !== undefined) {
        const next = patch.customerPoRef ?? null;
        const changed = next !== before.customerPoRef;
        assertEditable(status, "customerPoRef", changed);
        if (changed) data.customerPoRef = next;
      }
      if (patch.notes !== undefined) {
        const next = patch.notes ?? null;
        if (next !== before.notes) data.notes = next;
      }

      if (Object.keys(data).length === 0) return before;

      const after = await tx.order.update({ where: { id: orderId }, data });
      await audit(tx, ctx, {
        entityType: "Order",
        entityId: orderId,
        entityLabel: after.orderNumber,
        action: "UPDATE",
        before: orderSnapshot(before),
        after: orderSnapshot(after),
        summary: `Order ${after.orderNumber} updated`,
      });
      return after;
    });
  } catch (err) {
    if (manualNumber && isOrderNumberConflict(err)) fieldIssue("orderNumber", orderExistsMessage(manualNumber));
    throw err;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------------------------------------------

export type StatusChange = { orderId: string; status: OrderStatus; reason?: string };

export function illegalTransitionMessage(orderNumber: string, from: OrderStatus, to: OrderStatus): string {
  return `Order ${orderNumber} cannot go from ${from} to ${to}`;
}

export async function changeOrderStatus(db: TenantDb, session: Session, change: StatusChange): Promise<Order> {
  const ctx = await auditContext(session);
  const role = session.user.role;
  const reason = change.reason?.trim() || undefined;
  return db.$transaction(async (tx) => {
    const before = await tx.order.findUnique({ where: { id: change.orderId } });
    if (!before) throw new NotFoundError("Order not found.");
    const from = before.status;
    const to = change.status;
    if (!canTransition(from, to, role)) {
      // Legal for some role but not this one → 403; otherwise it is not a legal transition at all.
      if (canTransition(from, to, "ADMIN")) throw new ForbiddenError();
      throw new DomainError(illegalTransitionMessage(before.orderNumber, from, to), "illegal_transition", 409);
    }
    if (transitionRequiresReason(to) && !reason) {
      throw new DomainError("Give a reason for putting the order on hold", "reason_required", 422);
    }
    const completedAt = completedAtFor(from, to);
    const after = await tx.order.update({
      where: { id: change.orderId },
      data: { status: to, ...(completedAt === undefined ? {} : { completedAt }) },
    });
    await audit(tx, ctx, {
      entityType: "Order",
      entityId: after.id,
      entityLabel: after.orderNumber,
      action: "STATUS_CHANGE",
      before: { status: from, completedAt: before.completedAt?.toISOString() ?? null, reason: null },
      after: { status: to, completedAt: after.completedAt?.toISOString() ?? null, reason: reason ?? null },
      summary: reason ? `${transitionSummary(after.orderNumber, from, to)} — ${reason}` : transitionSummary(after.orderNumber, from, to),
    });
    // docs/M2_SPEC.md §4: the order-level dialog holds/releases every step; §5: notify the office (+ floor for
    // ON_HOLD/IN_PROGRESS) of every status change made through this flow, excluding the actor.
    if (to === "ON_HOLD") {
      await holdOrder(tx, session, ctx, after.id, reason ?? null);
    } else if (from === "ON_HOLD") {
      await releaseOrder(tx, session, ctx, after.id);
    }
    await notify(
      tx,
      orderStatusChanged({
        tenantId: session.tenant.id,
        actorUserId: session.user.id,
        actorName: session.user.name,
        orderId: after.id,
        orderNumber: after.orderNumber,
        from,
        to,
        reason,
      }),
    );
    return after;
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Detail read model
// ---------------------------------------------------------------------------------------------------------------

export const orderDetailInclude = {
  customer: { select: { id: true, name: true, code: true, isActive: true } },
  product: {
    select: {
      id: true,
      sku: true,
      name: true,
      unit: true,
      isActive: true,
      bomItems: {
        select: {
          id: true,
          materialId: true,
          quantityPerUnit: true,
          scrapPercent: true,
          material: { select: { id: true, code: true, name: true, unit: true, stockOnHand: true } },
        },
      },
      operations: {
        orderBy: { sequence: "asc" as const },
        select: {
          id: true,
          sequence: true,
          setupMinutes: true,
          runMinutesPerUnit: true,
          workCenter: { select: { id: true, code: true, name: true } },
          machine: { select: { id: true, code: true, name: true } },
        },
      },
    },
  },
} as const;

export type MaterialRequirementRow = BomRequirement & {
  materialCode: string;
  materialName: string;
  materialUnit: string;
};

export type RoutingPreviewRow = {
  id: string;
  sequence: number;
  workCenterCode: string;
  workCenterName: string;
  machineCode: string | null;
  setupMinutes: number;
  runMinutesPerUnit: number;
  /** Estimated minutes at 100 % efficiency for this order's quantity. */
  estimatedMinutes: number;
};

export type OrderDetail = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  priority: OrderPriority;
  quantity: number;
  dueDate: string;
  earliestStartDate: string | null;
  completedAt: string | null;
  customerPoRef: string | null;
  notes: string | null;
  importBatchId: string | null;
  createdAt: string;
  updatedAt: string;
  customer: { id: string; name: string; code: string | null; isActive: boolean };
  product: { id: string; sku: string; name: string; unit: string; isActive: boolean };
  materials: MaterialRequirementRow[];
  routing: RoutingPreviewRow[];
  routingTotalMinutes: number;
};

export async function getOrderDetail(db: TenantDb, orderId: string): Promise<OrderDetail | null> {
  const o = await db.order.findUnique({ where: { id: orderId }, include: orderDetailInclude });
  if (!o) return null;
  const quantity = Number(String(o.quantity));
  const requirements = requirementFor(
    quantity,
    o.product.bomItems.map((b) => ({
      materialId: b.materialId,
      quantityPerUnit: b.quantityPerUnit,
      scrapPercent: b.scrapPercent,
      stockOnHand: b.material.stockOnHand,
    })),
  );
  const materials: MaterialRequirementRow[] = requirements.map((r, i) => {
    const m = o.product.bomItems[i]!.material;
    return { ...r, materialCode: m.code, materialName: m.name, materialUnit: m.unit };
  });
  const routing: RoutingPreviewRow[] = o.product.operations.map((op) => ({
    id: op.id,
    sequence: op.sequence,
    workCenterCode: op.workCenter.code,
    workCenterName: op.workCenter.name,
    machineCode: op.machine?.code ?? null,
    setupMinutes: op.setupMinutes,
    runMinutesPerUnit: Number(String(op.runMinutesPerUnit)),
    estimatedMinutes: operationMinutes(op.setupMinutes, quantity, op.runMinutesPerUnit, 100),
  }));
  const routingTotalMinutes = Math.round(routing.reduce((sum, r) => sum + r.estimatedMinutes, 0) * 10) / 10;
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    priority: o.priority,
    quantity,
    dueDate: toDateOnly(o.dueDate),
    earliestStartDate: o.earliestStartDate ? toDateOnly(o.earliestStartDate) : null,
    completedAt: o.completedAt?.toISOString() ?? null,
    customerPoRef: o.customerPoRef,
    notes: o.notes,
    importBatchId: o.importBatchId,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    customer: o.customer,
    product: { id: o.product.id, sku: o.product.sku, name: o.product.name, unit: o.product.unit, isActive: o.product.isActive },
    materials,
    routing,
    routingTotalMinutes,
  };
}

/** Audit rows for one order, newest first. */
export async function listOrderAudit(db: TenantDb, orderId: string, take = 50) {
  return db.auditLog.findMany({
    where: { entityType: "Order", entityId: orderId },
    orderBy: { createdAt: "desc" },
    take,
  });
}
