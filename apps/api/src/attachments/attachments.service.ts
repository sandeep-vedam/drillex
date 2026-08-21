import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AuthUser } from '../auth/decorators';

export type AttachmentInput = { id?: string; ownerType: string; ownerId: string; kind: 'PHOTO' | 'DOCUMENT' | 'SIGNATURE'; contentType: string; base64: string };
const MAX_BYTES = 8 * 1024 * 1024;
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' };

@Injectable()
export class AttachmentsService {
  constructor(private prisma: PrismaService, private storage: StorageService) {}

  /** Idempotent by client id: re-uploading the same attachment from an offline queue is a no-op. */
  async upload(u: AuthUser, input: AttachmentInput) {
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

  async listFor(ownerType: string, ownerId: string) {
    const rows = await this.prisma.attachment.findMany({ where: { ownerType, ownerId }, orderBy: { createdAt: 'asc' } });
    return Promise.all(rows.map(async (r) => ({ ...r, url: await this.storage.urlFor(r.storageKey) })));
  }
}
