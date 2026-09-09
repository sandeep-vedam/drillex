-- Drillex Ops — complete MySQL 8 database (schema + starter users).
--
-- Use this when you cannot run `prisma migrate deploy` on the server — e.g. a
-- host that only gives you phpMyAdmin. The normal path is infra/deploy.sh,
-- which migrates automatically; see docs/DEPLOYMENT.md.
--
-- Import into an EMPTY database:
--     mysql -u <user> -p <database> < infra/drillex-mysql.sql
-- or in phpMyAdmin: select your database -> Import -> choose this file.
--
-- Deliberately free of session-variable and SUPER-privilege statements, so it
-- imports as an ordinary restricted database user on shared hosting.
--
-- Includes the _prisma_migrations row marking 0001_init as applied, so a later
-- `prisma migrate deploy` sees an up-to-date database rather than trying to
-- recreate every table.
--
-- Starter logins: ADM001 / MGR001 / SUP001 / TEC001 / OPR001
-- Password: Password123 — sign in as ADM001 and change it immediately.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE `_prisma_migrations` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `checksum` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `finished_at` datetime(3) DEFAULT NULL,
  `migration_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `logs` text COLLATE utf8mb4_unicode_ci,
  `rolled_back_at` datetime(3) DEFAULT NULL,
  `started_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `applied_steps_count` int unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO `_prisma_migrations` VALUES ('0f93a547-734d-444b-997e-a108f012ddaa','1b1489388d909b67b5369efac8796e461ef4d35a34adb3f1fc4fb897c8046b41','2026-09-09 08:53:11.990','0001_init',NULL,NULL,'2026-09-09 08:53:11.637',1);
CREATE TABLE `Alert` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `assetId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `source` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `severity` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `resolvedAt` datetime(3) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `Alert_assetId_fkey` (`assetId`),
  CONSTRAINT `Alert_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `Asset` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `Asset` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `assetNumber` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` enum('DRILLING','HAULAGE','COMPRESSOR','ANCILLARY','OTHER') COLLATE utf8mb4_unicode_ci NOT NULL,
  `make` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `model` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `serialNumber` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `yearOfManufacture` int NOT NULL,
  `commissionedAt` datetime(3) NOT NULL,
  `siteId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('ACTIVE','UNDER_MAINTENANCE','IDLE','DECOMMISSIONED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  `deletedAt` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `Asset_assetNumber_key` (`assetNumber`),
  KEY `Asset_siteId_fkey` (`siteId`),
  CONSTRAINT `Asset_siteId_fkey` FOREIGN KEY (`siteId`) REFERENCES `Site` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO `Asset` VALUES ('d0deb5e7-05aa-44fe-b0e6-3528124ccd7a','DRL-001','Drill Rig #1','DRILLING','Sandvik','DP1500i','SN-0001',2021,'2021-06-01 00:00:00.000','8bd75c9a-16f1-4cd1-80fe-f8d8ea863c6b','ACTIVE',NULL,'2026-09-09 08:53:12.312','2026-09-09 08:53:12.312',NULL);
CREATE TABLE `AssetOperator` (
  `assetId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `validFrom` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `validTo` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`assetId`,`userId`),
  KEY `AssetOperator_userId_fkey` (`userId`),
  CONSTRAINT `AssetOperator_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `Asset` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `AssetOperator_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO `AssetOperator` VALUES ('d0deb5e7-05aa-44fe-b0e6-3528124ccd7a','b32722e7-5445-45ed-a5e1-f5052b6647d7','2026-09-09 08:53:12.316',NULL);
CREATE TABLE `Attachment` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ownerType` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ownerId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `kind` enum('PHOTO','DOCUMENT','SIGNATURE') COLLATE utf8mb4_unicode_ci NOT NULL,
  `storageKey` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mimeType` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sha256` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdBy` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `Attachment_ownerType_ownerId_idx` (`ownerType`,`ownerId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `AuditLog` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `actorId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `deviceId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `entity` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entityId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `action` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `diff` json DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `AuditLog_entity_entityId_idx` (`entity`,`entityId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `Chemical` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `defaultUnit` enum('LITRES','KG','BAGS') COLLATE utf8mb4_unicode_ci NOT NULL,
  `unitCost` decimal(12,2) DEFAULT NULL,
  `monthlyBudget` decimal(12,2) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `Chemical_name_key` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO `Chemical` VALUES ('1634332f-bdf0-4696-b712-274e85795590','Foam','LITRES',NULL,NULL),('34029320-857c-42e3-998e-78142305dd94','Bentonite','KG',NULL,NULL),('c2e7b372-2d02-4cae-b86d-0afb0f953caa','Polymer','LITRES',NULL,NULL);
CREATE TABLE `DailyReading` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `assetId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `date` date NOT NULL,
  `hourMeter` decimal(10,1) NOT NULL,
  `fuelStart` decimal(8,2) NOT NULL,
  `fuelEnd` decimal(8,2) NOT NULL,
  `fuelConsumed` decimal(8,2) NOT NULL,
  `engineOil` enum('OK','LOW','ADD','CHANGE_REQUIRED') COLLATE utf8mb4_unicode_ci NOT NULL,
  `hydraulicOil` enum('OK','LOW','ADD','CHANGE_REQUIRED') COLLATE utf8mb4_unicode_ci NOT NULL,
  `coolant` enum('OK','LOW','ADD','CHANGE_REQUIRED') COLLATE utf8mb4_unicode_ci NOT NULL,
  `airFilter` enum('OK','BLOCKED','CHANGED') COLLATE utf8mb4_unicode_ci NOT NULL,
  `tyrePressures` json NOT NULL,
  `battery` enum('OK','WEAK','FLAT') COLLATE utf8mb4_unicode_ci NOT NULL,
  `warningLights` tinyint(1) NOT NULL,
  `warningLightsNote` text COLLATE utf8mb4_unicode_ci,
  `unusualNoises` tinyint(1) NOT NULL,
  `unusualNoisesNote` text COLLATE utf8mb4_unicode_ci,
  `leaks` tinyint(1) NOT NULL,
  `leaksNote` text COLLATE utf8mb4_unicode_ci,
  `preStartChecklistDone` tinyint(1) NOT NULL,
  `conditionRating` int NOT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `signatureId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  `deletedAt` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `DailyReading_assetId_date_key` (`assetId`,`date`),
  KEY `DailyReading_userId_fkey` (`userId`),
  CONSTRAINT `DailyReading_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `Asset` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `DailyReading_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `Device` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `deviceId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `platform` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pushToken` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `approved` tinyint(1) NOT NULL DEFAULT '1',
  `lastSeen` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `Device_userId_deviceId_key` (`userId`,`deviceId`),
  CONSTRAINT `Device_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `JobCard` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `jobNo` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `assetId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `date` date NOT NULL,
  `jobType` enum('SCHEDULED_SERVICE','BREAKDOWN_REPAIR','MODIFICATION','INSPECTION') COLLATE utf8mb4_unicode_ci NOT NULL,
  `reportedFault` text COLLATE utf8mb4_unicode_ci,
  `workPerformed` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `hourMeter` decimal(10,1) DEFAULT NULL,
  `labourHours` decimal(6,2) DEFAULT NULL,
  `technicianIds` json NOT NULL,
  `toolsUsed` text COLLATE utf8mb4_unicode_ci,
  `conditionBefore` int DEFAULT NULL,
  `conditionAfter` int DEFAULT NULL,
  `testResult` enum('PASSED','FAILED','PENDING') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `nextAction` text COLLATE utf8mb4_unicode_ci,
  `status` enum('OPEN','IN_PROGRESS','COMPLETED','AWAITING_PARTS') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'OPEN',
  `techSignatureId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `approvedById` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `approvedAt` datetime(3) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  `deletedAt` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `JobCard_jobNo_key` (`jobNo`),
  KEY `JobCard_assetId_fkey` (`assetId`),
  CONSTRAINT `JobCard_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `Asset` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `JobCardPart` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `jobCardId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `partId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `JobCardPart_jobCardId_fkey` (`jobCardId`),
  KEY `JobCardPart_partId_fkey` (`partId`),
  CONSTRAINT `JobCardPart_jobCardId_fkey` FOREIGN KEY (`jobCardId`) REFERENCES `JobCard` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `JobCardPart_partId_fkey` FOREIGN KEY (`partId`) REFERENCES `Part` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `LoginEvent` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `employeeId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `deviceId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `success` tinyint(1) NOT NULL,
  `ip` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `LoginEvent_employeeId_createdAt_idx` (`employeeId`,`createdAt`),
  KEY `LoginEvent_userId_fkey` (`userId`),
  CONSTRAINT `LoginEvent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `MaintenanceSchedule` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `assetId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `serviceType` enum('HR_250','HR_500','HR_1000','ANNUAL','CONDITION_BASED','AD_HOC') COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `intervalHours` int DEFAULT NULL,
  `intervalDays` int DEFAULT NULL,
  `lastServiceAt` datetime(3) DEFAULT NULL,
  `lastServiceHours` decimal(10,1) DEFAULT NULL,
  `nextDueAt` datetime(3) DEFAULT NULL,
  `nextDueHours` decimal(10,1) DEFAULT NULL,
  `reminderLeadDays` int NOT NULL DEFAULT '3',
  `status` enum('UPCOMING','DUE_NOW','OVERDUE','COMPLETED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'UPCOMING',
  `estDowntimeHours` decimal(6,2) DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `technicianIds` json NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  `deletedAt` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `MaintenanceSchedule_assetId_fkey` (`assetId`),
  CONSTRAINT `MaintenanceSchedule_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `Asset` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `MaintenanceSchedulePart` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `scheduleId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `partId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `MaintenanceSchedulePart_scheduleId_fkey` (`scheduleId`),
  KEY `MaintenanceSchedulePart_partId_fkey` (`partId`),
  CONSTRAINT `MaintenanceSchedulePart_partId_fkey` FOREIGN KEY (`partId`) REFERENCES `Part` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `MaintenanceSchedulePart_scheduleId_fkey` FOREIGN KEY (`scheduleId`) REFERENCES `MaintenanceSchedule` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `Notification` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `body` text COLLATE utf8mb4_unicode_ci,
  `payload` json DEFAULT NULL,
  `readAt` datetime(3) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `Notification_userId_readAt_idx` (`userId`,`readAt`),
  CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `Part` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `partNo` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `qtyOnHand` int NOT NULL DEFAULT '0',
  `minQty` int NOT NULL DEFAULT '0',
  `unitCost` decimal(12,2) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `Part_partNo_key` (`partNo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO `Part` VALUES ('3bbfd0af-4bc2-4893-958c-8dc8ea500b95','FLT-HYD-02','Hydraulic return filter',6,2,42.00),('3f6591f9-17e3-426b-9a97-8bb34bff7ccf','BLT-ALT-07','Alternator belt',2,2,28.00),('8bdd7f91-93c8-4cb9-a464-89b4e9284a3a','FLT-AIR-03','Air filter element',3,4,35.00),('91d56aea-2fbb-4b53-8cf4-92c5369716c6','FLT-OIL-01','Engine oil filter',12,4,18.50),('a02d6b1c-12fa-4165-8719-cf63c73d10ff','OIL-15W40-20L','Engine oil 15W40 (20 L)',10,3,95.00),('df0bd717-9b2c-421e-8370-d7af9184a3e3','GRS-EP2-18KG','EP2 grease (18 kg)',4,2,70.00);
CREATE TABLE `PartStockMovement` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `partId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('IN','OUT','ADJUST') COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` int NOT NULL,
  `reference` text COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `PartStockMovement_partId_fkey` (`partId`),
  CONSTRAINT `PartStockMovement_partId_fkey` FOREIGN KEY (`partId`) REFERENCES `Part` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `PurchaseRequest` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `partId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` int NOT NULL,
  `status` enum('OPEN','ORDERED','RECEIVED','CANCELLED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'OPEN',
  `requestedBy` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `orderedAt` datetime(3) DEFAULT NULL,
  `receivedAt` datetime(3) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `PurchaseRequest_partId_fkey` (`partId`),
  CONSTRAINT `PurchaseRequest_partId_fkey` FOREIGN KEY (`partId`) REFERENCES `Part` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `RefreshToken` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tokenHash` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `deviceId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expiresAt` datetime(3) NOT NULL,
  `revokedAt` datetime(3) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `RefreshToken_tokenHash_key` (`tokenHash`),
  KEY `RefreshToken_userId_fkey` (`userId`),
  CONSTRAINT `RefreshToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `Report` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `periodStart` datetime(3) NOT NULL,
  `periodEnd` datetime(3) NOT NULL,
  `pdfKey` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `xlsxKey` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `generatedBy` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `generatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `ShiftReport` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `assetId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `siteId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `date` date NOT NULL,
  `shift` enum('DAY','NIGHT') COLLATE utf8mb4_unicode_ci NOT NULL,
  `holeRef` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `startDepth` decimal(10,2) NOT NULL,
  `endDepth` decimal(10,2) NOT NULL,
  `totalMeters` decimal(10,2) NOT NULL,
  `holesCompleted` int NOT NULL,
  `holeDiameterMm` decimal(8,2) NOT NULL,
  `rockType` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `penetrationRate` decimal(8,2) NOT NULL,
  `downtimeHours` decimal(6,2) NOT NULL DEFAULT '0.00',
  `downtimeReason` text COLLATE utf8mb4_unicode_ci,
  `status` enum('SUBMITTED','APPROVED','UNLOCKED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'SUBMITTED',
  `signatureId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `submittedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `approvedById` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `approvedAt` datetime(3) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  `deletedAt` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ShiftReport_assetId_date_shift_key` (`assetId`,`date`,`shift`),
  KEY `ShiftReport_siteId_date_idx` (`siteId`,`date`),
  KEY `ShiftReport_userId_fkey` (`userId`),
  CONSTRAINT `ShiftReport_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `Asset` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ShiftReport_siteId_fkey` FOREIGN KEY (`siteId`) REFERENCES `Site` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ShiftReport_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `ShiftReportChemical` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `shiftReportId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `chemicalId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` decimal(10,2) NOT NULL,
  `unit` enum('LITRES','KG','BAGS') COLLATE utf8mb4_unicode_ci NOT NULL,
  `purpose` text COLLATE utf8mb4_unicode_ci,
  `stockOnHand` decimal(10,2) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ShiftReportChemical_shiftReportId_fkey` (`shiftReportId`),
  KEY `ShiftReportChemical_chemicalId_fkey` (`chemicalId`),
  CONSTRAINT `ShiftReportChemical_chemicalId_fkey` FOREIGN KEY (`chemicalId`) REFERENCES `Chemical` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ShiftReportChemical_shiftReportId_fkey` FOREIGN KEY (`shiftReportId`) REFERENCES `ShiftReport` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `Site` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `latitude` double DEFAULT NULL,
  `longitude` double DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `Site_name_key` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO `Site` VALUES ('8bd75c9a-16f1-4cd1-80fe-f8d8ea863c6b','Main Site',NULL,NULL,'2026-09-09 08:53:12.256','2026-09-09 08:53:12.256');
CREATE TABLE `SyncConflict` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entityId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `versions` json NOT NULL,
  `resolvedBy` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `resolvedAt` datetime(3) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `SystemSetting` (
  `key` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `value` json NOT NULL,
  `updatedAt` datetime(3) NOT NULL,
  `updatedBy` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `User` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `employeeId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` enum('OPERATOR','TECHNICIAN','SUPERVISOR','MANAGER','ADMIN') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('ACTIVE','DISABLED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `passwordHash` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `totpSecret` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `totpEnabled` tinyint(1) NOT NULL DEFAULT '0',
  `mustChangePassword` tinyint(1) NOT NULL DEFAULT '0',
  `siteId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `User_employeeId_key` (`employeeId`),
  KEY `User_siteId_fkey` (`siteId`),
  CONSTRAINT `User_siteId_fkey` FOREIGN KEY (`siteId`) REFERENCES `Site` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO `User` VALUES ('3eb55c66-4642-4efb-92ee-6f003c30af21','TEC001','Fitter One','TECHNICIAN','ACTIVE','$argon2id$v=19$m=65536,t=3,p=4$rWkba30nsfBZfn3SGkF6Ag$i3NUhmKcMEkL/VVnSJbM1pKjsf9Fg/Ae2vlhfkyMJeY',NULL,0,0,'8bd75c9a-16f1-4cd1-80fe-f8d8ea863c6b','2026-09-09 08:53:12.308','2026-09-09 08:53:12.308'),('b32722e7-5445-45ed-a5e1-f5052b6647d7','OPR001','Driller One','OPERATOR','ACTIVE','$argon2id$v=19$m=65536,t=3,p=4$rWkba30nsfBZfn3SGkF6Ag$i3NUhmKcMEkL/VVnSJbM1pKjsf9Fg/Ae2vlhfkyMJeY',NULL,0,0,'8bd75c9a-16f1-4cd1-80fe-f8d8ea863c6b','2026-09-09 08:53:12.310','2026-09-09 08:53:12.310'),('dd3e4504-debb-4aa1-ab77-8a5e7dba874c','SUP001','Shift Supervisor','SUPERVISOR','ACTIVE','$argon2id$v=19$m=65536,t=3,p=4$rWkba30nsfBZfn3SGkF6Ag$i3NUhmKcMEkL/VVnSJbM1pKjsf9Fg/Ae2vlhfkyMJeY',NULL,0,0,'8bd75c9a-16f1-4cd1-80fe-f8d8ea863c6b','2026-09-09 08:53:12.307','2026-09-09 08:53:12.307'),('ed17d8fb-f463-4461-b089-c0f4086a2f8a','MGR001','Ops Manager','MANAGER','ACTIVE','$argon2id$v=19$m=65536,t=3,p=4$rWkba30nsfBZfn3SGkF6Ag$i3NUhmKcMEkL/VVnSJbM1pKjsf9Fg/Ae2vlhfkyMJeY',NULL,0,0,'8bd75c9a-16f1-4cd1-80fe-f8d8ea863c6b','2026-09-09 08:53:12.305','2026-09-09 08:53:12.305'),('ff4b1483-6ac3-41dc-8d05-8f8c6b8ef448','ADM001','System Admin','ADMIN','ACTIVE','$argon2id$v=19$m=65536,t=3,p=4$rWkba30nsfBZfn3SGkF6Ag$i3NUhmKcMEkL/VVnSJbM1pKjsf9Fg/Ae2vlhfkyMJeY',NULL,0,0,'8bd75c9a-16f1-4cd1-80fe-f8d8ea863c6b','2026-09-09 08:53:12.300','2026-09-09 08:53:12.300');

SET FOREIGN_KEY_CHECKS = 1;
