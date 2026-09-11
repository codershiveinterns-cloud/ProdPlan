-- CreateEnum
CREATE TYPE "OperationStatus" AS ENUM ('QUEUED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "DeliveryRisk" AS ENUM ('ON_TRACK', 'AT_RISK', 'DELAYED', 'LATE');

-- CreateEnum
CREATE TYPE "ConflictType" AS ENUM ('MACHINE_OVERLOAD', 'MACHINE_UNAVAILABLE', 'MATERIAL_SHORTAGE', 'DEADLINE_AT_RISK', 'DEADLINE_MISSED', 'NO_ROUTING', 'NO_MACHINE', 'UNSCHEDULED');

-- CreateEnum
CREATE TYPE "ConflictSeverity" AS ENUM ('WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('SCHEDULE_RUN', 'SCHEDULE_CONFLICT', 'MATERIAL_SHORTAGE', 'DELIVERY_RISK', 'ORDER_STATUS', 'OPERATION_STATUS');

-- CreateEnum
CREATE TYPE "ScheduleRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveryRisk" "DeliveryRisk" NOT NULL DEFAULT 'ON_TRACK',
ADD COLUMN     "plannedEndAt" TIMESTAMP(3),
ADD COLUMN     "plannedStartAt" TIMESTAMP(3),
ADD COLUMN     "riskReason" TEXT,
ADD COLUMN     "scheduleDirty" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "scheduledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "lastScheduleRunAt" TIMESTAMP(3),
ADD COLUMN     "scheduleHorizonDays" INTEGER NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "ScheduleRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" "ScheduleRunStatus" NOT NULL DEFAULT 'RUNNING',
    "trigger" TEXT NOT NULL,
    "triggeredById" TEXT,
    "horizonDays" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "ordersConsidered" INTEGER NOT NULL DEFAULT 0,
    "ordersScheduled" INTEGER NOT NULL DEFAULT 0,
    "conflictCount" INTEGER NOT NULL DEFAULT 0,
    "summary" JSONB,
    "error" TEXT,

    CONSTRAINT "ScheduleRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "operationId" TEXT,
    "sequence" INTEGER NOT NULL,
    "workCenterId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "plannedStartAt" TIMESTAMP(3) NOT NULL,
    "plannedEndAt" TIMESTAMP(3) NOT NULL,
    "plannedMinutes" INTEGER NOT NULL,
    "setupMinutes" INTEGER NOT NULL DEFAULT 0,
    "runMinutes" INTEGER NOT NULL DEFAULT 0,
    "status" "OperationStatus" NOT NULL DEFAULT 'QUEUED',
    "actualStartAt" TIMESTAMP(3),
    "actualEndAt" TIMESTAMP(3),
    "quantityDone" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "lockedById" TEXT,
    "lockedAt" TIMESTAMP(3),
    "holdReason" TEXT,
    "note" TEXT,
    "runId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleConflict" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "runId" TEXT,
    "type" "ConflictType" NOT NULL,
    "severity" "ConflictSeverity" NOT NULL,
    "orderId" TEXT,
    "machineId" TEXT,
    "materialId" TEXT,
    "entryId" TEXT,
    "message" TEXT NOT NULL,
    "details" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleConflict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "dedupeKey" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduleRun_tenantId_startedAt_idx" ON "ScheduleRun"("tenantId", "startedAt");

-- CreateIndex
CREATE INDEX "ScheduleEntry_tenantId_machineId_plannedStartAt_idx" ON "ScheduleEntry"("tenantId", "machineId", "plannedStartAt");

-- CreateIndex
CREATE INDEX "ScheduleEntry_tenantId_status_idx" ON "ScheduleEntry"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleEntry_tenantId_id_key" ON "ScheduleEntry"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleEntry_tenantId_orderId_sequence_key" ON "ScheduleEntry"("tenantId", "orderId", "sequence");

-- CreateIndex
CREATE INDEX "ScheduleConflict_tenantId_resolvedAt_createdAt_idx" ON "ScheduleConflict"("tenantId", "resolvedAt", "createdAt");

-- CreateIndex
CREATE INDEX "ScheduleConflict_tenantId_orderId_idx" ON "ScheduleConflict"("tenantId", "orderId");

-- CreateIndex
CREATE INDEX "Notification_tenantId_userId_readAt_createdAt_idx" ON "Notification"("tenantId", "userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_tenantId_dedupeKey_idx" ON "Notification"("tenantId", "dedupeKey");

-- CreateIndex
CREATE INDEX "Order_tenantId_deliveryRisk_idx" ON "Order"("tenantId", "deliveryRisk");

-- AddForeignKey
ALTER TABLE "ScheduleRun" ADD CONSTRAINT "ScheduleRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_tenantId_orderId_fkey" FOREIGN KEY ("tenantId", "orderId") REFERENCES "Order"("tenantId", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "ProductOperation"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_tenantId_workCenterId_fkey" FOREIGN KEY ("tenantId", "workCenterId") REFERENCES "WorkCenter"("tenantId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_tenantId_machineId_fkey" FOREIGN KEY ("tenantId", "machineId") REFERENCES "Machine"("tenantId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ScheduleRun"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ScheduleConflict" ADD CONSTRAINT "ScheduleConflict_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleConflict" ADD CONSTRAINT "ScheduleConflict_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ScheduleRun"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ScheduleConflict" ADD CONSTRAINT "ScheduleConflict_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ScheduleConflict" ADD CONSTRAINT "ScheduleConflict_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ScheduleConflict" ADD CONSTRAINT "ScheduleConflict_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ScheduleConflict" ADD CONSTRAINT "ScheduleConflict_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "ScheduleEntry"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tenantId_userId_fkey" FOREIGN KEY ("tenantId", "userId") REFERENCES "User"("tenantId", "id") ON DELETE CASCADE ON UPDATE NO ACTION;
