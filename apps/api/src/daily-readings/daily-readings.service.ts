import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CRITICAL_ANSWERS, criticalChecks, DailyReadingInput, fuelConsumed, machineUsage, readingAlerts } from '@drillex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageService } from '../storage/storage.service';
import { RolesService } from '../roles/roles.service';
import { AuthUser } from '../auth/decorators';
import { getOperationsSettings } from '../settings/settings.util';
import { resolveSubmitter } from '../common/submitter';
import { plantOnlyAssetWhere } from '../common/plant-only';

const ALERT_LABEL: Record<string, string> = { WARNING_LIGHTS: 'Warning lights active', LEAKS: 'Leak observed', UNUSUAL_NOISES: 'Unusual noise / vibration', CRITICAL_CHECK: 'Critical check', MAINTENANCE_REVIEW: 'Condition rated poor — maintenance review' };
const FORM_NAME: Record<string, string> = { RIG: 'rig condition check', PLANT: 'machine readings', LEGACY: 'daily reading' };

/** A rig / plant answer of Critical, Damaged, Faulty or Flat — the same rule readingAlerts applies, as a query. */
const CRITICAL_WHERE: Prisma.DailyReadingWhereInput[] = [
  ...(['engineOil', 'hydraulicOil', 'coolant', 'gearOil', 'flushPump', 'fuelLevel'] as const).map((k) => ({ [k]: 'CRITICAL' as const })),
  ...(['rodCondition', 'bitCondition', 'brakeFluid', 'trackCondition', 'tyreCondition', 'attachmentCondition', 'lights', 'brakes'] as const).map((k) => ({ [k]: { in: [...CRITICAL_ANSWERS] } })),
];

@Injectable()
export class DailyReadingsService {
  constructor(private prisma: PrismaService, private notify: NotificationsService, private storage: StorageService, private roles: RolesService) {}

  /** Columns for each form; the shared schema has already validated the answers. Computed values are set here, never taken from the device. */
  private formData(input: DailyReadingInput) {
    const { id: _i, date: _d, signatureAttachmentId: _s, operatorId: _o, supervisorReason: _r, ...rest } = input;
    if (rest.formType === 'LEGACY') return { ...rest, fuelConsumed: fuelConsumed(rest.fuelStart, rest.fuelEnd), tyrePressures: rest.tyrePressures as never };
    if (rest.formType === 'PLANT') return { ...rest, usage: machineUsage(rest.startReading, rest.endReading), hourMeter: rest.endReading };
    return rest;
  }

  /** Assigned machines / own site / everything — and never drilling rigs for a plant hire supervisor. */
  private async assetScope(u: AuthUser): Promise<Prisma.AssetWhereInput> {
    const base = u.scope === 'self' ? { operators: { some: { userId: u.id, validTo: null } } } : u.scope === 'site' ? { siteId: u.siteId ?? undefined } : {};
    return { ...base, ...(await plantOnlyAssetWhere(this.roles, u)) };
  }

  async list(u: AuthUser, q: { assetId?: string; from?: string; to?: string; flagged?: string }) {
    return this.prisma.dailyReading.findMany({
      where: {
        asset: await this.assetScope(u), deletedAt: null,
        ...(q.assetId ? { assetId: q.assetId } : {}),
        ...(q.from || q.to ? { date: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } } : {}),
        ...(q.flagged === '1' ? { OR: [{ warningLights: true }, { leaks: true }, { unusualNoises: true }, ...CRITICAL_WHERE, { conditionRating: { lte: (await getOperationsSettings(this.prisma)).readingAlertThreshold } }] } : {}),
      },
      include: { asset: { select: { assetNumber: true, name: true, siteId: true, category: true } }, user: { select: { employeeId: true, name: true } }, enteredBy: { select: { employeeId: true, name: true } } },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 200,
    });
  }

  async get(u: AuthUser, id: string) {
    const r = await this.prisma.dailyReading.findFirst({ where: { id, asset: await this.assetScope(u) }, include: { asset: true, user: { select: { employeeId: true, name: true } }, enteredBy: { select: { employeeId: true, name: true } } } });
    if (!r) throw new NotFoundException('Reading not found');
    const atts = await this.prisma.attachment.findMany({ where: { ownerType: 'DailyReading', ownerId: id }, orderBy: { createdAt: 'asc' } });
    const attachments = await Promise.all(atts.map(async (a) => ({ id: a.id, kind: a.kind, url: await this.storage.urlFor(a.storageKey) })));
    return { ...r, attachments };
  }

  /**
   * SRS §5: one reading per asset per day, by an assigned operator or a supervisor entering for them (client spec
   * §9.3); alerts per §5.3, plus any rig / plant check answered Critical, Damaged, Faulty or Flat.
   */
  async create(u: AuthUser, input: DailyReadingInput) {
    const asset = await this.prisma.asset.findFirstOrThrow({ where: { id: input.assetId, deletedAt: null } });
    const who = await resolveSubmitter(this.prisma, this.roles, u, asset, input, 'daily_reading:create');
    const date = new Date(input.date); date.setUTCHours(0, 0, 0, 0);
    const dup = await this.prisma.dailyReading.findUnique({ where: { assetId_date: { assetId: asset.id, date } } });
    if (dup) throw new ConflictException(`A reading for ${asset.assetNumber} on ${date.toISOString().slice(0, 10)} already exists`);

    const alerts = readingAlerts(input, (await getOperationsSettings(this.prisma)).readingAlertThreshold);
    const critical = criticalChecks(input);
    const label = (a: string) => (a === 'CRITICAL_CHECK' ? `${ALERT_LABEL[a]}: ${critical.join(', ')}` : ALERT_LABEL[a]);
    const reading = await this.prisma.$transaction(async (tx) => {
      const r = await tx.dailyReading.create({ data: { ...(input.id ? { id: input.id } : {}), ...this.formData(input), date, userId: who.userId, enteredById: who.enteredById, supervisorReason: who.supervisorReason, signatureId: input.signatureAttachmentId ?? null } as Prisma.DailyReadingUncheckedCreateInput });
      if (alerts.length) {
        await tx.alert.createMany({ data: alerts.map((a) => ({ assetId: asset.id, source: `DAILY_READING:${r.id}`, severity: a === 'MAINTENANCE_REVIEW' || a === 'CRITICAL_CHECK' ? 'HIGH' : 'MEDIUM', message: label(a) })) });
      }
      await tx.auditLog.create({ data: { actorId: u.id, deviceId: u.deviceId, entity: 'DailyReading', entityId: r.id, action: 'CREATE', diff: { alerts, ...(who.enteredById ? { onBehalfOf: who.operatorEmployeeId, reason: who.supervisorReason } : {}) } as never } });
      return r;
    });
    const form = FORM_NAME[input.formType];
    if (alerts.length) {
      await this.notify.notifyRoles(asset.siteId, ['SUPERVISOR', 'TECHNICIAN'], {
        type: 'machine_alert', title: `${asset.assetNumber} · ${alerts.map(label).join(', ')}`,
        body: `Reported by ${who.enteredById ? `${u.employeeId} for ${who.operatorEmployeeId}` : u.employeeId} in today's ${form}.`, payload: { assetId: asset.id, readingId: reading.id, alerts },
      });
    }
    if (who.enteredById) await this.prisma.notification.create({ data: { userId: who.userId, type: 'entered_on_behalf', title: `${asset.assetNumber} ${form} entered for you`, body: `${u.employeeId} entered today's ${form}: ${who.supervisorReason}` } });
    return { ...reading, alerts };
  }

}
