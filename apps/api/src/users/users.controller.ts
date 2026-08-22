import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { randomBytes } from 'crypto';
import argon2 from 'argon2';
import { z } from 'zod';
import { CreateUserSchema } from '@drillex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, CurrentUser, RequirePermission } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';

const StatusSchema = z.object({ status: z.enum(['ACTIVE', 'DISABLED']) });

@Controller('users')
export class UsersController {
  constructor(private prisma: PrismaService) {}
  /** Lightweight lookup for pickers (e.g. assigning operators to an asset). */
  @Get('lookup') @RequirePermission('asset:write')
  lookup(@Query('role') role?: string) {
    return this.prisma.user.findMany({ where: { status: 'ACTIVE', ...(role ? { role: role as never } : {}) }, select: { id: true, employeeId: true, name: true, role: true }, orderBy: { employeeId: 'asc' } });
  }
  @RequirePermission('user:manage')
  @Get() @RequirePermission('user:manage') list() {
    return this.prisma.user.findMany({ select: { id: true, employeeId: true, name: true, role: true, status: true, siteId: true, totpEnabled: true, mustChangePassword: true, createdAt: true, site: { select: { name: true } } }, orderBy: { employeeId: 'asc' } });
  }
  /** SRS 2.2: passwords are reset by a supervisor (own site) or admin. Issues a temporary password, forces change, revokes sessions. */
  @Post(':id/reset-password') @RequirePermission('user:reset_password')
  async resetPassword(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    const target = await this.prisma.user.findUniqueOrThrow({ where: { id } });
    if (actor.scope === 'site' && target.siteId !== actor.siteId) throw new ForbiddenException('User is not on your site');
    if (actor.scope === 'site' && ['MANAGER', 'ADMIN'].includes(target.role)) throw new ForbiddenException('Supervisors cannot reset manager or admin passwords');
    const temp = `Dx-${randomBytes(4).toString('hex')}`;
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { passwordHash: await argon2.hash(temp), mustChangePassword: true } }),
      this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
      this.prisma.auditLog.create({ data: { actorId: actor.id, deviceId: actor.deviceId, entity: 'User', entityId: id, action: 'PASSWORD_RESET' } }),
    ]);
    return { temporaryPassword: temp };
  }
  @Patch(':id/status') @RequirePermission('user:manage')
  async setStatus(@Param('id') id: string, @Body(new ZodPipe(StatusSchema)) b: z.infer<typeof StatusSchema>, @CurrentUser() actor: AuthUser) {
    if (id === actor.id) throw new ForbiddenException('You cannot disable your own account');
    const u = await this.prisma.user.update({ where: { id }, data: { status: b.status } });
    await this.prisma.auditLog.create({ data: { actorId: actor.id, entity: 'User', entityId: id, action: `STATUS_${b.status}` } });
    return { id: u.id, status: u.status };
  }
  @Post() @RequirePermission('user:manage') async create(@Body(new ZodPipe(CreateUserSchema)) b: z.infer<typeof CreateUserSchema>) {
    const { password, ...rest } = b;
    const u = await this.prisma.user.create({ data: { ...rest, passwordHash: await argon2.hash(password), mustChangePassword: true } });
    return { id: u.id, employeeId: u.employeeId };
  }
}
