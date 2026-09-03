import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MaintenanceScheduleInput, nextCycle, scheduleStatus } from '@drillex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../auth/decorators';
import { assignedTo, technicianIds } from '../common/technician-ids';

@Injectable()
export class MaintenanceService {
  private log = new Logger('Maintenance');
  constructor(private prisma: PrismaService, private notify: NotificationsService) {}

  private assetScope(u: AuthUser) { return u.scope === 'site' ? { siteId: u.siteId ?? undefined } : {}; }
  private include = { asset: { select: { assetNumber: true, name: true, siteId: true, status: true } }, parts: { include: { part: { select: { partNo: true, name: true } } } } };

  /** Latest hour meter per asset from daily readings (and job cards), used for hour-based due calc. */
  async currentHours(assetIds: string[]) {
    const rows = await this.prisma.dailyReading.groupBy({ by: ['assetId'], where: { assetId: { in: assetIds } }, _max: { hourMeter: true } });
    return new Map(rows.map((r) => [r.assetId, r._max.hourMeter ? Number(r._max.hourMeter) : null]));
  }

  async list(u: AuthUser, q: { assetId?: string; status?: string; mine?: string }) {
    const rows = await this.prisma.maintenanceSchedule.findMany({
      where: { deletedAt: null, asset: this.assetScope(u), ...(q.assetId ? { assetId: q.assetId } : {}), ...(q.mine === '1' || u.scope === 'self' ? assignedTo(u.id) : {}) },
      include: this.include, orderBy: [{ nextDueAt: 'asc' }],
    });
    const hours = await this.currentHours([...new Set(rows.map((r) => r.assetId))]);
    const now = new Date();
    const out = rows.map((r) => {
      const currentHours = hours.get(r.assetId) ?? null;
      const status = r.status === 'COMPLETED' ? 'COMPLETED' : scheduleStatus({ nextDueAt: r.nextDueAt, nextDueHours: r.nextDueHours ? Number(r.nextDueHours) : null, reminderLeadDays: r.reminderLeadDays }, now, currentHours);
      return { ...r, status, currentHours, hoursRemaining: r.nextDueHours != null && currentHours != null ? Number(r.nextDueHours) - currentHours : null };
    });
    return q.status ? out.filter((r) => r.status === q.status) : out;
  }

  async create(u: AuthUser, input: MaintenanceScheduleInput) {
    const asset = await this.prisma.asset.findFirstOrThrow({ where: { id: input.assetId, deletedAt: null, ...this.assetScope(u) } });
    const { parts, ...data } = input;
    const row = await this.prisma.maintenanceSchedule.create({ data: { ...data, parts: { create: parts } }, include: this.include });
    await this.prisma.auditLog.create({ data: { actorId: u.id, deviceId: u.deviceId, entity: 'MaintenanceSchedule', entityId: row.id, action: 'CREATE', diff: input as never } });
    if (input.technicianIds.length) await this.prisma.notification.createMany({ data: input.technicianIds.map((userId) => ({ userId, type: 'maintenance_assigned', title: `${asset.assetNumber} · ${input.description}`, body: `You have been assigned this service.`, payload: { scheduleId: row.id } as never })) });
    return row;
  }

  async update(u: AuthUser, id: string, input: Partial<MaintenanceScheduleInput>) {
    await this.prisma.maintenanceSchedule.findFirstOrThrow({ where: { id, asset: this.assetScope(u) } });
    const { parts, assetId: _a, ...data } = input;
    const row = await this.prisma.maintenanceSchedule.update({ where: { id }, data: { ...data, ...(parts ? { parts: { deleteMany: {}, create: parts } } : {}) }, include: this.include });
    await this.prisma.auditLog.create({ data: { actorId: u.id, deviceId: u.deviceId, entity: 'MaintenanceSchedule', entityId: id, action: 'UPDATE', diff: input as never } });
    return row;
  }

  async remove(u: AuthUser, id: string) {
    await this.prisma.maintenanceSchedule.findFirstOrThrow({ where: { id, asset: this.assetScope(u) } });
    await this.prisma.maintenanceSchedule.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.prisma.auditLog.create({ data: { actorId: u.id, deviceId: u.deviceId, entity: 'MaintenanceSchedule', entityId: id, action: 'DELETE' } });
    return { ok: true };
  }

  /** Technician marks the service done: records last service, rolls the cycle forward (or closes one-off), asset back to ACTIVE if nothing else is open. */
  async complete(u: AuthUser, id: string, b: { completedAt?: Date; hourMeter?: number; notes?: string }) {
    const s = await this.prisma.maintenanceSchedule.findFirstOrThrow({ where: { id, deletedAt: null }, include: { asset: true } });
    if (u.scope === 'self' && !technicianIds(s.technicianIds).includes(u.id)) throw new ForbiddenException('You are not assigned to this service');
    const completedAt = b.completedAt ?? new Date();
    const hm = b.hourMeter ?? (await this.currentHours([s.assetId])).get(s.assetId) ?? null;
    const recurring = !!(s.intervalHours || s.intervalDays);
    const next = nextCycle(s, completedAt, hm);
    const row = await this.prisma.$transaction(async (tx) => {
      const r = await tx.maintenanceSchedule.update({ where: { id }, data: { lastServiceAt: completedAt, lastServiceHours: hm, nextDueAt: recurring ? next.nextDueAt : null, nextDueHours: recurring ? next.nextDueHours : null, status: recurring ? 'UPCOMING' : 'COMPLETED', notes: b.notes ? `${s.notes ? s.notes + '\n' : ''}[${completedAt.toISOString().slice(0, 10)} ${u.employeeId}] ${b.notes}` : s.notes } });
      await tx.auditLog.create({ data: { actorId: u.id, deviceId: u.deviceId, entity: 'MaintenanceSchedule', entityId: id, action: 'COMPLETE', diff: { completedAt, hourMeter: hm, notes: b.notes } as never } });
      const stillOpen = await tx.jobCard.count({ where: { assetId: s.assetId, status: { in: ['OPEN', 'IN_PROGRESS', 'AWAITING_PARTS'] } } });
      if (s.asset.status === 'UNDER_MAINTENANCE' && !stillOpen) await tx.asset.update({ where: { id: s.assetId }, data: { status: 'ACTIVE' } });
      return r;
    });
    await this.notify.notifyRoles(s.asset.siteId, ['SUPERVISOR'], { type: 'maintenance_done', title: `${s.asset.assetNumber} · ${s.description} completed`, body: `By ${u.employeeId}${hm != null ? ` at ${hm} h` : ''}.`, payload: { scheduleId: id } });
    return row;
  }

  /** Daily 06:00: refresh statuses, send reminders inside lead time, flag overdue (SRS §6.3). */
  @Cron('0 6 * * *')
  async dailyReminders() { const n = await this.runReminders(); this.log.log(`Reminders: ${n.reminded} reminded, ${n.overdue} overdue`); }

  async runReminders() {
    const rows = await this.prisma.maintenanceSchedule.findMany({ where: { deletedAt: null, status: { not: 'COMPLETED' } }, include: { asset: true } });
    const hours = await this.currentHours([...new Set(rows.map((r) => r.assetId))]);
    const now = new Date(); let reminded = 0, overdue = 0;
    for (const r of rows) {
      const st = scheduleStatus({ nextDueAt: r.nextDueAt, nextDueHours: r.nextDueHours ? Number(r.nextDueHours) : null, reminderLeadDays: r.reminderLeadDays }, now, hours.get(r.assetId) ?? null);
      if (st !== r.status) await this.prisma.maintenanceSchedule.update({ where: { id: r.id }, data: { status: st } });
      if (st === 'DUE_NOW' || st === 'OVERDUE') {
        const title = `${r.asset.assetNumber} · ${r.description} ${st === 'OVERDUE' ? 'is OVERDUE' : 'due soon'}`;
        const body = r.nextDueAt ? `Due ${r.nextDueAt.toISOString().slice(0, 10)}` : r.nextDueHours ? `Due at ${Number(r.nextDueHours)} h` : '';
        // de-dupe: one reminder per schedule per day
        const since = new Date(now.getTime() - 20 * 3600e3);
        const already = await this.prisma.notification.count({ where: { type: 'maintenance_due', payload: { path: '$.scheduleId', equals: r.id }, createdAt: { gte: since } } });
        if (!already) {
          await this.notify.notifyRoles(r.asset.siteId, ['SUPERVISOR'], { type: 'maintenance_due', title, body, payload: { scheduleId: r.id } });
          const techIds = technicianIds(r.technicianIds);
          if (techIds.length) await this.prisma.notification.createMany({ data: techIds.map((userId) => ({ userId, type: 'maintenance_due', title, body, payload: { scheduleId: r.id } as never })) });
          reminded++;
        }
        if (st === 'OVERDUE') overdue++;
      }
    }
    return { reminded, overdue };
  }

  /** Monday 07:00: manager digest of upcoming + overdue (SRS §6.3). */
  @Cron('0 7 * * 1')
  async weeklyDigest() { await this.runWeeklyDigest(); }
  async runWeeklyDigest() {
    const rows = await this.prisma.maintenanceSchedule.findMany({ where: { deletedAt: null, status: { in: ['DUE_NOW', 'OVERDUE'] } }, include: { asset: true }, orderBy: { nextDueAt: 'asc' } });
    const lines = rows.map((r) => `${r.status === 'OVERDUE' ? '🔴' : '🟠'} ${r.asset.assetNumber} ${r.description}${r.nextDueAt ? ` · ${r.nextDueAt.toISOString().slice(0, 10)}` : ''}`);
    const n = await this.notify.notifyRoles(null, ['MANAGER'], { type: 'maintenance_digest', title: `Weekly maintenance digest: ${rows.filter((r) => r.status === 'OVERDUE').length} overdue, ${rows.filter((r) => r.status === 'DUE_NOW').length} due`, body: lines.slice(0, 20).join('\n') || 'Nothing due this week.' });
    return { items: rows.length, managers: n };
  }
}
