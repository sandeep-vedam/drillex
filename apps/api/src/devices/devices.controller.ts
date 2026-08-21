import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, CurrentUser, RequirePermission } from '../auth/decorators';

/** Device registration (SRS §9.3, optional enterprise feature). Set DEVICE_REGISTRATION_REQUIRED=true to block sign-in from unapproved devices. */
@Controller('devices')
@RequirePermission('user:manage')
export class DevicesController {
  constructor(private prisma: PrismaService) {}
  @Get() list() { return this.prisma.device.findMany({ include: { user: { select: { employeeId: true, name: true, role: true } } }, orderBy: { lastSeen: 'desc' } }); }
  @Patch(':id') async setApproved(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: { approved: boolean }) {
    const d = await this.prisma.device.update({ where: { id }, data: { approved: !!b.approved } });
    if (!b.approved) await this.prisma.refreshToken.updateMany({ where: { userId: d.userId, deviceId: d.deviceId, revokedAt: null }, data: { revokedAt: new Date() } }); // remote sign-out
    await this.prisma.auditLog.create({ data: { actorId: u.id, deviceId: u.deviceId, entity: 'Device', entityId: id, action: b.approved ? 'APPROVE' : 'REVOKE' } });
    return d;
  }
}
