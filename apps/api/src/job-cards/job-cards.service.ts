import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { JobCardInput, OPEN_JOB_STATUSES } from '@drillex/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageService } from '../storage/storage.service';
import { AuthUser } from '../auth/decorators';
import { assertSufficientStock } from '../parts/parts.controller';
import { assignedTo, technicianIds } from '../common/technician-ids';

@Injectable()
export class JobCardsService {
  constructor(private prisma: PrismaService, private notify: NotificationsService, private storage: StorageService) {}
  private assetScope(u: AuthUser) { return u.scope === 'site' ? { siteId: u.siteId ?? undefined } : {}; }
  private include = { asset: { select: { assetNumber: true, name: true, siteId: true, status: true } }, parts: { include: { part: { select: { partNo: true, name: true, unitCost: true } } } } };
  private selfFilter(u: AuthUser) { return u.scope === 'self' ? assignedTo(u.id) : {}; }

  async list(u: AuthUser, q: { status?: string; assetId?: string; from?: string; to?: string }) {
    return this.prisma.jobCard.findMany({ where: { deletedAt: null, asset: this.assetScope(u), ...this.selfFilter(u), ...(q.status ? { status: q.status as never } : {}), ...(q.assetId ? { assetId: q.assetId } : {}), ...(q.from || q.to ? { date: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } } : {}) }, include: this.include, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 200 });
  }
  async get(u: AuthUser, id: string) {
    const jc = await this.prisma.jobCard.findFirstOrThrow({ where: { id, deletedAt: null, asset: this.assetScope(u), ...this.selfFilter(u) }, include: this.include });
    const atts = await this.prisma.attachment.findMany({ where: { ownerType: 'JobCard', ownerId: id }, orderBy: { createdAt: 'asc' } });
    const techs = await this.prisma.user.findMany({ where: { id: { in: technicianIds(jc.technicianIds) } }, select: { id: true, employeeId: true, name: true } });
    return { ...jc, technicians: techs, attachments: await Promise.all(atts.map(async (a) => ({ id: a.id, kind: a.kind, url: await this.storage.urlFor(a.storageKey) }))) };
  }

  private async nextJobNo(tx: Prisma.TransactionClient) {
    const y = new Date().getFullYear(); const prefix = `JC-${y}-`;
    const last = await tx.jobCard.findFirst({ where: { jobNo: { startsWith: prefix } }, orderBy: { jobNo: 'desc' } });
    return `${prefix}${String(last ? parseInt(last.jobNo.slice(prefix.length), 10) + 1 : 1).padStart(4, '0')}`;
  }

  /** SRS §7: every piece of work gets a job card; parts used are deducted; asset goes Under Maintenance while the job is open (§6.3). */
  async create(u: AuthUser, input: JobCardInput) {
    const asset = await this.prisma.asset.findFirstOrThrow({ where: { id: input.assetId, deletedAt: null, ...this.assetScope(u) } });
    if (input.id && (await this.prisma.jobCard.findUnique({ where: { id: input.id } }))) throw new ConflictException('Job card already exists');
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
      const open = (OPEN_JOB_STATUSES as readonly string[]).includes(row.status);
      if (open && asset.status !== 'UNDER_MAINTENANCE' && asset.status !== 'DECOMMISSIONED') await tx.asset.update({ where: { id: asset.id }, data: { status: 'UNDER_MAINTENANCE' } });
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
    const out = await this.prisma.$transaction(async (tx) => {
      if (parts) {
        for (const p of jc.parts) { await tx.part.update({ where: { id: p.partId }, data: { qtyOnHand: { increment: p.quantity } } }); await tx.partStockMovement.create({ data: { partId: p.partId, type: 'IN', quantity: p.quantity, reference: `${jc.jobNo} (revised)` } }); }
        await tx.jobCardPart.deleteMany({ where: { jobCardId: id } });
        for (const p of parts) { await assertSufficientStock(tx, p.partId, p.quantity); await tx.jobCardPart.create({ data: { jobCardId: id, partId: p.partId, quantity: p.quantity } }); await tx.part.update({ where: { id: p.partId }, data: { qtyOnHand: { decrement: p.quantity } } }); await tx.partStockMovement.create({ data: { partId: p.partId, type: 'OUT', quantity: -p.quantity, reference: jc.jobNo } }); }
      }
      const row = await tx.jobCard.update({ where: { id }, data: { ...rest, ...(date ? { date: new Date(date) } : {}), ...(techSignatureAttachmentId ? { techSignatureId: techSignatureAttachmentId } : {}) }, include: this.include });
      await this.syncAssetStatus(tx, jc.assetId);
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
    const out = await this.prisma.$transaction(async (tx) => {
      const r = await tx.jobCard.update({ where: { id }, data: { approvedById: u.id, approvedAt: new Date() }, include: this.include });
      await this.syncAssetStatus(tx, jc.assetId);
      await tx.auditLog.create({ data: { actorId: u.id, deviceId: u.deviceId, entity: 'JobCard', entityId: id, action: 'APPROVE' } });
      return r;
    });
    await this.prisma.notification.createMany({ data: technicianIds(jc.technicianIds).map((userId) => ({ userId, type: 'job_card_approved', title: `${jc.jobNo} approved`, body: `Approved by ${u.employeeId}.` })) });
    return out;
  }

  /** Asset is Under Maintenance while any job card is open; back to Active when none are. */
  private async syncAssetStatus(tx: Prisma.TransactionClient, assetId: string) {
    const open = await tx.jobCard.count({ where: { assetId, deletedAt: null, status: { in: [...OPEN_JOB_STATUSES] } } });
    const asset = await tx.asset.findUnique({ where: { id: assetId } });
    if (!asset || asset.status === 'DECOMMISSIONED') return;
    if (open && asset.status !== 'UNDER_MAINTENANCE') await tx.asset.update({ where: { id: assetId }, data: { status: 'UNDER_MAINTENANCE' } });
    if (!open && asset.status === 'UNDER_MAINTENANCE') await tx.asset.update({ where: { id: assetId }, data: { status: 'ACTIVE' } });
  }

  private async lowStockCheck(partIds: string[]) {
    if (!partIds.length) return;
    const low = await this.prisma.part.findMany({ where: { id: { in: partIds } } });
    for (const p of low.filter((x) => x.qtyOnHand < x.minQty)) await this.notify.notifyRoles(null, ['MANAGER', 'TECHNICIAN'], { type: 'low_stock', title: `Low stock: ${p.partNo} ${p.name}`, body: `${p.qtyOnHand} on hand, minimum ${p.minQty}.`, payload: { partId: p.id } });
  }
}
