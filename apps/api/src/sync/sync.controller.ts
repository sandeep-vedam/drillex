import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { DailyReadingSchema, JobCardSchema, ShiftReportSchema } from '@drillex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { DailyReadingsService } from '../daily-readings/daily-readings.service';
import { ShiftReportsService } from '../shift-reports/shift-reports.service';
import { JobCardsService } from '../job-cards/job-cards.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { AttachmentSchema } from '../attachments/attachments.controller';
import { AuthUser, CurrentUser, RequirePermission } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';

const OpSchema = z.object({ opId: z.string().min(1), kind: z.enum(['attachment', 'daily_reading', 'shift_report', 'job_card']), payload: z.unknown(), queuedAt: z.string().optional() });
// ops are unknown at this layer so one malformed envelope (bad opId/kind) rejects only that op, not the whole batch — validated per-op below.
const PushSchema = z.object({ ops: z.array(z.unknown()).max(200) });
const OWNER_MISSING = /not found$/i; // AttachmentsService throws `${ownerType} not found` when the owning record is not there yet
type Result = { opId: string; status: 'applied' | 'duplicate' | 'conflict' | 'rejected'; error?: string; id?: string };

/**
 * Offline outbox sync (SRS §9.2). Each op carries a client-generated UUID, so replays are idempotent:
 * same id → 'duplicate' (already applied); same business key but different id → 'conflict' (kept for supervisor review);
 * validation/RBAC failure → 'rejected' with the reason so the device can show it.
 */
@Controller('sync')
export class SyncController {
  constructor(private prisma: PrismaService, private readings: DailyReadingsService, private shifts: ShiftReportsService, private attachments: AttachmentsService, private jobCards: JobCardsService) {}

  @Post('push')
  async push(@CurrentUser() u: AuthUser, @Body(new ZodPipe(PushSchema)) b: z.infer<typeof PushSchema>) {
    const results: Result[] = [];
    const parsedOps: z.infer<typeof OpSchema>[] = [];
    for (const raw of b.ops) {
      const parsed = OpSchema.safeParse(raw);
      if (!parsed.success) {
        const opId = typeof (raw as { opId?: unknown })?.opId === 'string' ? (raw as { opId: string }).opId : 'unknown';
        results.push({ opId, status: 'rejected', error: 'Malformed op envelope' });
        continue;
      }
      parsedOps.push(parsed.data);
    }

    // A device queues a photo or signature before the record it hangs off, so on the first pass the owner may
    // not exist yet. Those are retried once the rest of the batch has been applied, rather than being rejected
    // back to the device — where they would sit as a failure until someone pressed retry by hand.
    const deferred: z.infer<typeof OpSchema>[] = [];
    for (const op of parsedOps) {
      const r = await this.applyOp(u, op);
      if (op.kind === 'attachment' && r.status === 'rejected' && OWNER_MISSING.test(r.error ?? '')) deferred.push(op);
      else results.push(r);
    }
    for (const op of deferred) results.push(await this.applyOp(u, op));

    return { results, serverTime: new Date().toISOString() };
  }

  /**
   * Applies one op, at most once per client op ID (SRS §9.2.2): an op already processed is answered as a duplicate
   * without touching the data again. Rejections are not recorded, so a device can retry them after a fix.
   */
  private async applyOp(u: AuthUser, op: z.infer<typeof OpSchema>): Promise<Result> {
    const seen = await this.prisma.syncOperation.findUnique({ where: { opId: op.opId } });
    if (seen) return { opId: op.opId, status: 'duplicate', ...(seen.entityId ? { id: seen.entityId } : {}) };
    const r = await this.applyOnce(u, op);
    if (r.status !== 'rejected') {
      await this.prisma.syncOperation.create({ data: { opId: op.opId, userId: u.id, kind: op.kind, status: r.status, entityId: r.id ?? null } })
        .catch((e: { code?: string }) => { if (e.code !== 'P2002') throw e; }); // same op sent twice at once: first one wins
    }
    return r;
  }

  /** Every outcome is a Result — the caller decides whether a rejection is worth retrying. */
  private async applyOnce(u: AuthUser, op: z.infer<typeof OpSchema>): Promise<Result> {
    try {
      if (op.kind === 'attachment') {
        const a = AttachmentSchema.parse(op.payload);
        const r = await this.attachments.upload(u, a);
        return { opId: op.opId, status: r.duplicate ? 'duplicate' : 'applied', id: r.id };
      }
      if (op.kind === 'daily_reading') {
        const d = DailyReadingSchema.parse(op.payload);
        if (d.id && (await this.prisma.dailyReading.findUnique({ where: { id: d.id } }))) return { opId: op.opId, status: 'duplicate', id: d.id };
        try { const r = await this.readings.create(u, d); return { opId: op.opId, status: 'applied', id: r.id }; }
        catch (e) {
          if ((e as { status?: number }).status !== 409) throw e;
          await this.conflict(u, 'DailyReading', d.id, d);
          return { opId: op.opId, status: 'conflict', error: (e as Error).message };
        }
      }
      if (op.kind === 'shift_report') {
        const d = ShiftReportSchema.parse(op.payload);
        if (d.id && (await this.prisma.shiftReport.findUnique({ where: { id: d.id } }))) return { opId: op.opId, status: 'duplicate', id: d.id };
        try { const r = await this.shifts.create(u, d); return { opId: op.opId, status: 'applied', id: r.id }; }
        catch (e) {
          if ((e as { status?: number }).status !== 409) throw e;
          await this.conflict(u, 'ShiftReport', d.id, d);
          return { opId: op.opId, status: 'conflict', error: (e as Error).message };
        }
      }
      const d = JobCardSchema.parse(op.payload);
      if (d.id && (await this.prisma.jobCard.findUnique({ where: { id: d.id } }))) return { opId: op.opId, status: 'duplicate', id: d.id };
      const r = await this.jobCards.create(u, d);
      return { opId: op.opId, status: 'applied', id: r.id };
    } catch (e) {
      const err = e as { message?: string; response?: { message?: unknown } };
      return { opId: op.opId, status: 'rejected', error: typeof err.response?.message === 'string' ? err.response.message : err.message ?? 'Rejected' };
    }
  }

  private async conflict(u: AuthUser, entity: string, entityId: string | undefined, incoming: unknown) {
    const c = await this.prisma.syncConflict.create({ data: { entity, entityId: entityId ?? 'unknown', versions: { incoming, submittedBy: u.employeeId, deviceId: u.deviceId } as never } });
    await this.prisma.auditLog.create({ data: { actorId: u.id, deviceId: u.deviceId, entity: 'SyncConflict', entityId: c.id, action: 'CREATE', diff: { entity, entityId } } });
    return c;
  }

  @Get('conflicts') @RequirePermission('shift_report:approve')
  conflicts() { return this.prisma.syncConflict.findMany({ where: { resolvedAt: null }, orderBy: { createdAt: 'desc' } }); }

  @Post('conflicts/:id/resolve') @RequirePermission('shift_report:approve')
  async resolve(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    await this.prisma.syncConflict.update({ where: { id }, data: { resolvedBy: u.id, resolvedAt: new Date() } });
    await this.prisma.auditLog.create({ data: { actorId: u.id, deviceId: u.deviceId, entity: 'SyncConflict', entityId: id, action: 'RESOLVE' } });
    return { ok: true };
  }
}
