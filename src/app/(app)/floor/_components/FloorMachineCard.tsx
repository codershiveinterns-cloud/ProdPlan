import type { Role } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime, formatQty, formatTime } from "@/lib/format";
import { allowedOperationTargets } from "@/lib/scheduling/operation-status";
import type { FloorMachineDTO, FloorOperationDTO } from "@/lib/scheduling/queries";
import { cn } from "@/lib/utils";

import { OperationActions } from "./OperationActions";
import { OperationStatusBadge } from "./OperationStatusBadge";

function OperationCard({
  op,
  tz,
  role,
  canAct,
  muted = false,
}: {
  op: FloorOperationDTO;
  tz: string;
  role: Role;
  canAct: boolean;
  muted?: boolean;
}) {
  const targets = canAct ? allowedOperationTargets(op.status, role) : [];
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between",
        muted ? "border-dashed bg-muted/30" : "bg-card",
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono font-medium">{op.orderNumber}</span>
          <span className="text-xs text-muted-foreground">op {op.sequence}</span>
          <OperationStatusBadge status={op.status} />
          {op.overdue ? (
            <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
              Overdue
            </Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap items-baseline gap-1.5 text-sm">
          <span className="font-mono text-xs text-muted-foreground">{op.productSku}</span>
          <span className="font-medium">{op.productName}</span>
          <span className="text-muted-foreground">· {formatQty(op.quantity)}</span>
        </div>
        <div className="text-sm text-muted-foreground">
          {formatDateTime(op.plannedStartAt, tz)} – {formatTime(op.plannedEndAt, tz)}
        </div>
      </div>
      {!muted ? (
        <OperationActions
          entryId={op.id}
          orderNumber={op.orderNumber}
          sequence={op.sequence}
          status={op.status}
          targets={targets}
          quantity={op.quantity}
        />
      ) : null}
    </div>
  );
}

export function FloorMachineCard({
  machine,
  workCenterLabel,
  tz,
  role,
  canAct,
}: {
  machine: FloorMachineDTO;
  workCenterLabel: string | null;
  tz: string;
  role: Role;
  canAct: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex flex-wrap items-baseline gap-2">
            <span className="font-mono">{machine.code}</span>
            <span className="font-normal text-muted-foreground">{machine.name}</span>
            {workCenterLabel ? <span className="text-xs font-normal text-muted-foreground">· {workCenterLabel}</span> : null}
          </CardTitle>
          {machine.downtimeNow ? (
            <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
              Down
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {machine.operations.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing scheduled for today.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {machine.operations.map((op) => (
              <OperationCard key={op.id} op={op} tz={tz} role={role} canAct={canAct} />
            ))}
          </div>
        )}
        {machine.upNext.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Up next</h3>
            <div className="flex flex-col gap-2">
              {machine.upNext.slice(0, 3).map((op) => (
                <OperationCard key={`next-${op.id}`} op={op} tz={tz} role={role} canAct={canAct} muted />
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
