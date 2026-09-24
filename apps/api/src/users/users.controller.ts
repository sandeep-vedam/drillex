import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { randomBytes } from 'crypto';
import argon2 from 'argon2';
import { z } from 'zod';
import { AssignRoleSchema, can, CreateUserSchema } from '@drillex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, CurrentUser, RequirePermission } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { RolesService } from '../roles/roles.service';

const StatusSchema = z.object({ status: z.enum(['ACTIVE', 'DISABLED']) });

@Controller('users')
export class UsersController {
  constructor(private prisma: PrismaService, private roles: RolesService) {}
  /** Lightweight lookup for pickers (e.g. assigning operators to an asset). */
  @Get('lookup') @RequirePermission('asset:write')
  lookup(@Query('role') role?: string) {
    return this.prisma.user.findMany({ where: { status: 'ACTIVE', ...(role ? { role } : {}) }, select: { id: true, employeeId: true, name: true, role: true }, orderBy: { employeeId: 'asc' } });
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
    // audit:read at 'all' scope is the one grant exclusive to MANAGER/ADMIN-tier roles in the seed matrix — the
    // dynamic equivalent of the old hardcoded ['MANAGER', 'ADMIN'] check, and it also protects any custom
    // leadership-tier role an admin grants it to.
    if (actor.scope === 'site' && can(await this.roles.getMatrix(), target.role, 'audit:read') === 'all') throw new ForbiddenException('Site-scoped supervisors cannot reset the password of a user whose role has organization-wide admin rights');
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
  @Post() @RequirePermission('user:manage') async create(@Body(new ZodPipe(CreateUserSchema)) b: z.infer<typeof CreateUserSchema>, @CurrentUser() actor: AuthUser) {
    if (!(await this.roles.exists(b.role))) throw new BadRequestException(`Unknown role: ${b.role}`);
    const { password, ...rest } = b;
    const u = await this.prisma.user.create({ data: { ...rest, passwordHash: await argon2.hash(password), mustChangePassword: true } });
    await this.prisma.auditLog.create({ data: { actorId: actor.id, deviceId: actor.deviceId, entity: 'User', entityId: u.id, action: 'CREATE', diff: rest } });
    return { id: u.id, employeeId: u.employeeId };
  }
  @Patch(':id/role') @RequirePermission('user:manage')
  async setRole(@Param('id') id: string, @Body(new ZodPipe(AssignRoleSchema)) b: z.infer<typeof AssignRoleSchema>, @CurrentUser() actor: AuthUser) {
    if (!(await this.roles.exists(b.role))) throw new BadRequestException(`Unknown role: ${b.role}`);
    const u = await this.prisma.user.update({ where: { id }, data: { role: b.role } });
    await this.prisma.auditLog.create({ data: { actorId: actor.id, entity: 'User', entityId: id, action: 'ROLE_CHANGED', diff: { role: b.role } } });
    return { id: u.id, role: u.role };
  }
}
