import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AssetsModule } from './assets/assets.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DailyReadingsModule } from './daily-readings/daily-readings.module';
import { ShiftReportsModule } from './shift-reports/shift-reports.module';
import { StorageModule } from './storage/storage.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { SyncModule } from './sync/sync.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { JobCardsModule } from './job-cards/job-cards.module';
import { PartsModule } from './parts/parts.module';
import { PushModule } from './push/push.module';
import { ReportsModule } from './reports/reports.module';
import { DevicesModule } from './devices/devices.module';
import { HealthController } from './common/health.controller';
import { SitesController } from './common/sites.controller';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RbacGuard } from './auth/rbac.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    ScheduleModule.forRoot(),
    PrismaModule, AuthModule, UsersModule, AssetsModule, DashboardModule, NotificationsModule, DailyReadingsModule, ShiftReportsModule, StorageModule, AttachmentsModule, SyncModule, MaintenanceModule, JobCardsModule, PartsModule, PushModule, ReportsModule, DevicesModule,
  ],
  controllers: [HealthController, SitesController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RbacGuard },
  ],
})
export class AppModule {}
