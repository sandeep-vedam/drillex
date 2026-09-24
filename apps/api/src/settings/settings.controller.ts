import { Body, Controller, Get, Patch } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { OperationsSettingsSchema, type OperationsSettings, type Role } from '@drillex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, CurrentUser, RequirePermission } from '../auth/decorators';
import { RolesService } from '../roles/roles.service';
import { ZodPipe } from '../common/zod.pipe';
import { getOperationsSettings, getRoles2faRequired, OPS_KEY, ROLES_2FA_KEY } from './settings.util';
import { syncAssetStatus } from '../job-cards/open-jobs';

/** Admin-configurable app settings (SRS §9.3 style — only ADMIN via `user:manage`). */
@Controller('settings')
@RequirePermission('user:manage')
export class SettingsController {
  constructor(private prisma: PrismaService, private roles: RolesService) {}

  @Get('2fa-roles')
  async get2faRoles() {
    const allRoles = (await this.roles.list()).map((r) => r.key);
    return { roles: await getRoles2faRequired(this.prisma), allRoles };
  }

  @Patch('2fa-roles')
  async set2faRoles(@CurrentUser() u: AuthUser, @Body() b: { roles: Role[] }) {
    const roles = Array.isArray(b.roles) ? b.roles : [];
    for (const r of roles) if (!(await this.roles.exists(r))) throw new BadRequestException(`Unknown role: ${r}`);
    await this.prisma.systemSetting.upsert({
      where: { key: ROLES_2FA_KEY },
      create: { key: ROLES_2FA_KEY, value: roles, updatedBy: u.id },
      update: { value: roles, updatedBy: u.id },
    });
    await this.prisma.auditLog.create({ data: { actorId: u.id, deviceId: u.deviceId, entity: 'SystemSetting', entityId: ROLES_2FA_KEY, action: 'UPDATE' } });
    return { roles };
  }

  /** Readable by anyone who works with machines, so the apps can show the same alert rule the server applies. */
  @Get('operations') @RequirePermission('asset:read')
  getOperations() { return getOperationsSettings(this.prisma); }

  @Patch('operations')
  async setOperations(@CurrentUser() u: AuthUser, @Body(new ZodPipe(OperationsSettingsSchema.partial())) b: Partial<OperationsSettings>) {
    const before = await getOperationsSettings(this.prisma);
    const value = { ...before, ...b };
    await this.prisma.systemSetting.upsert({ where: { key: OPS_KEY }, create: { key: OPS_KEY, value, updatedBy: u.id }, update: { value, updatedBy: u.id } });
    await this.prisma.auditLog.create({ data: { actorId: u.id, deviceId: u.deviceId, entity: 'SystemSetting', entityId: OPS_KEY, action: 'UPDATE', diff: { before, after: value } } });
    // Completed-but-unapproved cards just changed meaning (open ↔ done), so the machines they hold are re-evaluated now.
    if (before.jobCardApprovalRequired !== value.jobCardApprovalRequired) {
      const cards = await this.prisma.jobCard.findMany({ where: { deletedAt: null, status: 'COMPLETED', approvedAt: null }, select: { assetId: true }, distinct: ['assetId'] });
      for (const { assetId } of cards) await this.prisma.$transaction((tx) => syncAssetStatus(tx, assetId, value.jobCardApprovalRequired));
    }
    return value;
  }
}
