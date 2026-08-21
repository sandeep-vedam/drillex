import { Controller, Get, Param, Post } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, CurrentUser, RequirePermission } from '../auth/decorators';
@Controller('notifications')
@RequirePermission('notification:read')
export class NotificationsController {
  constructor(private prisma: PrismaService) {}
  @Get() list(@CurrentUser() u: AuthUser) { return this.prisma.notification.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'desc' }, take: 100 }); }
  @Get('unread-count') async unread(@CurrentUser() u: AuthUser) { return { count: await this.prisma.notification.count({ where: { userId: u.id, readAt: null } }) }; }
  @Post('read-all') async readAll(@CurrentUser() u: AuthUser) { await this.prisma.notification.updateMany({ where: { userId: u.id, readAt: null }, data: { readAt: new Date() } }); return { ok: true }; }
  @Post(':id/read') async read(@Param('id') id: string, @CurrentUser() u: AuthUser) { await this.prisma.notification.updateMany({ where: { id, userId: u.id }, data: { readAt: new Date() } }); return { ok: true }; }
}
