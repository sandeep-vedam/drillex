import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { engineHours, penetrationRate, ShiftReportInput, totalMetersDrilled } from '@drillex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RolesService } from '../roles/roles.service';
import { AuthUser } from '../auth/decorators';
import { mayActForOperator, resolveSubmitter } from '../common/submitter';

type Tx = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

@Injectable()
export class ShiftReportsService {
  constructor(private prisma: PrismaService, private notify: NotificationsService, private roles: RolesService) {}

  /** Engine hours and penetration are server-computed (client spec §4A). Reports from older app versions carry no meters and keep their typed penetration. */
  private computed(input: ShiftReportInput) {
    const totalMeters = totalMetersDrilled(input.startDepth, input.endDepth);
    const hours = input.startHourMeter != null && input.endHourMeter != null ? engineHours(input.startHourMeter, input.endHourMeter) : null;
    return { totalMeters, engineHours: hours, penetrationRate: hours != null ? penetrationRate(totalMeters, hours) : input.penetrationRate ?? 0 };
  }

  /** Chemical lines are typed freely; a name that matches the master list (or an id from an older app) is linked to it. */
  private async chemicalRows(tx: Tx, chemicals: ShiftReportInput['chemicals']) {
    const master = await tx.chemical.findMany({ select: { id: true, name: true } });
    const byName = new Map(master.map((c) => [c.name.trim().toLowerCase(), c]));
    const byId = new Map(master.map((c) => [c.id, c]));
    return chemicals.map((c) => {
      const linked = (c.chemicalId ? byId.get(c.chemicalId) : undefined) ?? (c.name ? byName.get(c.name.trim().toLowerCase()) : undefined);
      return { chemicalId: linked?.id ?? null, name: c.name?.trim() || linked?.name || null, quantity: c.quantity, unit: c.unit, purpose: c.purpose, stockOnHand: c.stockOnHand };
    });
  }

  /** Where the next shift starts (last end meter) and the running total of engine hours, for the form (client spec §4A). */
  async meter(assetId: string) {
    const [last, sum] = await Promise.all([
      this.prisma.shiftReport.findFirst({ where: { assetId, deletedAt: null, endHourMeter: { not: null } }, orderBy: [{ date: 'desc' }, { submittedAt: 'desc' }], select: { endHourMeter: true } }),
      this.prisma.shiftReport.aggregate({ where: { assetId, deletedAt: null }, _sum: { engineHours: true } }),
    ]);
    return { lastEndMeter: last?.endHourMeter != null ? Number(last.endHourMeter) : null, cumulativeHours: Number(sum._sum.engineHours ?? 0) };
  }

  private assetScope(u: AuthUser) {
    return u.scope === 'self' ? { operators: { some: { userId: u.id, validTo: null } } } : u.scope === 'site' ? { siteId: u.siteId ?? undefined } : {};
  }
  private include = { asset: { select: { assetNumber: true, name: true, siteId: true } }, user: { select: { employeeId: true, name: true } }, enteredBy: { select: { employeeId: true, name: true } }, site: { select: { name: true } }, chemicals: { include: { chemical: { select: { name: true } } } } };

  list(u: AuthUser, q: { status?: string; assetId?: string; from?: string; to?: string }) {
    return this.prisma.shiftReport.findMany({
      where: { asset: this.assetScope(u), deletedAt: null, ...(q.status ? { status: q.status as never } : {}), ...(q.assetId ? { assetId: q.assetId } : {}),
        ...(q.from || q.to ? { date: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } } : {}) },
      include: this.include, orderBy: [{ date: 'desc' }, { submittedAt: 'desc' }], take: 200,
    });
  }
  get(u: AuthUser, id: string) { return this.prisma.shiftReport.findFirstOrThrow({ where: { id, asset: this.assetScope(u) }, include: this.include }); }

  /**
   * SRS §4.3: assigned operator only (or a supervisor entering for them, client spec §9.3); end ≥ start (schema);
   * meters, engine hours and penetration computed; one report per asset/date/shift.
   */
  async create(u: AuthUser, input: ShiftReportInput) {
    const asset = await this.prisma.asset.findFirstOrThrow({ where: { id: input.assetId, deletedAt: null } });
    const who = await resolveSubmitter(this.prisma, this.roles, u, asset, input, 'shift_report:create');
    const date = new Date(input.date); date.setUTCHours(0, 0, 0, 0);
    if (await this.prisma.shiftReport.findUnique({ where: { assetId_date_shift: { assetId: asset.id, date, shift: input.shift } } }))
      throw new ConflictException(`A ${input.shift.toLowerCase()} shift report for ${asset.assetNumber} on ${date.toISOString().slice(0, 10)} already exists`);
    const { id, chemicals, signatureAttachmentId, date: _d, operatorId: _o, supervisorReason: _r, penetrationRate: _p, ...rest } = input;
    const report = await this.prisma.$transaction(async (tx) => {
      const r = await tx.shiftReport.create({ data: { ...(id ? { id } : {}), ...rest, ...this.computed(input), date, userId: who.userId, enteredById: who.enteredById, supervisorReason: who.supervisorReason, signatureId: signatureAttachmentId ?? null,
        chemicals: { create: await this.chemicalRows(tx, chemicals) } }, include: this.include });
      await tx.auditLog.create({ data: { actorId: u.id, deviceId: u.deviceId, entity: 'ShiftReport', entityId: r.id, action: 'SUBMIT', ...(who.enteredById ? { diff: { onBehalfOf: who.operatorEmployeeId, reason: who.supervisorReason } as never } : {}) } });
      return r;
    });
    const by = who.enteredById ? `${u.employeeId} (supervisor, for ${who.operatorEmployeeId})` : u.employeeId;
    await this.notify.notifyRoles(asset.siteId, ['SUPERVISOR'], { type: 'approval_required', title: `${asset.assetNumber} · ${input.shift === 'DAY' ? 'Day' : 'Night'} shift report awaiting approval`, body: `${by} drilled ${report.totalMeters} m across ${input.holesCompleted} hole(s).`, payload: { shiftReportId: report.id } });
    if (who.enteredById) await this.prisma.notification.create({ data: { userId: who.userId, type: 'entered_on_behalf', title: `${asset.assetNumber} shift report entered for you`, body: `${u.employeeId} entered your ${input.shift.toLowerCase()} shift report: ${who.supervisorReason}` } });
    return report;
  }

  async approve(u: AuthUser, id: string) {
    const r = await this.get(u, id);
    if (r.status === 'APPROVED') throw new ConflictException('Already approved');
    if (r.status === 'UNLOCKED') throw new ConflictException('Report is unlocked for editing; wait for resubmission');
    const out = await this.prisma.shiftReport.update({ where: { id }, data: { status: 'APPROVED', approvedById: u.id, approvedAt: new Date() }, include: this.include });
    await this.prisma.auditLog.create({ data: { actorId: u.id, deviceId: u.deviceId, entity: 'ShiftReport', entityId: id, action: 'APPROVE' } });
    await this.prisma.notification.create({ data: { userId: r.userId, type: 'report_approved', title: `${r.asset.assetNumber} shift report approved`, body: `Approved by ${u.employeeId}.` } });
    return out;
  }

  /** Submission is final; supervisor unlock is required for edits and is audit-logged with a reason (SRS §4.3). */
  async unlock(u: AuthUser, id: string, reason: string) {
    if (!reason?.trim()) throw new BadRequestException('A reason is required to unlock a report');
    // Who may unlock is the shift_report:unlock grant (SRS §4.5), not a role name; site scope comes from get().
    const r = await this.get(u, id);
    if (r.status === 'UNLOCKED') throw new ConflictException('Report is already unlocked for correction');
    const out = await this.prisma.shiftReport.update({ where: { id }, data: { status: 'UNLOCKED', approvedById: null, approvedAt: null }, include: this.include });
    await this.prisma.auditLog.create({ data: { actorId: u.id, deviceId: u.deviceId, entity: 'ShiftReport', entityId: id, action: 'UNLOCK', diff: { reason } as never } });
    await this.prisma.notification.create({ data: { userId: r.userId, type: 'report_unlocked', title: `${r.asset.assetNumber} shift report unlocked for correction`, body: reason } });
    return out;
  }

  /** The operator (or a supervisor, with a reason) resubmits an unlocked report; full diff goes to the audit trail. */
  async update(u: AuthUser, id: string, input: ShiftReportInput) {
    const r = await this.prisma.shiftReport.findFirstOrThrow({ where: { id, deletedAt: null }, include: this.include });
    if (r.status !== 'UNLOCKED') throw new ConflictException('Report is locked. Ask your supervisor to unlock it.');
    const forOperator = r.userId !== u.id;
    if (forOperator && !(await mayActForOperator(this.roles, u, r.asset.siteId))) throw new ForbiddenException('Only the submitting operator can edit this report');
    if (forOperator && (input.supervisorReason ?? '').trim().length < 3) throw new BadRequestException('A reason for the supervisor entry is required');
    const { id: _i, chemicals, signatureAttachmentId, date: _d, assetId: _a, operatorId: _o, supervisorReason: _r, penetrationRate: _p, ...rest } = input;
    const out = await this.prisma.$transaction(async (tx) => {
      await tx.shiftReportChemical.deleteMany({ where: { shiftReportId: id } });
      const upd = await tx.shiftReport.update({ where: { id }, data: { ...rest, ...this.computed(input), status: 'SUBMITTED', submittedAt: new Date(), ...(signatureAttachmentId ? { signatureId: signatureAttachmentId } : {}),
        ...(forOperator ? { enteredById: u.id, supervisorReason: input.supervisorReason!.trim() } : {}),
        chemicals: { create: await this.chemicalRows(tx, chemicals) } }, include: this.include });
      const pick = (x: { startDepth: unknown; endDepth: unknown; holesCompleted: unknown; downtimeHours: unknown; startHourMeter?: unknown; endHourMeter?: unknown }) => ({ startDepth: x.startDepth, endDepth: x.endDepth, holesCompleted: x.holesCompleted, downtimeHours: x.downtimeHours, startHourMeter: x.startHourMeter ?? null, endHourMeter: x.endHourMeter ?? null });
      await tx.auditLog.create({ data: { actorId: u.id, deviceId: u.deviceId, entity: 'ShiftReport', entityId: id, action: 'RESUBMIT', diff: { before: pick(r), after: pick(input), ...(forOperator ? { onBehalfOf: r.user.employeeId, reason: input.supervisorReason } : {}) } as never } });
      return upd;
    });
    return out;
  }

}
