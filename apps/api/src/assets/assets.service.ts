import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { AssetPrefix, AssetSchema, AssetUpdateSchema, OPEN_JOB_STATUSES } from '@drillex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/decorators';

@Injectable()
export class AssetsService {
  constructor(private prisma: PrismaService) {}

  /** Operators see the assets they are assigned to, site roles their own site, managers and admins everything. */
  private scopeWhere(u: AuthUser) {
    return (
      u.scope === 'self' ? { operators: { some: { userId: u.id, validTo: null } } }
      : u.scope === 'site' ? { siteId: u.siteId ?? undefined }
      : {}
    );
  }

  /** Assignments are a validFrom/validTo window, so only the open ones are the current operators. */
  private readonly include = { operators: { where: { validTo: null } } };

  list(u: AuthUser) {
    return this.prisma.asset.findMany({ where: { ...this.scopeWhere(u), deletedAt: null }, include: this.include, orderBy: { assetNumber: 'asc' } });
  }

  /** Out-of-scope assets 404 rather than 403 so the register does not leak which assets exist elsewhere. */
  async get(u: AuthUser, id: string) {
    const asset = await this.prisma.asset.findFirst({ where: { id, deletedAt: null, ...this.scopeWhere(u) }, include: this.include });
    if (!asset) throw new NotFoundException('Asset not found');
    return asset;
  }

  /** Asset numbers are immutable and never reused (SRS 3.1): take max sequence per prefix, +1. */
  async create(input: z.infer<typeof AssetSchema>, actorId: string) {
    const prefix = AssetPrefix[input.category];
    return this.prisma.$transaction(async (tx) => {
      const last = await tx.asset.findFirst({ where: { assetNumber: { startsWith: `${prefix}-` } }, orderBy: { assetNumber: 'desc' } });
      const seq = last ? parseInt(last.assetNumber.split('-')[1], 10) + 1 : 1;
      const assetNumber = `${prefix}-${String(seq).padStart(3, '0')}`;
      const { operatorIds, ...data } = input;
      const asset = await tx.asset.create({ data: { ...data, assetNumber, operators: { create: operatorIds.map((userId) => ({ userId })) } } });
      await tx.auditLog.create({ data: { actorId, entity: 'Asset', entityId: asset.id, action: 'CREATE', diff: input as object } });
      return asset;
    });
  }

  async update(u: AuthUser, id: string, input: z.infer<typeof AssetUpdateSchema>) {
    const asset = await this.prisma.asset.findFirstOrThrow({ where: { id, deletedAt: null, ...this.scopeWhere(u) } });
    // UNDER_MAINTENANCE belongs to the job-card flow (JobCardsService.syncAssetStatus), which would overwrite anything set here — rejected even when it matches the current value, so the rule does not depend on timing.
    if (input.status === 'UNDER_MAINTENANCE') throw new BadRequestException('Under maintenance is set automatically while a job card is open on this asset');
    // DECOMMISSIONED is the one status that flow leaves alone, so it can be set even mid-job.
    if (input.status && input.status !== asset.status && input.status !== 'DECOMMISSIONED') await this.assertNoOpenWork(id, 'changed');
    const { operatorIds, ...data } = input;
    return this.prisma.$transaction(async (tx) => {
      if (operatorIds) {
        // AssetOperator is keyed on (assetId, userId), so re-assigning someone reopens their existing window rather than adding a second row.
        for (const userId of operatorIds) {
          await tx.assetOperator.upsert({ where: { assetId_userId: { assetId: id, userId } }, create: { assetId: id, userId }, update: { validFrom: new Date(), validTo: null } });
        }
        await tx.assetOperator.updateMany({ where: { assetId: id, validTo: null, userId: { notIn: operatorIds } }, data: { validTo: new Date() } });
      }
      const row = await tx.asset.update({ where: { id }, data, include: this.include });
      await tx.auditLog.create({ data: { actorId: u.id, deviceId: u.deviceId, entity: 'Asset', entityId: id, action: 'UPDATE', diff: input as object } });
      return row;
    });
  }

  /** Soft delete so the job cards, readings and reports already recorded against the asset keep resolving. */
  async remove(u: AuthUser, id: string) {
    await this.prisma.asset.findFirstOrThrow({ where: { id, deletedAt: null, ...this.scopeWhere(u) } });
    await this.assertNoOpenWork(id, 'deleted');
    return this.prisma.$transaction(async (tx) => {
      await tx.assetOperator.updateMany({ where: { assetId: id, validTo: null }, data: { validTo: new Date() } });
      await tx.asset.update({ where: { id }, data: { deletedAt: new Date() } });
      await tx.auditLog.create({ data: { actorId: u.id, deviceId: u.deviceId, entity: 'Asset', entityId: id, action: 'DELETE' } });
      return { ok: true };
    });
  }

  private async assertNoOpenWork(assetId: string, verb: string) {
    const open = await this.prisma.jobCard.count({ where: { assetId, deletedAt: null, status: { in: [...OPEN_JOB_STATUSES] } } });
    if (open) throw new BadRequestException(`${open} open job card${open > 1 ? 's' : ''} on this asset — close or approve them before it can be ${verb}`);
  }
}
