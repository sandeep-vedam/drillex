import { Body, Controller, Get, Patch } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { Roles, type Role } from '@drillex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, CurrentUser, RequirePermission } from '../auth/decorators';
import { getRoles2faRequired, ROLES_2FA_KEY } from './settings.util';

/** Admin-configurable app settings (SRS §9.3 style — only ADMIN via `user:manage`). */
@Controller('settings')
@RequirePermission('user:manage')
export class SettingsController {
  constructor(private prisma: PrismaService) {}

  @Get('2fa-roles')
  async get2faRoles() {
    return { roles: await getRoles2faRequired(this.prisma), allRoles: Roles };
  }

  @Patch('2fa-roles')
  async set2faRoles(@CurrentUser() u: AuthUser, @Body() b: { roles: Role[] }) {
    const roles = Array.isArray(b.roles) ? b.roles : [];
    for (const r of roles) if (!Roles.includes(r)) throw new BadRequestException(`Unknown role: ${r}`);
    await this.prisma.systemSetting.upsert({
      where: { key: ROLES_2FA_KEY },
      create: { key: ROLES_2FA_KEY, value: roles, updatedBy: u.id },
      update: { value: roles, updatedBy: u.id },
    });
    await this.prisma.auditLog.create({ data: { actorId: u.id, deviceId: u.deviceId, entity: 'SystemSetting', entityId: ROLES_2FA_KEY, action: 'UPDATE' } });
    return { roles };
  }
}
