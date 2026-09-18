import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';

/**
 * Object storage for photos, signatures and report files (SRS §9.3 at-rest encryption is provided by the bucket).
 * Driver: S3-compatible (MinIO/R2/S3) when S3_ENDPOINT or AWS creds are set; otherwise local disk under apps/api/uploads (dev only).
 */
@Injectable()
export class StorageService {
  /** STORAGE_DRIVER=s3|local; defaults to local so dev works without MinIO. */
  readonly driver: 's3' | 'local' = process.env.STORAGE_DRIVER === 's3' ? 's3' : 'local';
  private s3 = this.driver === 's3' ? this.client(process.env.S3_ENDPOINT) : null;
  /** Presigned URLs are handed to browsers/devices, so they must be signed for an endpoint those can reach (S3_ENDPOINT is often loopback-only). */
  private s3Public = this.s3 && process.env.S3_PUBLIC_ENDPOINT ? this.client(process.env.S3_PUBLIC_ENDPOINT) : this.s3;
  private localDir = process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads');
  private publicBase = process.env.PUBLIC_API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;

  private client(endpoint?: string) {
    return new S3Client({ region: process.env.AWS_REGION ?? 'auto', endpoint, forcePathStyle: true, credentials: { accessKeyId: process.env.S3_ACCESS_KEY!, secretAccessKey: process.env.S3_SECRET_KEY! } });
  }

  async putBase64(key: string, base64: string, contentType: string) {
    const buf = Buffer.from(base64, 'base64');
    if (this.s3) { await this.s3.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: buf, ContentType: contentType })); }
    else { const p = join(this.localDir, key); if (!existsSync(dirname(p))) mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, buf); }
    return buf.length;
  }
  /** Presigned PUT for large uploads straight from the device (S3 driver only). */
  async presignPut(key: string, contentType: string) {
    if (!this.s3Public) return null;
    return getSignedUrl(this.s3Public, new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, ContentType: contentType }), { expiresIn: 900 });
  }
  async urlFor(key: string) {
    if (this.s3Public) return getSignedUrl(this.s3Public, new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }), { expiresIn: 3600 });
    return `${this.publicBase}/uploads/${key}`;
  }
}
