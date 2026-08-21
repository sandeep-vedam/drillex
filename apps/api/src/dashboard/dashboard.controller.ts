import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, CurrentUser, RequirePermission } from '../auth/decorators';

@Controller('dashboard')
export class DashboardController {
  constructor(private prisma: PrismaService) {}

  /** Role-scoped summary for the home dashboard (SRS §10.1 Home Dashboard). */
  @Get('summary')
  @RequirePermission('asset:read')
  async summary(@CurrentUser() u: AuthUser) {
    const assetWhere =
      u.scope === 'self' ? { operators: { some: { userId: u.id, validTo: null } } }
      : u.scope === 'site' ? { siteId: u.siteId ?? undefined } : {};
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const [byStatus, readingsToday, pendingShift, openAlerts, overdue, recentLogins] = await Promise.all([
      this.prisma.asset.groupBy({ by: ['status'], where: { ...assetWhere, deletedAt: null }, _count: true }),
      this.prisma.dailyReading.count({ where: { asset: assetWhere, date: { gte: start } } }),
      this.prisma.shiftReport.count({ where: { asset: assetWhere, status: 'SUBMITTED' } }),
      this.prisma.alert.count({ where: { asset: assetWhere, resolvedAt: null } }),
      this.prisma.maintenanceSchedule.count({ where: { asset: assetWhere, status: 'OVERDUE' } }),
      this.prisma.loginEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 8, select: { employeeId: true, success: true, deviceId: true, createdAt: true } }),
    ]);
    const assets = Object.fromEntries(byStatus.map((r) => [r.status, r._count]));
    const total = byStatus.reduce((n, r) => n + r._count, 0);
    return {
      assets: { total, active: assets.ACTIVE ?? 0, underMaintenance: assets.UNDER_MAINTENANCE ?? 0, idle: assets.IDLE ?? 0, decommissioned: assets.DECOMMISSIONED ?? 0 },
      readingsToday, pendingApprovals: pendingShift, openAlerts, overdueMaintenance: overdue,
      recentActivity: recentLogins,
    };
  }
}
