-- CreateEnum
CREATE TYPE "DailyFormType" AS ENUM ('LEGACY', 'RIG', 'PLANT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AssetCategory" ADD VALUE 'EXCAVATOR';
ALTER TYPE "AssetCategory" ADD VALUE 'GRADER';
ALTER TYPE "AssetCategory" ADD VALUE 'TRUCK';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ChemicalUnit" ADD VALUE 'G';
ALTER TYPE "ChemicalUnit" ADD VALUE 'ML';
ALTER TYPE "ChemicalUnit" ADD VALUE 'DRUMS';

-- AlterEnum
ALTER TYPE "FluidLevel" ADD VALUE 'CRITICAL';

-- DropForeignKey
ALTER TABLE "ShiftReportChemical" DROP CONSTRAINT "ShiftReportChemical_chemicalId_fkey";

-- AlterTable
ALTER TABLE "DailyReading" ADD COLUMN     "attachmentCondition" TEXT,
ADD COLUMN     "bitCondition" TEXT,
ADD COLUMN     "brakeFluid" TEXT,
ADD COLUMN     "brakes" TEXT,
ADD COLUMN     "endReading" DECIMAL(10,1),
ADD COLUMN     "enteredById" TEXT,
ADD COLUMN     "faults" TEXT,
ADD COLUMN     "flushPump" "FluidLevel",
ADD COLUMN     "formType" "DailyFormType" NOT NULL DEFAULT 'LEGACY',
ADD COLUMN     "fuelAdded" DECIMAL(8,2),
ADD COLUMN     "fuelLevel" "FluidLevel",
ADD COLUMN     "gearOil" "FluidLevel",
ADD COLUMN     "lights" TEXT,
ADD COLUMN     "rodCondition" TEXT,
ADD COLUMN     "startReading" DECIMAL(10,1),
ADD COLUMN     "supervisorReason" TEXT,
ADD COLUMN     "trackCondition" TEXT,
ADD COLUMN     "tyreCondition" TEXT,
ADD COLUMN     "usage" DECIMAL(10,1),
ALTER COLUMN "hourMeter" DROP NOT NULL,
ALTER COLUMN "fuelStart" DROP NOT NULL,
ALTER COLUMN "fuelEnd" DROP NOT NULL,
ALTER COLUMN "fuelConsumed" DROP NOT NULL,
ALTER COLUMN "engineOil" DROP NOT NULL,
ALTER COLUMN "hydraulicOil" DROP NOT NULL,
ALTER COLUMN "coolant" DROP NOT NULL,
ALTER COLUMN "airFilter" DROP NOT NULL,
ALTER COLUMN "battery" DROP NOT NULL,
ALTER COLUMN "preStartChecklistDone" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ShiftReport" ADD COLUMN     "bitNumber" TEXT,
ADD COLUMN     "bitSize" TEXT,
ADD COLUMN     "endHourMeter" DECIMAL(10,1),
ADD COLUMN     "engineHours" DECIMAL(8,1),
ADD COLUMN     "enteredById" TEXT,
ADD COLUMN     "remarks" TEXT,
ADD COLUMN     "startHourMeter" DECIMAL(10,1),
ADD COLUMN     "supervisorReason" TEXT;

-- AlterTable
ALTER TABLE "ShiftReportChemical" ADD COLUMN     "name" TEXT,
ALTER COLUMN "chemicalId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "ShiftReport" ADD CONSTRAINT "ShiftReport_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftReportChemical" ADD CONSTRAINT "ShiftReportChemical_chemicalId_fkey" FOREIGN KEY ("chemicalId") REFERENCES "Chemical"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReading" ADD CONSTRAINT "DailyReading_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Data: chemical lines now carry the typed name; give existing lines the master-list name they were picked from.
UPDATE "ShiftReportChemical" src SET "name" = c."name" FROM "Chemical" c WHERE src."chemicalId" = c."id" AND src."name" IS NULL;

-- Data: Supervisor Mode (client spec §9.3). Supervisors may enter for operators on their own site, managers anywhere.
-- Only for the built-in roles, and only if an admin has not already granted it.
INSERT INTO "RolePermission" ("id", "roleId", "permission", "scope")
SELECT 'rp_' || lower(r."key") || '_submission_on_behalf', r."id", 'submission:on_behalf', CASE r."key" WHEN 'MANAGER' THEN 'all' ELSE 'site' END
FROM "Role" r
WHERE r."key" IN ('SUPERVISOR', 'MANAGER')
ON CONFLICT ("roleId", "permission") DO NOTHING;
