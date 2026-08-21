import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AssetsModule } from './assets/assets.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DailyReadingsModule } from './daily-readings/daily-readings.module';
import { HealthController } from './common/health.controller';
import { SitesController } from './common/sites.controller';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RbacGuard } from './auth/rbac.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule, AuthModule, UsersModule, AssetsModule, DashboardModule, NotificationsModule, DailyReadingsModule,
  ],
  controllers: [HealthController, SitesController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RbacGuard },
  ],
})
export class AppModule {}
