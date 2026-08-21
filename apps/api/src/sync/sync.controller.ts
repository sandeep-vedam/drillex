import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { DailyReadingSchema, ShiftReportSchema } from '@drillex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { DailyReadingsService } from '../daily-readings/daily-readings.service';
import { ShiftReportsService } from '../shift-reports/shift-reports.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { AttachmentSchema } from '../attachments/attachments.controller';
import { AuthUser, CurrentUser, RequirePermission } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';

const OpSchema = z.object({ opId: z.string().min(1), kind: z.enum(['attachment', 'daily_reading', 'shift_report']), payload: z.unknown(), queuedAt: z.string().optional() });
const PushSchema = z.object({ ops: z.array(OpSchema).max(200) });
type Result = { opId: string; status: 'applied' | 'duplicate' | 'conflict' | 'rejected'; error?: string; id?: string };

/**
 * Offline outbox sync (SRS §9.2). Each op carries a client-generated UUID, so replays are idempotent:
 * same id → 'duplicate' (already applied); same business key but different id → 'conflict' (kept for supervisor review);
 * validation/RBAC failure → 'rejected' with the reason so the device can show it.
 */
@Controller('sync')
export class SyncController {
  constructor(private prisma: PrismaService, private readings: DailyReadingsService, private shifts: ShiftReportsService, private attachments: AttachmentsService) {}

  @Post('push')
  async push(@CurrentUser() u: AuthUser, @Body(new ZodPipe(PushSchema)) b: z.infer<typeof PushSchema>) {
    const results: Result[] = [];
    for (const op of b.ops) {
      try {
        if (op.kind === 'attachment') {
          const a = AttachmentSchema.parse(op.payload); const r = await this.attachments.upload(u, a);
          results.push({ opId: op.opId, status: r.duplicate ? 'duplicate' : 'applied', id: r.id }); continue;
        }
        if (op.kind === 'daily_reading') {
          const d = DailyReadingSchema.parse(op.payload);
          if (d.id && (await this.prisma.dailyReading.findUnique({ where: { id: d.id } }))) { results.push({ opId: op.opId, status: 'duplicate', id: d.id }); continue; }
          try { const r = await this.readings.create(u, d); results.push({ opId: op.opId, status: 'applied', id: r.id }); }
          catch (e) { if ((e as { status?: number }).status === 409) { await this.conflict(u, 'DailyReading', d.id, d); results.push({ opId: op.opId, status: 'conflict', error: (e as Error).message }); } else throw e; }
          continue;
        }
        if (op.kind === 'shift_report') {
          const d = ShiftReportSchema.parse(op.payload);
          if (d.id && (await this.prisma.shiftReport.findUnique({ where: { id: d.id } }))) { results.push({ opId: op.opId, status: 'duplicate', id: d.id }); continue; }
          try { const r = await this.shifts.create(u, d); results.push({ opId: op.opId, status: 'applied', id: r.id }); }
          catch (e) { if ((e as { status?: number }).status === 409) { await this.conflict(u, 'ShiftReport', d.id, d); results.push({ opId: op.opId, status: 'conflict', error: (e as Error).message }); } else throw e; }
        }
      } catch (e) {
        const err = e as { message?: string; response?: { message?: unknown } };
        results.push({ opId: op.opId, status: 'rejected', error: typeof err.response?.message === 'string' ? err.response.message : err.message ?? 'Rejected' });
      }
    }
    return { results, serverTime: new Date().toISOString() };
  }

  private conflict(u: AuthUser, entity: string, entityId: string | undefined, incoming: unknown) {
    return this.prisma.syncConflict.create({ data: { entity, entityId: entityId ?? 'unknown', versions: { incoming, submittedBy: u.employeeId, deviceId: u.deviceId } as never } });
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
