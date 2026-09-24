import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { JobCardInput } from '@drillex/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageService } from '../storage/storage.service';
import { AuthUser } from '../auth/decorators';
import { assertSufficientStock } from '../parts/parts.controller';
import { getOperationsSettings } from '../settings/settings.util';
import { syncAssetStatus } from './open-jobs';
import { nextSequence } from '../common/sequence';

const SIGNATURE_REQUIRED = 'The technician must sign the job card before it can be marked completed';

@Injectable()
export class JobCardsService {
  constructor(private prisma: PrismaService, private notify: NotificationsService, private storage: StorageService) {}
  private assetScope(u: AuthUser) { return u.scope === 'site' ? { siteId: u.siteId ?? undefined } : {}; }
  private include = { asset: { select: { assetNumber: true, name: true, siteId: true, status: true } }, parts: { include: { part: { select: { partNo: true, name: true, unitCost: true } } } } };
  private selfFilter(u: AuthUser) { return u.scope === 'self' ? { technicianIds: { has: u.id } } : {}; }

  async list(u: AuthUser, q: { status?: string; assetId?: string; from?: string; to?: string }) {
    return this.prisma.jobCard.findMany({ where: { deletedAt: null, asset: this.assetScope(u), ...this.selfFilter(u), ...(q.status ? { status: q.status as never } : {}), ...(q.assetId ? { assetId: q.assetId } : {}), ...(q.from || q.to ? { date: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } } : {}) }, include: this.include, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 200 });
  }
  async get(u: AuthUser, id: string) {
    const jc = await this.prisma.jobCard.findFirstOrThrow({ where: { id, deletedAt: null, asset: this.assetScope(u), ...this.selfFilter(u) }, include: this.include });
    const atts = await this.prisma.attachment.findMany({ where: { ownerType: 'JobCard', ownerId: id }, orderBy: { createdAt: 'asc' } });
    const techs = await this.prisma.user.findMany({ where: { id: { in: jc.technicianIds } }, select: { id: true, employeeId: true, name: true } });
    return { ...jc, technicians: techs, attachments: await Promise.all(atts.map(async (a) => ({ id: a.id, kind: a.kind, url: await this.storage.urlFor(a.storageKey) }))) };
  }

  technicians() {
    return this.prisma.user.findMany({ where: { status: 'ACTIVE', role: 'TECHNICIAN' }, select: { id: true, employeeId: true, name: true }, orderBy: { employeeId: 'asc' } });
  }

  /** JC-YYYY-#### (SRS §7.1). Serialised per year, so two cards created at once cannot draw the same number. */
  private async nextJobNo(tx: Prisma.TransactionClient) {
    const prefix = `JC-${new Date().getUTCFullYear()}-`;
    return `${prefix}${String(await nextSequence(tx, 'JobCard', 'jobNo', prefix)).padStart(4, '0')}`;
  }

  /** SRS §7: every piece of work gets a job card; parts used are deducted; asset goes Under Maintenance while the job is open (§6.3). */
  async create(u: AuthUser, input: JobCardInput) {
    const asset = await this.prisma.asset.findFirstOrThrow({ where: { id: input.assetId, deletedAt: null, ...this.assetScope(u) } });
    if (input.id && (await this.prisma.jobCard.findUnique({ where: { id: input.id } }))) throw new ConflictException('Job card already exists');
    // SRS §7.6: completion needs the technician's sign-off. Offline, the signature is queued right after the card,
    // so only its id can be checked here.
    if (input.status === 'COMPLETED' && !input.techSignatureAttachmentId) throw new BadRequestException(SIGNATURE_REQUIRED);
    const { jobCardApprovalRequired } = await getOperationsSettings(this.prisma);
    const techIds = input.technicianIds.length ? input.technicianIds : u.role === 'TECHNICIAN' ? [u.id] : [];
    const { id, parts, date, techSignatureAttachmentId, scheduleId, ...rest } = input;
    const d = new Date(date); d.setUTCHours(0, 0, 0, 0);
    const jc = await this.prisma.$transaction(async (tx) => {
      const jobNo = await this.nextJobNo(tx);
      const row = await tx.jobCard.create({ data: { ...(id ? { id } : {}), ...rest, date: d, jobNo, technicianIds: techIds, techSignatureId: techSignatureAttachmentId ?? null, parts: { create: parts } }, include: this.include });
      for (const p of parts) {
        await assertSufficientStock(tx, p.partId, p.quantity);
        await tx.partStockMovement.create({ data: { partId: p.partId, type: 'OUT', quantity: -p.quantity, reference: jobNo } });
        await tx.part.update({ where: { id: p.partId }, data: { qtyOnHand: { decrement: p.quantity } } });
      }
      await syncAssetStatus(tx, asset.id, jobCardApprovalRequired);
      if (scheduleId && row.status === 'COMPLETED') await tx.maintenanceSchedule.updateMany({ where: { id: scheduleId }, data: { lastServiceAt: d, lastServiceHours: input.hourMeter ?? undefined } });
      await tx.auditLog.create({ data: { actorId: u.id, deviceId: u.deviceId, entity: 'JobCard', entityId: row.id, action: 'CREATE', diff: { jobNo, status: row.status, parts } as never } });
      return row;
    });
    await this.lowStockCheck(parts.map((p) => p.partId));
    if (jc.status === 'COMPLETED') await this.notify.notifyRoles(asset.siteId, ['SUPERVISOR'], { type: 'approval_required', title: `${jc.jobNo} · ${asset.assetNumber} job card awaiting approval`, body: jc.workPerformed.slice(0, 120), payload: { jobCardId: jc.id } });
    return jc;
  }

  async update(u: AuthUser, id: string, input: Partial<JobCardInput>) {
    const jc = await this.prisma.jobCard.findFirstOrThrow({ where: { id, deletedAt: null, asset: this.assetScope(u), ...this.selfFilter(u) }, include: { parts: true, asset: true } });
    if (jc.approvedAt) throw new ForbiddenException('Approved job cards cannot be edited');
    const { id: _i, parts, date, assetId: _a, techSignatureAttachmentId, scheduleId: _s, ...rest } = input;
    if (input.status === 'COMPLETED' && jc.status !== 'COMPLETED') {
      const sigId = techSignatureAttachmentId ?? jc.techSignatureId;
      const sig = sigId ? await this.prisma.attachment.findFirst({ where: { id: sigId, ownerType: 'JobCard', ownerId: id, kind: 'SIGNATURE' } }) : null;
      if (!sig) throw new BadRequestException(SIGNATURE_REQUIRED);
    }
    const { jobCardApprovalRequired } = await getOperationsSettings(this.prisma);
    const out = await this.prisma.$transaction(async (tx) => {
      if (parts) {
        for (const p of jc.parts) { await tx.part.update({ where: { id: p.partId }, data: { qtyOnHand: { increment: p.quantity } } }); await tx.partStockMovement.create({ data: { partId: p.partId, type: 'IN', quantity: p.quantity, reference: `${jc.jobNo} (revised)` } }); }
        await tx.jobCardPart.deleteMany({ where: { jobCardId: id } });
        for (const p of parts) { await assertSufficientStock(tx, p.partId, p.quantity); await tx.jobCardPart.create({ data: { jobCardId: id, partId: p.partId, quantity: p.quantity } }); await tx.part.update({ where: { id: p.partId }, data: { qtyOnHand: { decrement: p.quantity } } }); await tx.partStockMovement.create({ data: { partId: p.partId, type: 'OUT', quantity: -p.quantity, reference: jc.jobNo } }); }
      }
      const row = await tx.jobCard.update({ where: { id }, data: { ...rest, ...(date ? { date: new Date(date) } : {}), ...(techSignatureAttachmentId ? { techSignatureId: techSignatureAttachmentId } : {}) }, include: this.include });
      await syncAssetStatus(tx, jc.assetId, jobCardApprovalRequired);
      await tx.auditLog.create({ data: { actorId: u.id, deviceId: u.deviceId, entity: 'JobCard', entityId: id, action: 'UPDATE', diff: input as never } });
      return row;
    });
    if (parts) await this.lowStockCheck(parts.map((p) => p.partId));
    if (out.status === 'COMPLETED' && jc.status !== 'COMPLETED') await this.notify.notifyRoles(jc.asset.siteId, ['SUPERVISOR'], { type: 'approval_required', title: `${jc.jobNo} · ${jc.asset.assetNumber} job card awaiting approval`, payload: { jobCardId: id } });
    return out;
  }

  async approve(u: AuthUser, id: string) {
    const jc = await this.prisma.jobCard.findFirstOrThrow({ where: { id, deletedAt: null, asset: this.assetScope(u) }, include: { asset: true } });
    if (jc.status !== 'COMPLETED') throw new ConflictException('Only completed job cards can be approved');
    if (jc.approvedAt) throw new ConflictException('Already approved');
    const { jobCardApprovalRequired } = await getOperationsSettings(this.prisma);
    const out = await this.prisma.$transaction(async (tx) => {
      const r = await tx.jobCard.update({ where: { id }, data: { approvedById: u.id, approvedAt: new Date() }, include: this.include });
      await syncAssetStatus(tx, jc.assetId, jobCardApprovalRequired);
      await tx.auditLog.create({ data: { actorId: u.id, deviceId: u.deviceId, entity: 'JobCard', entityId: id, action: 'APPROVE' } });
      return r;
    });
    await this.prisma.notification.createMany({ data: jc.technicianIds.map((userId) => ({ userId, type: 'job_card_approved', title: `${jc.jobNo} approved`, body: `Approved by ${u.employeeId}.` })) });
    return out;
  }

  private async lowStockCheck(partIds: string[]) {
    if (!partIds.length) return;
    const low = await this.prisma.part.findMany({ where: { id: { in: partIds } } });
    for (const p of low.filter((x) => x.qtyOnHand < x.minQty)) await this.notify.notifyRoles(null, ['MANAGER', 'TECHNICIAN'], { type: 'low_stock', title: `Low stock: ${p.partNo} ${p.name}`, body: `${p.qtyOnHand} on hand, minimum ${p.minQty}.`, payload: { partId: p.id } });
  }
}
