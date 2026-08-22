import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { can } from '@drillex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AuthUser } from '../auth/decorators';

export type AttachmentInput = { id?: string; ownerType: string; ownerId: string; kind: 'PHOTO' | 'DOCUMENT' | 'SIGNATURE'; contentType: string; base64: string };
const MAX_BYTES = 8 * 1024 * 1024;
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' };

/** Mirrors the scope rules each owning module already enforces on its own endpoints (SRS §9.3) — an
 * attachment is only as accessible as the record it's attached to, never open to any authenticated user. */
const OWNER_PERMISSION = {
  DailyReading: { read: 'daily_reading:read', write: 'daily_reading:create' },
  ShiftReport: { read: 'shift_report:read', write: 'shift_report:create' },
  JobCard: { read: 'job_card:read', write: 'job_card:create' },
  Asset: { read: 'asset:read', write: 'asset:write' },
} as const;

@Injectable()
export class AttachmentsService {
  constructor(private prisma: PrismaService, private storage: StorageService) {}

  private async assertOwnerAccess(u: AuthUser, ownerType: string, ownerId: string, mode: 'read' | 'write') {
    const perms = OWNER_PERMISSION[ownerType as keyof typeof OWNER_PERMISSION];
    if (!perms) throw new BadRequestException(`Unknown ownerType: ${ownerType}`);
    const scope = can(u.role, perms[mode]);
    if (!scope) throw new ForbiddenException(`Missing permission ${perms[mode]}`);
    if (scope === 'all') return;

    let siteId: string | null | undefined;
    let isSelf = false;
    if (ownerType === 'DailyReading' || ownerType === 'ShiftReport') {
      const table = ownerType === 'DailyReading' ? this.prisma.dailyReading : this.prisma.shiftReport;
      const row = await (table as typeof this.prisma.dailyReading).findUnique({ where: { id: ownerId }, include: { asset: { select: { siteId: true } } } });
      if (!row) throw new NotFoundException(`${ownerType} not found`);
      siteId = row.asset.siteId; isSelf = row.userId === u.id;
    } else if (ownerType === 'JobCard') {
      const row = await this.prisma.jobCard.findUnique({ where: { id: ownerId }, include: { asset: { select: { siteId: true } } } });
      if (!row) throw new NotFoundException('JobCard not found');
      siteId = row.asset.siteId; isSelf = row.technicianIds.includes(u.id);
    } else if (ownerType === 'Asset') {
      const row = await this.prisma.asset.findUnique({ where: { id: ownerId }, select: { siteId: true, operators: { where: { userId: u.id, validTo: null }, select: { userId: true } } } });
      if (!row) throw new NotFoundException('Asset not found');
      siteId = row.siteId; isSelf = row.operators.length > 0;
    }

    if (scope === 'site' && siteId !== u.siteId) throw new ForbiddenException('This record is not on your site');
    if (scope === 'self' && !isSelf) throw new ForbiddenException('You do not have access to this record');
  }

  /** Idempotent by client id: re-uploading the same attachment from an offline queue is a no-op. */
  async upload(u: AuthUser, input: AttachmentInput) {
    await this.assertOwnerAccess(u, input.ownerType, input.ownerId, 'write');
    const id = input.id ?? randomUUID();
    const existing = await this.prisma.attachment.findUnique({ where: { id } });
    if (existing) return { ...existing, url: await this.storage.urlFor(existing.storageKey), duplicate: true };
    const ext = EXT[input.contentType]; if (!ext) throw new BadRequestException('Unsupported content type');
    const bytes = Buffer.byteLength(input.base64, 'base64'); if (bytes > MAX_BYTES) throw new BadRequestException('File exceeds 8 MB');
    const key = `${input.ownerType.toLowerCase()}/${input.ownerId}/${id}.${ext}`;
    await this.storage.putBase64(key, input.base64, input.contentType);
    const sha256 = createHash('sha256').update(Buffer.from(input.base64, 'base64')).digest('hex');
    const row = await this.prisma.attachment.create({ data: { id, ownerType: input.ownerType, ownerId: input.ownerId, kind: input.kind, storageKey: key, mimeType: input.contentType, sha256, createdBy: u.id } });
    return { ...row, url: await this.storage.urlFor(key), duplicate: false };
  }

  async listFor(u: AuthUser, ownerType: string, ownerId: string) {
    await this.assertOwnerAccess(u, ownerType, ownerId, 'read');
    const rows = await this.prisma.attachment.findMany({ where: { ownerType, ownerId }, orderBy: { createdAt: 'asc' } });
    return Promise.all(rows.map(async (r) => ({ ...r, url: await this.storage.urlFor(r.storageKey) })));
  }
}
