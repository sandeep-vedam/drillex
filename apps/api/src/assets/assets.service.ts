import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AssetPrefix, AssetSchema } from '@drillex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/decorators';

@Injectable()
export class AssetsService {
  constructor(private prisma: PrismaService) {}

  list(u: AuthUser) {
    const where =
      u.scope === 'self' ? { operators: { some: { userId: u.id, validTo: null } } }
      : u.scope === 'site' ? { siteId: u.siteId ?? undefined }
      : {};
    return this.prisma.asset.findMany({ where: { ...where, deletedAt: null }, include: { operators: true }, orderBy: { assetNumber: 'asc' } });
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
}
