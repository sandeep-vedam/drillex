import { ForbiddenException, Injectable, ConflictException } from '@nestjs/common';
import { DailyReadingInput, fuelConsumed, readingAlerts } from '@drillex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../auth/decorators';

const ALERT_LABEL: Record<string, string> = { WARNING_LIGHTS: 'Warning lights active', LEAKS: 'Leak observed', UNUSUAL_NOISES: 'Unusual noise / vibration', MAINTENANCE_REVIEW: 'Condition rated poor — maintenance review' };

@Injectable()
export class DailyReadingsService {
  constructor(private prisma: PrismaService, private notify: NotificationsService) {}

  private assetScope(u: AuthUser) {
    return u.scope === 'self' ? { operators: { some: { userId: u.id, validTo: null } } } : u.scope === 'site' ? { siteId: u.siteId ?? undefined } : {};
  }

  async list(u: AuthUser, q: { assetId?: string; from?: string; to?: string; flagged?: string }) {
    return this.prisma.dailyReading.findMany({
      where: {
        asset: this.assetScope(u), deletedAt: null,
        ...(q.assetId ? { assetId: q.assetId } : {}),
        ...(q.from || q.to ? { date: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } } : {}),
        ...(q.flagged === '1' ? { OR: [{ warningLights: true }, { leaks: true }, { unusualNoises: true }, { conditionRating: { lte: 2 } }] } : {}),
      },
      include: { asset: { select: { assetNumber: true, name: true, siteId: true } }, user: { select: { employeeId: true, name: true } } },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 200,
    });
  }

  async get(u: AuthUser, id: string) {
    return this.prisma.dailyReading.findFirstOrThrow({ where: { id, asset: this.assetScope(u) }, include: { asset: true, user: { select: { employeeId: true, name: true } } } });
  }

  /** SRS §5: one reading per asset per day, only by an assigned operator; alerts per §5.3. */
  async create(u: AuthUser, input: DailyReadingInput) {
    const asset = await this.prisma.asset.findFirstOrThrow({ where: { id: input.assetId, deletedAt: null }, include: { operators: { where: { userId: u.id, validTo: null } } } });
    if (u.scope === 'self' && !asset.operators.length) throw new ForbiddenException('You are not an assigned operator of this machine');
    const date = new Date(input.date); date.setUTCHours(0, 0, 0, 0);
    const dup = await this.prisma.dailyReading.findUnique({ where: { assetId_date: { assetId: asset.id, date } } });
    if (dup) throw new ConflictException(`A reading for ${asset.assetNumber} on ${date.toISOString().slice(0, 10)} already exists`);

    const alerts = readingAlerts(input);
    const { id, date: _d, signatureAttachmentId, ...rest } = input;
    const reading = await this.prisma.$transaction(async (tx) => {
      const r = await tx.dailyReading.create({ data: { ...(id ? { id } : {}), ...rest, date, userId: u.id, fuelConsumed: fuelConsumed(input.fuelStart, input.fuelEnd), signatureId: signatureAttachmentId ?? null, tyrePressures: input.tyrePressures as never } });
      if (alerts.length) {
        await tx.alert.createMany({ data: alerts.map((a) => ({ assetId: asset.id, source: `DAILY_READING:${r.id}`, severity: a === 'MAINTENANCE_REVIEW' ? 'HIGH' : 'MEDIUM', message: ALERT_LABEL[a] })) });
      }
      await tx.auditLog.create({ data: { actorId: u.id, deviceId: u.deviceId, entity: 'DailyReading', entityId: r.id, action: 'CREATE', diff: { alerts } as never } });
      return r;
    });
    if (alerts.length) {
      await this.notify.notifyRoles(asset.siteId, ['SUPERVISOR', 'TECHNICIAN'], {
        type: 'machine_alert', title: `${asset.assetNumber} · ${alerts.map((a) => ALERT_LABEL[a]).join(', ')}`,
        body: `Reported by ${u.employeeId} in today's daily reading.`, payload: { assetId: asset.id, readingId: reading.id, alerts },
      });
    }
    return { ...reading, alerts };
  }
}
