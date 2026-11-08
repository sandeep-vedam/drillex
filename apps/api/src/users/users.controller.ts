import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Header, Param, Patch, Post, Query } from '@nestjs/common';
import { randomBytes, randomInt } from 'crypto';
import argon2 from 'argon2';
import { z } from 'zod';
import { AssignRoleSchema, can, CreateUserSchema, EmployeeIdPrefix, nextEmployeeId, TEMP_CREDENTIAL_HOURS, UpdateUserSchema, UserStatusSchema } from '@drillex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, CurrentUser, RequirePermission } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { RolesService } from '../roles/roles.service';
import { AuthService } from '../auth/auth.service';

const csvCell = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/**
 * User management (client spec §10): the admin adds people with a temporary credential, edits role / machines /
 * contact, blocks leavers with a reason, unlocks suspended accounts and resets PINs. Records are never deleted.
 */
@Controller('users')
export class UsersController {
  constructor(private prisma: PrismaService, private roles: RolesService, private auth: AuthService) {}

  /** Lightweight lookup for pickers (e.g. assigning operators to an asset). */
  @Get('lookup') @RequirePermission('asset:write', 'user:manage', 'plant_hire:write', 'finance:write')
  lookup(@Query('role') role?: string) {
    return this.prisma.user.findMany({ where: { status: 'ACTIVE', ...(role ? { role } : {}) }, select: { id: true, employeeId: true, name: true, role: true }, orderBy: { employeeId: 'asc' } });
  }

  private readonly listSelect = {
    id: true, employeeId: true, name: true, role: true, status: true, statusReason: true, statusChangedAt: true, failedLogins: true, phone: true,
    siteId: true, totpEnabled: true, mustChangePassword: true, tempCredentialExpiresAt: true, createdAt: true, site: { select: { name: true } },
    assetAssignments: { where: { validTo: null }, select: { asset: { select: { id: true, assetNumber: true } } } },
  } as const;

  @Get() @RequirePermission('user:manage') async list() {
    const users = await this.prisma.user.findMany({ select: this.listSelect, orderBy: { employeeId: 'asc' } });
    const last = await this.prisma.loginEvent.groupBy({ by: ['userId'], where: { success: true, userId: { in: users.map((u) => u.id) } }, _max: { createdAt: true } });
    const lastBy = new Map(last.map((l) => [l.userId, l._max.createdAt]));
    const pinRoles = new Set(await Promise.all(users.map(async (u) => ((await this.auth.usesPin(u.role)) ? u.role : null))));
    return users.map(({ assetAssignments, ...u }) => ({ ...u, usesPin: pinRoles.has(u.role), lastLoginAt: lastBy.get(u.id) ?? null, machines: assetAssignments.map((a) => a.asset) }));
  }

  /** CSV of active and historical users (client spec §10.7). */
  @Get('export.csv') @RequirePermission('user:manage') @Header('Content-Type', 'text/csv; charset=utf-8') @Header('Content-Disposition', 'attachment; filename="drillex-users.csv"')
  async exportCsv() {
    const rows = await this.list();
    const head = ['Employee ID', 'Name', 'Role', 'Status', 'Status reason', 'Status changed', 'Contact number', 'Site', 'Machines', 'Sign-in', 'Created', 'Last sign-in'];
    const lines = rows.map((u) => [u.employeeId, u.name, u.role, u.status, u.statusReason, u.statusChangedAt?.toISOString(), u.phone, u.site?.name, u.machines.map((m) => m.assetNumber).join(' '), u.usesPin ? 'PIN' : 'Password', u.createdAt.toISOString(), u.lastLoginAt?.toISOString()].map(csvCell).join(','));
    return [head.join(','), ...lines].join('\n');
  }

  /** The next free employee ID for a role, to prefill the Add User form (client spec §10.6). */
  @Get('next-id') @RequirePermission('user:manage')
  async nextId(@Query('role') role: string) {
    const prefix = EmployeeIdPrefix[role];
    if (!prefix) return { employeeId: null };
    const taken = await this.prisma.user.findMany({ where: { employeeId: { startsWith: prefix } }, select: { employeeId: true } });
    return { employeeId: nextEmployeeId(prefix, taken.map((t) => t.employeeId)) };
  }

  /** A 6-digit temporary PIN for PIN roles, a temporary password for the rest; both expire after 24 hours. */
  private async temporaryCredential(role: string) {
    const usesPin = await this.auth.usesPin(role);
    const value = usesPin ? String(randomInt(0, 1_000_000)).padStart(6, '0') : `Dx-${randomBytes(4).toString('hex')}`;
    return { usesPin, value, hash: await argon2.hash(value), expiresAt: new Date(Date.now() + TEMP_CREDENTIAL_HOURS * 3600e3) };
  }

  private async setMachines(tx: Pick<PrismaService, 'assetOperator'>, userId: string, assetIds: string[]) {
    const current = await tx.assetOperator.findMany({ where: { userId, validTo: null } });
    const keep = new Set(assetIds);
    const now = new Date();
    // Closing the assignment window (rather than deleting it) keeps the history of who ran which machine (spec §10.4).
    for (const c of current) if (!keep.has(c.assetId)) await tx.assetOperator.update({ where: { assetId_userId: { assetId: c.assetId, userId } }, data: { validTo: now } });
    const have = new Set(current.map((c) => c.assetId));
    for (const assetId of assetIds) if (!have.has(assetId)) await tx.assetOperator.upsert({ where: { assetId_userId: { assetId, userId } }, update: { validFrom: now, validTo: null }, create: { assetId, userId } });
  }

  /** Supervisors (own site) or admins issue a new temporary credential; it forces a change at next sign-in and ends every session. */
  @Post(':id/reset-password') @RequirePermission('user:reset_password')
  async resetPassword(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    const target = await this.prisma.user.findUniqueOrThrow({ where: { id } });
    if (actor.scope === 'site' && target.siteId !== actor.siteId) throw new ForbiddenException('User is not on your site');
    // audit:read at 'all' scope marks leadership-tier roles; a site-scoped supervisor may not reset those.
    if (actor.scope === 'site' && can(await this.roles.getMatrix(), target.role, 'audit:read') === 'all') throw new ForbiddenException('Site-scoped supervisors cannot reset the password of a user whose role has organization-wide admin rights');
    const temp = await this.temporaryCredential(target.role);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { passwordHash: temp.hash, mustChangePassword: true, tempCredentialExpiresAt: temp.expiresAt, failedLogins: 0 } }),
      this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
      this.prisma.auditLog.create({ data: { actorId: actor.id, deviceId: actor.deviceId, entity: 'User', entityId: id, action: temp.usesPin ? 'PIN_RESET' : 'PASSWORD_RESET' } }),
    ]);
    // Shown to the admin to pass on; SMS delivery plugs in here once a provider is chosen.
    return { temporaryPassword: temp.value, usesPin: temp.usesPin, expiresAt: temp.expiresAt };
  }

  /** Activate / deactivate / block (with reason). Anything but ACTIVE ends every session at once; ACTIVE also unlocks a suspended account. */
  @Patch(':id/status') @RequirePermission('user:manage')
  async setStatus(@Param('id') id: string, @Body(new ZodPipe(UserStatusSchema)) b: z.infer<typeof UserStatusSchema>, @CurrentUser() actor: AuthUser) {
    if (id === actor.id) throw new ForbiddenException('You cannot change the status of your own account');
    const before = await this.prisma.user.findUniqueOrThrow({ where: { id } });
    const u = await this.prisma.user.update({ where: { id }, data: { status: b.status, statusReason: b.status === 'ACTIVE' ? null : b.reason ?? null, statusChangedAt: new Date(), ...(b.status === 'ACTIVE' ? { failedLogins: 0 } : {}) } });
    if (b.status !== 'ACTIVE') await this.auth.revokeAll(id);
    const action = b.status === 'ACTIVE' ? (before.status === 'SUSPENDED' ? 'UNLOCKED' : 'ACTIVATED') : b.status === 'BLOCKED' ? 'BLOCKED' : 'DEACTIVATED';
    await this.prisma.auditLog.create({ data: { actorId: actor.id, deviceId: actor.deviceId, entity: 'User', entityId: id, action, diff: { from: before.status, to: b.status, reason: b.reason } as never } });
    return { id: u.id, status: u.status };
  }

  /** Add user (client spec §10.2). Returns the temporary credential once, for the admin to pass on. */
  @Post() @RequirePermission('user:manage') async create(@Body(new ZodPipe(CreateUserSchema)) b: z.infer<typeof CreateUserSchema>, @CurrentUser() actor: AuthUser) {
    if (!(await this.roles.exists(b.role))) throw new BadRequestException(`Unknown role: ${b.role}`);
    const { assetIds, employeeId: given, ...rest } = b;
    const prefix = EmployeeIdPrefix[b.role];
    let employeeId = given;
    if (!employeeId) {
      if (!prefix) throw new BadRequestException('Enter an employee ID for this role');
      employeeId = (await this.nextId(b.role)).employeeId!;
    }
    if (await this.prisma.user.findUnique({ where: { employeeId } })) throw new ConflictException(`${employeeId} is already in use`);
    const temp = await this.temporaryCredential(b.role);
    const u = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({ data: { ...rest, employeeId, passwordHash: temp.hash, mustChangePassword: true, tempCredentialExpiresAt: temp.expiresAt } });
      if (assetIds.length) await this.setMachines(tx, created.id, assetIds);
      await tx.auditLog.create({ data: { actorId: actor.id, deviceId: actor.deviceId, entity: 'User', entityId: created.id, action: 'CREATE', diff: { ...rest, employeeId, assetIds } } });
      return created;
    });
    return { id: u.id, employeeId: u.employeeId, temporaryPassword: temp.value, usesPin: temp.usesPin, expiresAt: temp.expiresAt };
  }

  /** Edit user: name, contact number, site and machine assignments (client spec §10.7). */
  @Patch(':id') @RequirePermission('user:manage')
  async update(@Param('id') id: string, @Body(new ZodPipe(UpdateUserSchema)) b: z.infer<typeof UpdateUserSchema>, @CurrentUser() actor: AuthUser) {
    const { assetIds, ...rest } = b;
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: rest });
      if (assetIds) await this.setMachines(tx, id, assetIds);
      await tx.auditLog.create({ data: { actorId: actor.id, deviceId: actor.deviceId, entity: 'User', entityId: id, action: assetIds ? 'UPDATED_MACHINES' : 'UPDATE', diff: b as never } });
    });
    return this.prisma.user.findUniqueOrThrow({ where: { id }, select: this.listSelect });
  }

  @Patch(':id/role') @RequirePermission('user:manage')
  async setRole(@Param('id') id: string, @Body(new ZodPipe(AssignRoleSchema)) b: z.infer<typeof AssignRoleSchema>, @CurrentUser() actor: AuthUser) {
    if (!(await this.roles.exists(b.role))) throw new BadRequestException(`Unknown role: ${b.role}`);
    const before = await this.prisma.user.findUniqueOrThrow({ where: { id }, select: { role: true } });
    const u = await this.prisma.user.update({ where: { id }, data: { role: b.role } });
    await this.prisma.auditLog.create({ data: { actorId: actor.id, deviceId: actor.deviceId, entity: 'User', entityId: id, action: 'ROLE_CHANGED', diff: { from: before.role, to: b.role } } });
    return { id: u.id, role: u.role };
  }
}
