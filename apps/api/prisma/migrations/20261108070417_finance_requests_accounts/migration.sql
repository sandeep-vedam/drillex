-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('CASH', 'CREDIT');

-- CreateEnum
CREATE TYPE "DeploymentStatus" AS ENUM ('ACTIVE', 'STANDBY', 'MOBILISING', 'DEMOBILISED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "WorkShift" AS ENUM ('DAY', 'NIGHT', 'FULL_DAY');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER', 'CHEQUE', 'CASH', 'MOBILE_MONEY');

-- CreateEnum
CREATE TYPE "RequestType" AS ENUM ('CONSUMABLES', 'EQUIPMENT', 'SAFETY', 'HR', 'FINANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "RequestPriority" AS ENUM ('LOW', 'MEDIUM', 'URGENT');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('RECEIVED', 'IN_PROGRESS', 'RESOLVED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UserStatus" ADD VALUE 'BLOCKED';
ALTER TYPE "UserStatus" ADD VALUE 'SUSPENDED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "failedLogins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "statusChangedAt" TIMESTAMP(3),
ADD COLUMN     "statusReason" TEXT,
ADD COLUMN     "tempCredentialExpiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deployment" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "site" TEXT NOT NULL,
    "contractRef" TEXT,
    "startDate" DATE NOT NULL,
    "expectedEndDate" DATE,
    "ratePerDay" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ZMW',
    "paymentMode" "PaymentMode" NOT NULL DEFAULT 'CASH',
    "creditTermDays" INTEGER,
    "status" "DeploymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "resubmitted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Deployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DaysWorked" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "shift" "WorkShift" NOT NULL,
    "hoursWorked" DECIMAL(4,1) NOT NULL,
    "standbyHours" DECIMAL(4,1) NOT NULL DEFAULT 0,
    "operatorEmployeeId" TEXT NOT NULL,
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "productionNotes" TEXT,
    "createdById" TEXT NOT NULL,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "resubmitted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DaysWorked_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "deploymentId" TEXT,
    "paymentDate" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ZMW',
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "paidFrom" DATE,
    "daysCovered" INTEGER,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "resubmitted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Request" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "type" "RequestType" NOT NULL,
    "priority" "RequestPriority" NOT NULL,
    "details" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'RECEIVED',
    "assetId" TEXT,
    "siteId" TEXT,
    "createdById" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestReply" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "RequestStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestReply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_name_key" ON "Client"("name");

-- CreateIndex
CREATE INDEX "Deployment_assetId_status_idx" ON "Deployment"("assetId", "status");

-- CreateIndex
CREATE INDEX "Deployment_clientId_idx" ON "Deployment"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "DaysWorked_deploymentId_workDate_shift_key" ON "DaysWorked"("deploymentId", "workDate", "shift");

-- CreateIndex
CREATE INDEX "Payment_clientId_paymentDate_idx" ON "Payment"("clientId", "paymentDate");

-- CreateIndex
CREATE UNIQUE INDEX "Request_number_key" ON "Request"("number");

-- CreateIndex
CREATE INDEX "Request_status_createdAt_idx" ON "Request"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Request_createdById_idx" ON "Request"("createdById");

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DaysWorked" ADD CONSTRAINT "DaysWorked_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestReply" ADD CONSTRAINT "RequestReply_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestReply" ADD CONSTRAINT "RequestReply_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Data: the two roles added by the client spec (§2): Finance Manager (FIN) and Plant Hire Supervisor (PSV).
INSERT INTO "Role" ("id", "key", "name", "isSystem", "updatedAt") VALUES
  ('role_finance',               'FINANCE',               'Finance Manager',       true, CURRENT_TIMESTAMP),
  ('role_plant_hire_supervisor', 'PLANT_HIRE_SUPERVISOR', 'Plant Hire Supervisor', true, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- Data: grants per the spec's visibility table (§10.5). Existing grants an admin has changed are left alone.
INSERT INTO "RolePermission" ("id", "roleId", "permission", "scope")
SELECT 'rp_' || lower(r."key") || '_' || replace(g.permission, ':', '_'), r."id", g.permission, g.scope
FROM (VALUES
  -- Finance Manager: finance module + full fleet read
  ('FINANCE', 'asset:read', 'all'), ('FINANCE', 'shift_report:read', 'all'), ('FINANCE', 'daily_reading:read', 'all'),
  ('FINANCE', 'maintenance:read', 'all'), ('FINANCE', 'report:read', 'all'), ('FINANCE', 'report:generate', 'all'),
  ('FINANCE', 'notification:read', 'self'), ('FINANCE', 'finance:read', 'all'), ('FINANCE', 'finance:write', 'all'),
  ('FINANCE', 'finance:review', 'all'), ('FINANCE', 'request:read', 'all'), ('FINANCE', 'request:manage', 'all'),
  -- Plant Hire Supervisor: plant machines, commercial data entry (reviewed), plant operators' requests
  ('PLANT_HIRE_SUPERVISOR', 'asset:read', 'all'), ('PLANT_HIRE_SUPERVISOR', 'daily_reading:read', 'all'),
  ('PLANT_HIRE_SUPERVISOR', 'plant_hire:write', 'all'), ('PLANT_HIRE_SUPERVISOR', 'request:create', 'self'),
  ('PLANT_HIRE_SUPERVISOR', 'request:read', 'all'), ('PLANT_HIRE_SUPERVISOR', 'notification:read', 'self'),
  -- Existing roles gain finance and requests
  ('MANAGER', 'finance:read', 'all'), ('MANAGER', 'finance:write', 'all'), ('MANAGER', 'request:create', 'self'),
  ('MANAGER', 'request:read', 'all'), ('MANAGER', 'request:manage', 'all'),
  ('ADMIN', 'finance:read', 'all'), ('ADMIN', 'finance:write', 'all'), ('ADMIN', 'finance:review', 'all'),
  ('ADMIN', 'request:create', 'self'), ('ADMIN', 'request:read', 'all'), ('ADMIN', 'request:manage', 'all'),
  ('OPERATOR', 'request:create', 'self'), ('OPERATOR', 'request:read', 'self'),
  ('SUPERVISOR', 'request:create', 'self'), ('SUPERVISOR', 'request:read', 'site')
) AS g(role_key, permission, scope)
JOIN "Role" r ON r."key" = g.role_key
ON CONFLICT ("roleId", "permission") DO NOTHING;
