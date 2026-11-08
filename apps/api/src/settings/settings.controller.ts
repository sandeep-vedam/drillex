import { Body, Controller, Get, Patch } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { FinanceSettingsSchema, OperationsSettingsSchema, PinRolesSettingSchema, type OperationsSettings, type Role } from '@drillex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, CurrentUser, RequirePermission } from '../auth/decorators';
import { RolesService } from '../roles/roles.service';
import { ZodPipe } from '../common/zod.pipe';
import { FINANCE_KEY, getFinanceSettings, getOperationsSettings, getPinRoles, getRoles2faRequired, OPS_KEY, PIN_ROLES_KEY, ROLES_2FA_KEY } from './settings.util';
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

  /** Which roles sign in with a 4-digit PIN (client spec §10.6). */
  @Get('pin-roles')
  async getPinRolesSetting() {
    const allRoles = (await this.roles.list()).map((r) => r.key);
    return { roles: await getPinRoles(this.prisma), allRoles };
  }

  @Patch('pin-roles')
  async setPinRoles(@CurrentUser() u: AuthUser, @Body(new ZodPipe(PinRolesSettingSchema)) b: { roles: string[] }) {
    for (const r of b.roles) if (!(await this.roles.exists(r))) throw new BadRequestException(`Unknown role: ${r}`);
    const before = await getPinRoles(this.prisma);
    await this.prisma.systemSetting.upsert({ where: { key: PIN_ROLES_KEY }, create: { key: PIN_ROLES_KEY, value: b.roles, updatedBy: u.id }, update: { value: b.roles, updatedBy: u.id } });
    await this.prisma.auditLog.create({ data: { actorId: u.id, deviceId: u.deviceId, entity: 'SystemSetting', entityId: PIN_ROLES_KEY, action: 'UPDATE', diff: { before, after: b.roles } } });
    return { roles: b.roles };
  }

  /** Currencies and company details for the finance module; readable by anyone who enters financial data. */
  @Get('finance') @RequirePermission('finance:read', 'plant_hire:write', 'user:manage')
  getFinance() { return getFinanceSettings(this.prisma); }

  @Patch('finance')
  async setFinance(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const before = await getFinanceSettings(this.prisma);
    const parsed = FinanceSettingsSchema.safeParse({ ...before, ...(body as object) });
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0].message);
    await this.prisma.systemSetting.upsert({ where: { key: FINANCE_KEY }, create: { key: FINANCE_KEY, value: parsed.data, updatedBy: u.id }, update: { value: parsed.data, updatedBy: u.id } });
    await this.prisma.auditLog.create({ data: { actorId: u.id, deviceId: u.deviceId, entity: 'SystemSetting', entityId: FINANCE_KEY, action: 'UPDATE', diff: { before, after: parsed.data } } });
    return parsed.data;
  }
}
