-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'PLANNER', 'SUPERVISOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('RECEIPT', 'ISSUE', 'ADJUSTMENT', 'RETURN');

-- CreateEnum
CREATE TYPE "MachineStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "DowntimeType" AS ENUM ('MAINTENANCE', 'BREAKDOWN', 'OTHER');

-- CreateEnum
CREATE TYPE "OrderPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('QUEUED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImportBatchStatus" AS ENUM ('PENDING', 'COMMITTED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'IMPORT', 'LOGIN');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "orderSeq" INTEGER NOT NULL DEFAULT 0,
    "defaultCalendarId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductOperation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "workCenterId" TEXT NOT NULL,
    "machineId" TEXT,
    "setupMinutes" INTEGER NOT NULL DEFAULT 0,
    "runMinutesPerUnit" DECIMAL(14,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "stockOnHand" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "reorderThreshold" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "reorderLeadTimeDays" INTEGER NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(14,2),
    "supplier" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BomItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantityPerUnit" DECIMAL(14,3) NOT NULL,
    "scrapPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BomItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "balanceAfter" DECIMAL(14,3) NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkCenter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkCenter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftCalendar" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "daysOfWeek" INTEGER[],
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarException" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "isWorking" BOOLEAN NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Machine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workCenterId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "MachineStatus" NOT NULL DEFAULT 'ACTIVE',
    "efficiencyPercent" INTEGER NOT NULL DEFAULT 100,
    "ratedCapacityPerShift" DECIMAL(14,3),
    "capacityUnit" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Machine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DowntimeWindow" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "type" "DowntimeType" NOT NULL,
    "reason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DowntimeWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "priority" "OrderPriority" NOT NULL DEFAULT 'NORMAL',
    "dueDate" DATE NOT NULL,
    "earliestStartDate" DATE,
    "status" "OrderStatus" NOT NULL DEFAULT 'QUEUED',
    "completedAt" TIMESTAMP(3),
    "customerPoRef" TEXT,
    "notes" TEXT,
    "importBatchId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" "ImportBatchStatus" NOT NULL DEFAULT 'PENDING',
    "rows" JSONB,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "validCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorEmail" TEXT,
    "actorName" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityLabel" TEXT,
    "action" "AuditAction" NOT NULL,
    "summary" TEXT NOT NULL,
    "changedFields" TEXT[],
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_id_key" ON "User"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_tenantId_id_key" ON "Customer"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_tenantId_name_key" ON "Customer"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Product_tenantId_id_key" ON "Product"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Product_tenantId_sku_key" ON "Product"("tenantId", "sku");

-- CreateIndex
CREATE INDEX "ProductOperation_tenantId_workCenterId_idx" ON "ProductOperation"("tenantId", "workCenterId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOperation_tenantId_id_key" ON "ProductOperation"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOperation_tenantId_productId_sequence_key" ON "ProductOperation"("tenantId", "productId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "Material_tenantId_id_key" ON "Material"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Material_tenantId_code_key" ON "Material"("tenantId", "code");

-- CreateIndex
CREATE INDEX "BomItem_tenantId_materialId_idx" ON "BomItem"("tenantId", "materialId");

-- CreateIndex
CREATE UNIQUE INDEX "BomItem_tenantId_id_key" ON "BomItem"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "BomItem_tenantId_productId_materialId_key" ON "BomItem"("tenantId", "productId", "materialId");

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_materialId_createdAt_idx" ON "StockMovement"("tenantId", "materialId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkCenter_tenantId_id_key" ON "WorkCenter"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "WorkCenter_tenantId_code_key" ON "WorkCenter"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftCalendar_tenantId_id_key" ON "ShiftCalendar"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftCalendar_tenantId_name_key" ON "ShiftCalendar"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Shift_tenantId_calendarId_idx" ON "Shift"("tenantId", "calendarId");

-- CreateIndex
CREATE UNIQUE INDEX "Shift_tenantId_id_key" ON "Shift"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarException_tenantId_calendarId_date_key" ON "CalendarException"("tenantId", "calendarId", "date");

-- CreateIndex
CREATE INDEX "Machine_tenantId_workCenterId_idx" ON "Machine"("tenantId", "workCenterId");

-- CreateIndex
CREATE UNIQUE INDEX "Machine_tenantId_id_key" ON "Machine"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Machine_tenantId_code_key" ON "Machine"("tenantId", "code");

-- CreateIndex
CREATE INDEX "DowntimeWindow_tenantId_machineId_startsAt_idx" ON "DowntimeWindow"("tenantId", "machineId", "startsAt");

-- CreateIndex
CREATE INDEX "Order_tenantId_dueDate_idx" ON "Order"("tenantId", "dueDate");

-- CreateIndex
CREATE INDEX "Order_tenantId_status_idx" ON "Order"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Order_tenantId_customerId_idx" ON "Order"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "Order_tenantId_productId_idx" ON "Order"("tenantId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_tenantId_id_key" ON "Order"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Order_tenantId_orderNumber_key" ON "Order"("tenantId", "orderNumber");

-- CreateIndex
CREATE INDEX "ImportBatch_tenantId_createdAt_idx" ON "ImportBatch"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatch_tenantId_id_key" ON "ImportBatch"("tenantId", "id");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_entityType_entityId_idx" ON "AuditLog"("tenantId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_defaultCalendarId_fkey" FOREIGN KEY ("defaultCalendarId") REFERENCES "ShiftCalendar"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOperation" ADD CONSTRAINT "ProductOperation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOperation" ADD CONSTRAINT "ProductOperation_tenantId_productId_fkey" FOREIGN KEY ("tenantId", "productId") REFERENCES "Product"("tenantId", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ProductOperation" ADD CONSTRAINT "ProductOperation_tenantId_workCenterId_fkey" FOREIGN KEY ("tenantId", "workCenterId") REFERENCES "WorkCenter"("tenantId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ProductOperation" ADD CONSTRAINT "ProductOperation_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomItem" ADD CONSTRAINT "BomItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomItem" ADD CONSTRAINT "BomItem_tenantId_productId_fkey" FOREIGN KEY ("tenantId", "productId") REFERENCES "Product"("tenantId", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "BomItem" ADD CONSTRAINT "BomItem_tenantId_materialId_fkey" FOREIGN KEY ("tenantId", "materialId") REFERENCES "Material"("tenantId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_tenantId_materialId_fkey" FOREIGN KEY ("tenantId", "materialId") REFERENCES "Material"("tenantId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "WorkCenter" ADD CONSTRAINT "WorkCenter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftCalendar" ADD CONSTRAINT "ShiftCalendar_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_tenantId_calendarId_fkey" FOREIGN KEY ("tenantId", "calendarId") REFERENCES "ShiftCalendar"("tenantId", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CalendarException" ADD CONSTRAINT "CalendarException_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarException" ADD CONSTRAINT "CalendarException_tenantId_calendarId_fkey" FOREIGN KEY ("tenantId", "calendarId") REFERENCES "ShiftCalendar"("tenantId", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_tenantId_workCenterId_fkey" FOREIGN KEY ("tenantId", "workCenterId") REFERENCES "WorkCenter"("tenantId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_tenantId_calendarId_fkey" FOREIGN KEY ("tenantId", "calendarId") REFERENCES "ShiftCalendar"("tenantId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "DowntimeWindow" ADD CONSTRAINT "DowntimeWindow_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DowntimeWindow" ADD CONSTRAINT "DowntimeWindow_tenantId_machineId_fkey" FOREIGN KEY ("tenantId", "machineId") REFERENCES "Machine"("tenantId", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "DowntimeWindow" ADD CONSTRAINT "DowntimeWindow_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_tenantId_customerId_fkey" FOREIGN KEY ("tenantId", "customerId") REFERENCES "Customer"("tenantId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_tenantId_productId_fkey" FOREIGN KEY ("tenantId", "productId") REFERENCES "Product"("tenantId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
