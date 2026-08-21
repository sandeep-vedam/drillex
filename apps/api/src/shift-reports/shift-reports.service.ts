import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { ShiftReportInput, totalMetersDrilled } from '@drillex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../auth/decorators';

@Injectable()
export class ShiftReportsService {
  constructor(private prisma: PrismaService, private notify: NotificationsService) {}

  private assetScope(u: AuthUser) {
    return u.scope === 'self' ? { operators: { some: { userId: u.id, validTo: null } } } : u.scope === 'site' ? { siteId: u.siteId ?? undefined } : {};
  }
  private include = { asset: { select: { assetNumber: true, name: true, siteId: true } }, user: { select: { employeeId: true, name: true } }, site: { select: { name: true } }, chemicals: { include: { chemical: { select: { name: true } } } } };

  list(u: AuthUser, q: { status?: string; assetId?: string; from?: string; to?: string }) {
    return this.prisma.shiftReport.findMany({
      where: { asset: this.assetScope(u), deletedAt: null, ...(q.status ? { status: q.status as never } : {}), ...(q.assetId ? { assetId: q.assetId } : {}),
        ...(q.from || q.to ? { date: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } } : {}) },
      include: this.include, orderBy: [{ date: 'desc' }, { submittedAt: 'desc' }], take: 200,
    });
  }
  get(u: AuthUser, id: string) { return this.prisma.shiftReport.findFirstOrThrow({ where: { id, asset: this.assetScope(u) }, include: this.include }); }

  /** SRS §4.3: assigned operator only; end ≥ start (schema); total meters computed; one report per asset/date/shift. */
  async create(u: AuthUser, input: ShiftReportInput) {
    const asset = await this.prisma.asset.findFirstOrThrow({ where: { id: input.assetId, deletedAt: null }, include: { operators: { where: { userId: u.id, validTo: null } } } });
    if (u.scope === 'self' && !asset.operators.length) throw new ForbiddenException('You are not an assigned operator of this machine');
    const date = new Date(input.date); date.setUTCHours(0, 0, 0, 0);
    if (await this.prisma.shiftReport.findUnique({ where: { assetId_date_shift: { assetId: asset.id, date, shift: input.shift } } }))
      throw new ConflictException(`A ${input.shift.toLowerCase()} shift report for ${asset.assetNumber} on ${date.toISOString().slice(0, 10)} already exists`);
    const { id, chemicals, signatureAttachmentId, date: _d, ...rest } = input;
    const report = await this.prisma.$transaction(async (tx) => {
      const r = await tx.shiftReport.create({ data: { ...(id ? { id } : {}), ...rest, date, userId: u.id, totalMeters: totalMetersDrilled(input.startDepth, input.endDepth), signatureId: signatureAttachmentId ?? null,
        chemicals: { create: chemicals.map((c) => ({ chemicalId: c.chemicalId, quantity: c.quantity, unit: c.unit, purpose: c.purpose, stockOnHand: c.stockOnHand })) } }, include: this.include });
      await tx.auditLog.create({ data: { actorId: u.id, deviceId: u.deviceId, entity: 'ShiftReport', entityId: r.id, action: 'SUBMIT' } });
      return r;
    });
    await this.notify.notifyRoles(asset.siteId, ['SUPERVISOR'], { type: 'approval_required', title: `${asset.assetNumber} · ${input.shift === 'DAY' ? 'Day' : 'Night'} shift report awaiting approval`, body: `${u.employeeId} drilled ${report.totalMeters} m across ${input.holesCompleted} hole(s).`, payload: { shiftReportId: report.id } });
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
    const r = await this.get(u, id);
    if (r.status === 'APPROVED' && u.role === 'SUPERVISOR') throw new ForbiddenException('Supervisors cannot edit approved data; ask a manager');
    const out = await this.prisma.shiftReport.update({ where: { id }, data: { status: 'UNLOCKED', approvedById: null, approvedAt: null }, include: this.include });
    await this.prisma.auditLog.create({ data: { actorId: u.id, deviceId: u.deviceId, entity: 'ShiftReport', entityId: id, action: 'UNLOCK', diff: { reason } as never } });
    await this.prisma.notification.create({ data: { userId: r.userId, type: 'report_unlocked', title: `${r.asset.assetNumber} shift report unlocked for correction`, body: reason } });
    return out;
  }

  /** Operator resubmits an unlocked report; full diff goes to the audit trail. */
  async update(u: AuthUser, id: string, input: ShiftReportInput) {
    const r = await this.get(u, id);
    if (r.status !== 'UNLOCKED') throw new ConflictException('Report is locked. Ask your supervisor to unlock it.');
    if (u.scope === 'self' && r.userId !== u.id) throw new ForbiddenException('Only the submitting operator can edit this report');
    const { id: _i, chemicals, signatureAttachmentId, date: _d, assetId: _a, ...rest } = input;
    const out = await this.prisma.$transaction(async (tx) => {
      await tx.shiftReportChemical.deleteMany({ where: { shiftReportId: id } });
      const upd = await tx.shiftReport.update({ where: { id }, data: { ...rest, totalMeters: totalMetersDrilled(input.startDepth, input.endDepth), status: 'SUBMITTED', submittedAt: new Date(),
        chemicals: { create: chemicals.map((c) => ({ chemicalId: c.chemicalId, quantity: c.quantity, unit: c.unit, purpose: c.purpose, stockOnHand: c.stockOnHand })) } }, include: this.include });
      await tx.auditLog.create({ data: { actorId: u.id, deviceId: u.deviceId, entity: 'ShiftReport', entityId: id, action: 'RESUBMIT', diff: { before: { startDepth: r.startDepth, endDepth: r.endDepth, holesCompleted: r.holesCompleted, downtimeHours: r.downtimeHours }, after: { startDepth: input.startDepth, endDepth: input.endDepth, holesCompleted: input.holesCompleted, downtimeHours: input.downtimeHours } } as never } });
      return upd;
    });
    return out;
  }
}
