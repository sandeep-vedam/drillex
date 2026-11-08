import { Controller, Get, Module, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermission } from '../auth/decorators';

/**
 * The audit trail (client spec §10.7, §10.8): every sign-in attempt, block, PIN reset, role change and data change,
 * with who did it and when. Sign-in attempts live in LoginEvent; everything else in AuditLog. Both are append-only
 * from the application — nothing in the API updates or deletes them.
 */
@Controller('audit')
export class AuditController {
  constructor(private prisma: PrismaService) {}

  @Get() @RequirePermission('audit:read')
  async list(@Query() q: { entity?: string; action?: string; actor?: string; from?: string; to?: string; limit?: string }) {
    const actor = q.actor ? await this.prisma.user.findUnique({ where: { employeeId: q.actor.toUpperCase() }, select: { id: true } }) : null;
    const rows = await this.prisma.auditLog.findMany({
      where: {
        ...(q.entity ? { entity: q.entity } : {}),
        ...(q.action ? { action: { contains: q.action.toUpperCase() } } : {}),
        ...(q.actor ? { actorId: actor?.id ?? '__none__' } : {}),
        ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(`${q.to}T23:59:59.999Z`) } : {}) } } : {}),
      },
      orderBy: { createdAt: 'desc' }, take: Math.min(Number(q.limit) || 300, 1000),
    });
    // Resolve actor and (for User entries) subject names in one query rather than per row.
    const ids = [...new Set(rows.flatMap((r) => [r.actorId, r.entity === 'User' || r.entity === 'Auth' ? r.entityId : null]).filter(Boolean) as string[])];
    const users = new Map((await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, employeeId: true, name: true } })).map((u) => [u.id, u]));
    return rows.map((r) => ({ ...r, actor: r.actorId ? users.get(r.actorId) ?? null : null, subject: r.entity === 'User' || r.entity === 'Auth' ? users.get(r.entityId) ?? null : null }));
  }

  @Get('logins') @RequirePermission('audit:read')
  logins(@Query() q: { employeeId?: string; failed?: string; limit?: string }) {
    return this.prisma.loginEvent.findMany({
      where: { ...(q.employeeId ? { employeeId: q.employeeId.toUpperCase() } : {}), ...(q.failed === '1' ? { success: false } : {}) },
      orderBy: { createdAt: 'desc' }, take: Math.min(Number(q.limit) || 300, 1000),
    });
  }
}

@Module({ controllers: [AuditController] })
export class AuditModule {}
