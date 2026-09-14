-- CreateEnum
CREATE TYPE "RiskCause" AS ENUM ('NONE', 'MATERIAL', 'CAPACITY', 'UPSTREAM_DELAY');

-- CreateEnum
CREATE TYPE "SuggestionKind" AS ENUM ('REASSIGN_MACHINE', 'REPRIORITIZE');

-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('PENDING', 'APPLIED', 'DISMISSED', 'STALE');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ExportFormat" AS ENUM ('CSV', 'PDF');

-- CreateEnum
CREATE TYPE "ExportKind" AS ENUM ('ORDERS', 'SCHEDULE', 'PRODUCTION_STATUS', 'AUDIT_LOG');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "riskCause" "RiskCause" NOT NULL DEFAULT 'NONE';

-- CreateTable
CREATE TABLE "OptimizationSuggestion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "runId" TEXT,
    "kind" "SuggestionKind" NOT NULL,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "orderId" TEXT NOT NULL,
    "entryId" TEXT,
    "fromMachineId" TEXT,
    "toMachineId" TEXT,
    "fromPriority" "OrderPriority",
    "toPriority" "OrderPriority",
    "currentConflicts" INTEGER NOT NULL,
    "projectedConflicts" INTEGER NOT NULL,
    "currentLateMinutes" INTEGER NOT NULL,
    "projectedLateMinutes" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "appliedById" TEXT,
    "appliedAt" TIMESTAMP(3),
    "dismissedById" TEXT,
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OptimizationSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "providerId" TEXT,
    "error" TEXT,
    "notificationId" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "kind" "ExportKind" NOT NULL,
    "format" "ExportFormat" NOT NULL,
    "filters" JSONB,
    "fileName" TEXT NOT NULL,
    "rowCount" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OptimizationSuggestion_tenantId_status_createdAt_idx" ON "OptimizationSuggestion"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "OptimizationSuggestion_tenantId_orderId_idx" ON "OptimizationSuggestion"("tenantId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "OptimizationSuggestion_tenantId_id_key" ON "OptimizationSuggestion"("tenantId", "id");

-- CreateIndex
CREATE INDEX "EmailMessage_tenantId_status_createdAt_idx" ON "EmailMessage"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailMessage_tenantId_id_key" ON "EmailMessage"("tenantId", "id");

-- CreateIndex
CREATE INDEX "ExportJob_tenantId_createdAt_idx" ON "ExportJob"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExportJob_tenantId_id_key" ON "ExportJob"("tenantId", "id");

-- AddForeignKey
ALTER TABLE "OptimizationSuggestion" ADD CONSTRAINT "OptimizationSuggestion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptimizationSuggestion" ADD CONSTRAINT "OptimizationSuggestion_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ScheduleRun"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "OptimizationSuggestion" ADD CONSTRAINT "OptimizationSuggestion_tenantId_orderId_fkey" FOREIGN KEY ("tenantId", "orderId") REFERENCES "Order"("tenantId", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "OptimizationSuggestion" ADD CONSTRAINT "OptimizationSuggestion_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "ScheduleEntry"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "OptimizationSuggestion" ADD CONSTRAINT "OptimizationSuggestion_fromMachineId_fkey" FOREIGN KEY ("fromMachineId") REFERENCES "Machine"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "OptimizationSuggestion" ADD CONSTRAINT "OptimizationSuggestion_toMachineId_fkey" FOREIGN KEY ("toMachineId") REFERENCES "Machine"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "OptimizationSuggestion" ADD CONSTRAINT "OptimizationSuggestion_appliedById_fkey" FOREIGN KEY ("appliedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "OptimizationSuggestion" ADD CONSTRAINT "OptimizationSuggestion_dismissedById_fkey" FOREIGN KEY ("dismissedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
