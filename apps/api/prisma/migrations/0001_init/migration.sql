-- CreateTable
CREATE TABLE `SystemSetting` (
    `key` VARCHAR(191) NOT NULL,
    `value` JSON NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedBy` VARCHAR(191) NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Site` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `latitude` DOUBLE NULL,
    `longitude` DOUBLE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Site_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `role` ENUM('OPERATOR', 'TECHNICIAN', 'SUPERVISOR', 'MANAGER', 'ADMIN') NOT NULL,
    `status` ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `passwordHash` VARCHAR(191) NOT NULL,
    `totpSecret` VARCHAR(191) NULL,
    `totpEnabled` BOOLEAN NOT NULL DEFAULT false,
    `mustChangePassword` BOOLEAN NOT NULL DEFAULT false,
    `siteId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_employeeId_key`(`employeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Device` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `deviceId` VARCHAR(191) NOT NULL,
    `platform` VARCHAR(191) NULL,
    `pushToken` VARCHAR(191) NULL,
    `approved` BOOLEAN NOT NULL DEFAULT true,
    `lastSeen` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Device_userId_deviceId_key`(`userId`, `deviceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LoginEvent` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `deviceId` VARCHAR(191) NOT NULL,
    `success` BOOLEAN NOT NULL,
    `ip` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LoginEvent_employeeId_createdAt_idx`(`employeeId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RefreshToken` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `deviceId` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `RefreshToken_tokenHash_key`(`tokenHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Asset` (
    `id` VARCHAR(191) NOT NULL,
    `assetNumber` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `category` ENUM('DRILLING', 'HAULAGE', 'COMPRESSOR', 'ANCILLARY', 'OTHER') NOT NULL,
    `make` VARCHAR(191) NOT NULL,
    `model` VARCHAR(191) NOT NULL,
    `serialNumber` VARCHAR(191) NOT NULL,
    `yearOfManufacture` INTEGER NOT NULL,
    `commissionedAt` DATETIME(3) NOT NULL,
    `siteId` VARCHAR(191) NOT NULL,
    `status` ENUM('ACTIVE', 'UNDER_MAINTENANCE', 'IDLE', 'DECOMMISSIONED') NOT NULL DEFAULT 'ACTIVE',
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Asset_assetNumber_key`(`assetNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AssetOperator` (
    `assetId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `validFrom` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `validTo` DATETIME(3) NULL,

    PRIMARY KEY (`assetId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Chemical` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `defaultUnit` ENUM('LITRES', 'KG', 'BAGS') NOT NULL,
    `unitCost` DECIMAL(12, 2) NULL,
    `monthlyBudget` DECIMAL(12, 2) NULL,

    UNIQUE INDEX `Chemical_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ShiftReport` (
    `id` VARCHAR(191) NOT NULL,
    `assetId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `siteId` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `shift` ENUM('DAY', 'NIGHT') NOT NULL,
    `holeRef` VARCHAR(191) NOT NULL,
    `startDepth` DECIMAL(10, 2) NOT NULL,
    `endDepth` DECIMAL(10, 2) NOT NULL,
    `totalMeters` DECIMAL(10, 2) NOT NULL,
    `holesCompleted` INTEGER NOT NULL,
    `holeDiameterMm` DECIMAL(8, 2) NOT NULL,
    `rockType` VARCHAR(191) NOT NULL,
    `penetrationRate` DECIMAL(8, 2) NOT NULL,
    `downtimeHours` DECIMAL(6, 2) NOT NULL DEFAULT 0,
    `downtimeReason` TEXT NULL,
    `status` ENUM('SUBMITTED', 'APPROVED', 'UNLOCKED') NOT NULL DEFAULT 'SUBMITTED',
    `signatureId` VARCHAR(191) NULL,
    `submittedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `approvedById` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `ShiftReport_siteId_date_idx`(`siteId`, `date`),
    UNIQUE INDEX `ShiftReport_assetId_date_shift_key`(`assetId`, `date`, `shift`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ShiftReportChemical` (
    `id` VARCHAR(191) NOT NULL,
    `shiftReportId` VARCHAR(191) NOT NULL,
    `chemicalId` VARCHAR(191) NOT NULL,
    `quantity` DECIMAL(10, 2) NOT NULL,
    `unit` ENUM('LITRES', 'KG', 'BAGS') NOT NULL,
    `purpose` TEXT NULL,
    `stockOnHand` DECIMAL(10, 2) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DailyReading` (
    `id` VARCHAR(191) NOT NULL,
    `assetId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `hourMeter` DECIMAL(10, 1) NOT NULL,
    `fuelStart` DECIMAL(8, 2) NOT NULL,
    `fuelEnd` DECIMAL(8, 2) NOT NULL,
    `fuelConsumed` DECIMAL(8, 2) NOT NULL,
    `engineOil` ENUM('OK', 'LOW', 'ADD', 'CHANGE_REQUIRED') NOT NULL,
    `hydraulicOil` ENUM('OK', 'LOW', 'ADD', 'CHANGE_REQUIRED') NOT NULL,
    `coolant` ENUM('OK', 'LOW', 'ADD', 'CHANGE_REQUIRED') NOT NULL,
    `airFilter` ENUM('OK', 'BLOCKED', 'CHANGED') NOT NULL,
    `tyrePressures` JSON NOT NULL,
    `battery` ENUM('OK', 'WEAK', 'FLAT') NOT NULL,
    `warningLights` BOOLEAN NOT NULL,
    `warningLightsNote` TEXT NULL,
    `unusualNoises` BOOLEAN NOT NULL,
    `unusualNoisesNote` TEXT NULL,
    `leaks` BOOLEAN NOT NULL,
    `leaksNote` TEXT NULL,
    `preStartChecklistDone` BOOLEAN NOT NULL,
    `conditionRating` INTEGER NOT NULL,
    `notes` TEXT NULL,
    `signatureId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `DailyReading_assetId_date_key`(`assetId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MaintenanceSchedule` (
    `id` VARCHAR(191) NOT NULL,
    `assetId` VARCHAR(191) NOT NULL,
    `serviceType` ENUM('HR_250', 'HR_500', 'HR_1000', 'ANNUAL', 'CONDITION_BASED', 'AD_HOC') NOT NULL,
    `description` TEXT NOT NULL,
    `intervalHours` INTEGER NULL,
    `intervalDays` INTEGER NULL,
    `lastServiceAt` DATETIME(3) NULL,
    `lastServiceHours` DECIMAL(10, 1) NULL,
    `nextDueAt` DATETIME(3) NULL,
    `nextDueHours` DECIMAL(10, 1) NULL,
    `reminderLeadDays` INTEGER NOT NULL DEFAULT 3,
    `status` ENUM('UPCOMING', 'DUE_NOW', 'OVERDUE', 'COMPLETED') NOT NULL DEFAULT 'UPCOMING',
    `estDowntimeHours` DECIMAL(6, 2) NULL,
    `notes` TEXT NULL,
    `technicianIds` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MaintenanceSchedulePart` (
    `id` VARCHAR(191) NOT NULL,
    `scheduleId` VARCHAR(191) NOT NULL,
    `partId` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `JobCard` (
    `id` VARCHAR(191) NOT NULL,
    `jobNo` VARCHAR(191) NOT NULL,
    `assetId` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `jobType` ENUM('SCHEDULED_SERVICE', 'BREAKDOWN_REPAIR', 'MODIFICATION', 'INSPECTION') NOT NULL,
    `reportedFault` TEXT NULL,
    `workPerformed` TEXT NOT NULL,
    `hourMeter` DECIMAL(10, 1) NULL,
    `labourHours` DECIMAL(6, 2) NULL,
    `technicianIds` JSON NOT NULL,
    `toolsUsed` TEXT NULL,
    `conditionBefore` INTEGER NULL,
    `conditionAfter` INTEGER NULL,
    `testResult` ENUM('PASSED', 'FAILED', 'PENDING') NULL,
    `nextAction` TEXT NULL,
    `status` ENUM('OPEN', 'IN_PROGRESS', 'COMPLETED', 'AWAITING_PARTS') NOT NULL DEFAULT 'OPEN',
    `techSignatureId` VARCHAR(191) NULL,
    `approvedById` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `JobCard_jobNo_key`(`jobNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Part` (
    `id` VARCHAR(191) NOT NULL,
    `partNo` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `qtyOnHand` INTEGER NOT NULL DEFAULT 0,
    `minQty` INTEGER NOT NULL DEFAULT 0,
    `unitCost` DECIMAL(12, 2) NULL,

    UNIQUE INDEX `Part_partNo_key`(`partNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `JobCardPart` (
    `id` VARCHAR(191) NOT NULL,
    `jobCardId` VARCHAR(191) NOT NULL,
    `partId` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PurchaseRequest` (
    `id` VARCHAR(191) NOT NULL,
    `partId` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `status` ENUM('OPEN', 'ORDERED', 'RECEIVED', 'CANCELLED') NOT NULL DEFAULT 'OPEN',
    `requestedBy` VARCHAR(191) NOT NULL,
    `notes` TEXT NULL,
    `orderedAt` DATETIME(3) NULL,
    `receivedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PartStockMovement` (
    `id` VARCHAR(191) NOT NULL,
    `partId` VARCHAR(191) NOT NULL,
    `type` ENUM('IN', 'OUT', 'ADJUST') NOT NULL,
    `quantity` INTEGER NOT NULL,
    `reference` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Attachment` (
    `id` VARCHAR(191) NOT NULL,
    `ownerType` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NOT NULL,
    `kind` ENUM('PHOTO', 'DOCUMENT', 'SIGNATURE') NOT NULL,
    `storageKey` VARCHAR(191) NOT NULL,
    `mimeType` VARCHAR(191) NULL,
    `sha256` VARCHAR(191) NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Attachment_ownerType_ownerId_idx`(`ownerType`, `ownerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `title` TEXT NOT NULL,
    `body` TEXT NULL,
    `payload` JSON NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_userId_readAt_idx`(`userId`, `readAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Alert` (
    `id` VARCHAR(191) NOT NULL,
    `assetId` VARCHAR(191) NOT NULL,
    `source` VARCHAR(191) NOT NULL,
    `severity` VARCHAR(191) NOT NULL,
    `message` TEXT NOT NULL,
    `resolvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Report` (
    `id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `periodStart` DATETIME(3) NOT NULL,
    `periodEnd` DATETIME(3) NOT NULL,
    `pdfKey` VARCHAR(191) NULL,
    `xlsxKey` VARCHAR(191) NULL,
    `generatedBy` VARCHAR(191) NULL,
    `generatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `deviceId` VARCHAR(191) NULL,
    `entity` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `diff` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_entity_entityId_idx`(`entity`, `entityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SyncConflict` (
    `id` VARCHAR(191) NOT NULL,
    `entity` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NOT NULL,
    `versions` JSON NOT NULL,
    `resolvedBy` VARCHAR(191) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_siteId_fkey` FOREIGN KEY (`siteId`) REFERENCES `Site`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Device` ADD CONSTRAINT `Device_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LoginEvent` ADD CONSTRAINT `LoginEvent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RefreshToken` ADD CONSTRAINT `RefreshToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Asset` ADD CONSTRAINT `Asset_siteId_fkey` FOREIGN KEY (`siteId`) REFERENCES `Site`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssetOperator` ADD CONSTRAINT `AssetOperator_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `Asset`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssetOperator` ADD CONSTRAINT `AssetOperator_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ShiftReport` ADD CONSTRAINT `ShiftReport_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `Asset`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ShiftReport` ADD CONSTRAINT `ShiftReport_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ShiftReport` ADD CONSTRAINT `ShiftReport_siteId_fkey` FOREIGN KEY (`siteId`) REFERENCES `Site`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ShiftReportChemical` ADD CONSTRAINT `ShiftReportChemical_shiftReportId_fkey` FOREIGN KEY (`shiftReportId`) REFERENCES `ShiftReport`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ShiftReportChemical` ADD CONSTRAINT `ShiftReportChemical_chemicalId_fkey` FOREIGN KEY (`chemicalId`) REFERENCES `Chemical`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DailyReading` ADD CONSTRAINT `DailyReading_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `Asset`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DailyReading` ADD CONSTRAINT `DailyReading_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaintenanceSchedule` ADD CONSTRAINT `MaintenanceSchedule_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `Asset`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaintenanceSchedulePart` ADD CONSTRAINT `MaintenanceSchedulePart_scheduleId_fkey` FOREIGN KEY (`scheduleId`) REFERENCES `MaintenanceSchedule`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaintenanceSchedulePart` ADD CONSTRAINT `MaintenanceSchedulePart_partId_fkey` FOREIGN KEY (`partId`) REFERENCES `Part`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JobCard` ADD CONSTRAINT `JobCard_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `Asset`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JobCardPart` ADD CONSTRAINT `JobCardPart_jobCardId_fkey` FOREIGN KEY (`jobCardId`) REFERENCES `JobCard`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JobCardPart` ADD CONSTRAINT `JobCardPart_partId_fkey` FOREIGN KEY (`partId`) REFERENCES `Part`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseRequest` ADD CONSTRAINT `PurchaseRequest_partId_fkey` FOREIGN KEY (`partId`) REFERENCES `Part`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartStockMovement` ADD CONSTRAINT `PartStockMovement_partId_fkey` FOREIGN KEY (`partId`) REFERENCES `Part`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Alert` ADD CONSTRAINT `Alert_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `Asset`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

