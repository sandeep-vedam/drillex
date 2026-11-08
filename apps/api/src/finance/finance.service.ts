import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { can, daysBetween, followUpMessage, money, type DaysWorkedInput, type DeploymentInput, type PaymentInput } from '@drillex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RolesService } from '../roles/roles.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../auth/decorators';
import { getFinanceSettings } from '../settings/settings.util';
import { byUrgency, deploymentInclude, formatPerCurrency, monthlyFinancial, perCurrency, summarise } from './finance.calc';

type Access = { full: boolean; write: boolean; review: boolean; psv: boolean; plantOnly: boolean };
type Kind = 'deployment' | 'daysWorked' | 'payment';
const KIND_LABEL: Record<Kind, string> = { deployment: 'machine–client deployment', daysWorked: 'days worked entry', payment: 'payment' };
const ENTITY: Record<Kind, string> = { deployment: 'Deployment', daysWorked: 'DaysWorked', payment: 'Payment' };
const startOfToday = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d; };
const asDate = (d: Date) => { const x = new Date(d); x.setUTCHours(0, 0, 0, 0); return x; };

/**
 * Finance Manager module (client spec §6) and Plant Hire Supervisor entries (§11).
 *
 * Who may do what comes from the role matrix: `finance:read/write/review` for finance staff, managers and admins;
 * `plant_hire:write` for the Plant Hire Supervisor, whose view is limited to plant machines (never drilling rigs) and
 * whose entries wait for review. Finance staff entries are approved on save. Approved entries are locked except to
 * finance staff; a rejected entry may be corrected and resubmitted once; a saved payment is never edited by the PSV.
 */
@Injectable()
export class FinanceService {
  constructor(private prisma: PrismaService, private roles: RolesService, private notify: NotificationsService) {}

  async access(u: AuthUser): Promise<Access> {
    const m = await this.roles.getMatrix();
    const full = !!can(m, u.role, 'finance:read');
    const psv = !!can(m, u.role, 'plant_hire:write');
    return { full, write: !!can(m, u.role, 'finance:write'), review: !!can(m, u.role, 'finance:review'), psv, plantOnly: !full && psv };
  }
  private plantFilter(a: Access): Prisma.DeploymentWhereInput { return a.plantOnly ? { asset: { category: { not: 'DRILLING' } } } : {}; }
  private async canEnter(u: AuthUser) {
    const a = await this.access(u);
    if (!a.write && !a.psv) throw new ForbiddenException('You cannot enter financial data');
    return a;
  }
  /** Finance staff entries are approved on save; plant hire supervisor entries wait for review. */
  private reviewFields(a: Access, u: AuthUser) {
    return a.write ? { reviewStatus: 'APPROVED' as const, reviewedById: u.id, reviewedAt: new Date() } : { reviewStatus: 'PENDING_REVIEW' as const };
  }
  private async assertCurrency(c: string) {
    const s = await getFinanceSettings(this.prisma);
    if (!s.currencies.includes(c)) throw new BadRequestException(`${c} is not one of the currencies in use (${s.currencies.join(', ')})`);
  }
  private async notifyReviewers(u: AuthUser, kind: Kind, what: string, payload: object) {
    await this.notify.notifyRoles(null, ['FINANCE', 'ADMIN'], { type: 'finance_review', title: `New ${KIND_LABEL[kind]} to review`, body: `${u.employeeId}: ${what}`, payload });
  }
  /** createdById / reviewedById → employee ID and name, for display. */
  private async withPeople<T extends { createdById: string; reviewedById: string | null }>(rows: T[]) {
    const ids = [...new Set(rows.flatMap((r) => [r.createdById, r.reviewedById]).filter(Boolean) as string[])];
    const people = new Map((await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, employeeId: true, name: true } })).map((p) => [p.id, p]));
    return rows.map((r) => ({ ...r, createdBy: people.get(r.createdById) ?? null, reviewedBy: r.reviewedById ? people.get(r.reviewedById) ?? null : null }));
  }

  /** Edit rules shared by deployments and days worked (payments: finance staff only). */
  private editable(a: Access, u: AuthUser, row: { createdById: string; reviewStatus: string; resubmitted: boolean }, kind: Kind) {
    if (a.write) return { resubmit: false };
    if (kind === 'payment') throw new ForbiddenException('A saved payment cannot be changed. Ask the Finance Manager to correct it.');
    if (!a.psv || row.createdById !== u.id) throw new ForbiddenException('You can only correct your own entries');
    if (row.reviewStatus === 'PENDING_REVIEW') throw new ForbiddenException('This entry is waiting for review and cannot be changed');
    if (row.reviewStatus === 'APPROVED') throw new ForbiddenException('This entry has been approved and is locked');
    if (row.resubmitted) throw new ForbiddenException('This entry has already been corrected once. Ask the Finance Manager to fix it.');
    return { resubmit: true };
  }

  // ── Clients ──

  listClients(q: { q?: string }) {
    return this.prisma.client.findMany({ where: q.q ? { name: { contains: q.q, mode: 'insensitive' } } : {}, orderBy: { name: 'asc' }, take: 200 });
  }
  /** Finds a client by name ignoring case, or creates it (free text if new; spec §11.3). */
  private async clientByName(tx: Prisma.TransactionClient, name: string) {
    return (await tx.client.findFirst({ where: { name: { equals: name.trim(), mode: 'insensitive' } } })) ?? tx.client.create({ data: { name: name.trim() } });
  }
  async createClient(u: AuthUser, b: { name: string; contactName?: string; phone?: string; email?: string }) {
    await this.canEnter(u);
    if (await this.prisma.client.findFirst({ where: { name: { equals: b.name, mode: 'insensitive' } } })) throw new ConflictException(`${b.name} already exists`);
    const c = await this.prisma.client.create({ data: b });
    await this.prisma.auditLog.create({ data: { actorId: u.id, deviceId: u.deviceId, entity: 'Client', entityId: c.id, action: 'CREATE', diff: b } });
    return c;
  }
  async updateClient(u: AuthUser, id: string, b: Partial<{ name: string; contactName: string; phone: string; email: string }>) {
    if (!(await this.access(u)).write) throw new ForbiddenException('Only finance staff can edit client details');
    const c = await this.prisma.client.update({ where: { id }, data: b });
    await this.prisma.auditLog.create({ data: { actorId: u.id, deviceId: u.deviceId, entity: 'Client', entityId: id, action: 'UPDATE', diff: b } });
    return c;
  }

  // ── Machines (spec §11.6 GET /plant/machines) ──

  async machines(u: AuthUser) {
    const a = await this.access(u);
    const assets = await this.prisma.asset.findMany({
      where: { deletedAt: null, status: { not: 'DECOMMISSIONED' }, ...(a.plantOnly ? { category: { not: 'DRILLING' } } : {}) },
      select: { id: true, assetNumber: true, name: true, category: true, status: true }, orderBy: { assetNumber: 'asc' },
    });
    const current = await this.prisma.deployment.findMany({ where: { assetId: { in: assets.map((x) => x.id) }, deletedAt: null, reviewStatus: { not: 'REJECTED' }, status: { not: 'DEMOBILISED' } }, include: { client: { select: { name: true } } } });
    return assets.map((x) => ({ ...x, deployment: current.find((d) => d.assetId === x.id) ?? null }));
  }

  // ── Deployments ──

  async listDeployments(u: AuthUser, q: { status?: string; clientId?: string; assetId?: string; review?: string; active?: string }) {
    const a = await this.access(u);
    const rows = await this.prisma.deployment.findMany({
      where: {
        deletedAt: null, ...this.plantFilter(a),
        ...(q.status ? { status: q.status as never } : {}), ...(q.clientId ? { clientId: q.clientId } : {}), ...(q.assetId ? { assetId: q.assetId } : {}),
        ...(q.review ? { reviewStatus: q.review as never } : {}), ...(q.active === '1' ? { status: { not: 'DEMOBILISED' as const }, reviewStatus: { not: 'REJECTED' as const } } : {}),
      },
      include: deploymentInclude, orderBy: [{ startDate: 'desc' }],
    });
    return this.withPeople((await summarise(this.prisma, rows)).sort(byUrgency));
  }

  async getDeployment(u: AuthUser, id: string) {
    const a = await this.access(u);
    const row = await this.prisma.deployment.findFirst({ where: { id, deletedAt: null, ...this.plantFilter(a) }, include: deploymentInclude });
    if (!row) throw new NotFoundException('Deployment not found');
    const [sum] = await summarise(this.prisma, [row]);
    const [payments, days] = await Promise.all([
      this.prisma.payment.findMany({ where: { deploymentId: id }, orderBy: { paymentDate: 'desc' } }),
      this.prisma.daysWorked.findMany({ where: { deploymentId: id }, orderBy: [{ workDate: 'desc' }, { shift: 'asc' }] }),
    ]);
    const [withPeople] = await this.withPeople([sum]);
    return { ...withPeople, payments: await this.withPeople(payments), days: await this.withPeople(days) };
  }

  private async checkDeployment(a: Access, input: DeploymentInput, ignoreId?: string) {
    const asset = await this.prisma.asset.findFirst({ where: { id: input.assetId, deletedAt: null } });
    if (!asset) throw new NotFoundException('Machine not found');
    if (asset.status === 'DECOMMISSIONED') throw new BadRequestException(`${asset.assetNumber} is retired`);
    if (a.plantOnly && asset.category === 'DRILLING') throw new ForbiddenException('Drilling rigs are managed by finance, not plant hire');
    await this.assertCurrency(input.currency);
    if (input.status !== 'DEMOBILISED') {
      const clash = await this.prisma.deployment.findFirst({ where: { assetId: asset.id, deletedAt: null, reviewStatus: { not: 'REJECTED' }, status: { not: 'DEMOBILISED' }, ...(ignoreId ? { id: { not: ignoreId } } : {}) }, include: { client: true } });
      if (clash) throw new ConflictException(`${asset.assetNumber} is already on hire to ${clash.client.name} (since ${clash.startDate.toISOString().slice(0, 10)}). Demobilise that deployment first.`);
    }
    return asset;
  }
  private deploymentData(input: DeploymentInput) {
    const { clientName: _c, ...rest } = input;
    return { ...rest, startDate: asDate(rest.startDate), expectedEndDate: rest.expectedEndDate ? asDate(rest.expectedEndDate) : null, creditTermDays: rest.paymentMode === 'CREDIT' ? rest.creditTermDays ?? null : null };
  }

  async createDeployment(u: AuthUser, input: DeploymentInput) {
    const a = await this.canEnter(u);
    const asset = await this.checkDeployment(a, input);
    const d = await this.prisma.$transaction(async (tx) => {
      const client = await this.clientByName(tx, input.clientName);
      const row = await tx.deployment.create({ data: { ...this.deploymentData(input), clientId: client.id, createdById: u.id, ...this.reviewFields(a, u) }, include: deploymentInclude });
      await tx.auditLog.create({ data: { actorId: u.id, deviceId: u.deviceId, entity: 'Deployment', entityId: row.id, action: 'CREATE', diff: input as never } });
      return row;
    });
    if (!a.write) await this.notifyReviewers(u, 'deployment', `${asset.assetNumber} to ${d.client.name} from ${d.startDate.toISOString().slice(0, 10)}`, { deploymentId: d.id });
    return d;
  }

  async updateDeployment(u: AuthUser, id: string, input: DeploymentInput) {
    const a = await this.canEnter(u);
    const row = await this.prisma.deployment.findFirstOrThrow({ where: { id, deletedAt: null, ...this.plantFilter(a) } });
    const { resubmit } = this.editable(a, u, row, 'deployment');
    const asset = await this.checkDeployment(a, input, id);
    const d = await this.prisma.$transaction(async (tx) => {
      const client = await this.clientByName(tx, input.clientName);
      const upd = await tx.deployment.update({ where: { id }, data: { ...this.deploymentData(input), clientId: client.id, ...(resubmit ? { reviewStatus: 'PENDING_REVIEW', resubmitted: true, reviewedById: null, reviewedAt: null } : {}) }, include: deploymentInclude });
      await tx.auditLog.create({ data: { actorId: u.id, deviceId: u.deviceId, entity: 'Deployment', entityId: id, action: resubmit ? 'RESUBMIT' : 'UPDATE', diff: { before: row, after: input } as never } });
      return upd;
    });
    if (resubmit) await this.notifyReviewers(u, 'deployment', `corrected ${asset.assetNumber} to ${d.client.name}`, { deploymentId: id });
    return d;
  }

  // ── Days worked ──

  async listDays(u: AuthUser, q: { deploymentId?: string; from?: string; to?: string; review?: string }) {
    const a = await this.access(u);
    const rows = await this.prisma.daysWorked.findMany({
      where: {
        deployment: { deletedAt: null, ...this.plantFilter(a) }, ...(q.deploymentId ? { deploymentId: q.deploymentId } : {}), ...(q.review ? { reviewStatus: q.review as never } : {}),
        ...(q.from || q.to ? { workDate: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } } : {}),
      },
      include: { deployment: { include: deploymentInclude } }, orderBy: [{ workDate: 'desc' }, { createdAt: 'desc' }], take: 500,
    });
    return this.withPeople(rows);
  }

  private async checkDays(a: Access, input: DaysWorkedInput) {
    const dep = await this.prisma.deployment.findFirst({ where: { id: input.deploymentId, deletedAt: null, ...this.plantFilter(a) }, include: deploymentInclude });
    if (!dep) throw new NotFoundException('Deployment not found');
    if (dep.reviewStatus === 'REJECTED') throw new BadRequestException('That deployment was rejected; correct it first');
    const day = asDate(input.workDate);
    if (day > startOfToday()) throw new BadRequestException('Days worked cannot be in the future');
    if (day < dep.startDate) throw new BadRequestException(`That date is before the deployment started (${dep.startDate.toISOString().slice(0, 10)})`);
    return { dep, day };
  }

  async createDays(u: AuthUser, input: DaysWorkedInput) {
    const a = await this.canEnter(u);
    const { dep, day } = await this.checkDays(a, input);
    try {
      const row = await this.prisma.daysWorked.create({ data: { ...input, workDate: day, createdById: u.id, ...this.reviewFields(a, u) } });
      await this.prisma.auditLog.create({ data: { actorId: u.id, deviceId: u.deviceId, entity: 'DaysWorked', entityId: row.id, action: 'CREATE', diff: input as never } });
      if (!a.write) await this.notifyReviewers(u, 'daysWorked', `${dep.asset.assetNumber} · ${day.toISOString().slice(0, 10)} · ${input.shift.toLowerCase().replace('_', ' ')} · ${input.hoursWorked} h`, { daysWorkedId: row.id });
      return row;
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') throw new ConflictException(`${dep.asset.assetNumber} already has a ${input.shift.toLowerCase().replace('_', ' ')} shift recorded on ${day.toISOString().slice(0, 10)}`);
      throw e;
    }
  }

  async updateDays(u: AuthUser, id: string, input: DaysWorkedInput) {
    const a = await this.canEnter(u);
    const row = await this.prisma.daysWorked.findFirstOrThrow({ where: { id, deployment: this.plantFilter(a) } });
    const { resubmit } = this.editable(a, u, row, 'daysWorked');
    const { dep, day } = await this.checkDays(a, input);
    const upd = await this.prisma.daysWorked.update({ where: { id }, data: { ...input, workDate: day, ...(resubmit ? { reviewStatus: 'PENDING_REVIEW', resubmitted: true, reviewedById: null, reviewedAt: null } : {}) } });
    await this.prisma.auditLog.create({ data: { actorId: u.id, deviceId: u.deviceId, entity: 'DaysWorked', entityId: id, action: resubmit ? 'RESUBMIT' : 'UPDATE', diff: { before: row, after: input } as never } });
    if (resubmit) await this.notifyReviewers(u, 'daysWorked', `corrected ${dep.asset.assetNumber} · ${day.toISOString().slice(0, 10)}`, { daysWorkedId: id });
    return upd;
  }

  // ── Payments ──

  async listPayments(u: AuthUser, q: { clientId?: string; deploymentId?: string; from?: string; to?: string; review?: string }) {
    const a = await this.access(u);
    const rows = await this.prisma.payment.findMany({
      where: {
        ...(a.plantOnly ? { OR: [{ deployment: { asset: { category: { not: 'DRILLING' } } } }, { createdById: u.id }] } : {}),
        ...(q.clientId ? { clientId: q.clientId } : {}), ...(q.deploymentId ? { deploymentId: q.deploymentId } : {}), ...(q.review ? { reviewStatus: q.review as never } : {}),
        ...(q.from || q.to ? { paymentDate: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } } : {}),
      },
      include: { client: true, deployment: { include: deploymentInclude } }, orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }], take: 500,
    });
    return this.withPeople(rows);
  }

  private async checkPayment(a: Access, input: PaymentInput) {
    const client = await this.prisma.client.findUnique({ where: { id: input.clientId } });
    if (!client) throw new NotFoundException('Client not found');
    await this.assertCurrency(input.currency);
    if (input.deploymentId) {
      const dep = await this.prisma.deployment.findFirst({ where: { id: input.deploymentId, deletedAt: null, ...this.plantFilter(a) } });
      if (!dep) throw new NotFoundException('Deployment not found');
      if (dep.clientId !== client.id) throw new BadRequestException('That deployment belongs to a different client');
    }
    return client;
  }
  private paymentData(input: PaymentInput) {
    return { ...input, paymentDate: asDate(input.paymentDate), paidFrom: input.paidFrom ? asDate(input.paidFrom) : null, daysCovered: input.daysCovered ?? null, deploymentId: input.deploymentId ?? null };
  }

  async createPayment(u: AuthUser, input: PaymentInput) {
    const a = await this.canEnter(u);
    const client = await this.checkPayment(a, input);
    const row = await this.prisma.payment.create({ data: { ...this.paymentData(input), createdById: u.id, ...this.reviewFields(a, u) }, include: { client: true, deployment: { include: deploymentInclude } } });
    await this.prisma.auditLog.create({ data: { actorId: u.id, deviceId: u.deviceId, entity: 'Payment', entityId: row.id, action: 'CREATE', diff: input as never } });
    if (!a.write) await this.notifyReviewers(u, 'payment', `${money(input.amount, input.currency)} from ${client.name}`, { paymentId: row.id });
    return row;
  }

  async updatePayment(u: AuthUser, id: string, input: PaymentInput) {
    const a = await this.canEnter(u);
    const row = await this.prisma.payment.findUniqueOrThrow({ where: { id } });
    this.editable(a, u, row, 'payment');
    await this.checkPayment(a, input);
    const upd = await this.prisma.payment.update({ where: { id }, data: this.paymentData(input), include: { client: true, deployment: { include: deploymentInclude } } });
    await this.prisma.auditLog.create({ data: { actorId: u.id, deviceId: u.deviceId, entity: 'Payment', entityId: id, action: 'UPDATE', diff: { before: row, after: input } as never } });
    return upd;
  }

  // ── Review workflow (spec §11.4) ──

  async review(u: AuthUser, kind: Kind, id: string, decision: 'APPROVE' | 'REJECT', reason?: string) {
    if (!(await this.access(u)).review) throw new ForbiddenException('Only the Finance Manager or Admin can review entries');
    const delegate = (this.prisma[kind] as unknown) as { findUniqueOrThrow: (a: object) => Promise<{ createdById: string; reviewStatus: string }>; update: (a: object) => Promise<unknown> };
    const row = await delegate.findUniqueOrThrow({ where: { id } });
    if (row.reviewStatus !== 'PENDING_REVIEW') throw new ConflictException('This entry is not waiting for review');
    const data = decision === 'APPROVE'
      ? { reviewStatus: 'APPROVED', reviewedById: u.id, reviewedAt: new Date(), rejectionReason: null }
      : { reviewStatus: 'REJECTED', reviewedById: u.id, reviewedAt: new Date(), rejectionReason: reason };
    const out = await delegate.update({ where: { id }, data });
    // The rejection reason stays in the audit trail even after the entry is corrected and approved.
    await this.prisma.auditLog.create({ data: { actorId: u.id, deviceId: u.deviceId, entity: ENTITY[kind], entityId: id, action: decision === 'APPROVE' ? 'APPROVE' : 'REJECT', diff: reason ? { reason } : undefined } });
    await this.notify.notifyUsers([row.createdById], decision === 'APPROVE'
      ? { type: 'finance_approved', title: `Your ${KIND_LABEL[kind]} was approved`, body: `Approved by ${u.employeeId}.`, payload: { kind, id } }
      : { type: 'finance_rejected', title: `Your ${KIND_LABEL[kind]} was rejected`, body: `${u.employeeId}: ${reason}. You can correct it once and resubmit.`, payload: { kind, id } });
    return out;
  }

  async reviewQueue(u: AuthUser) {
    const a = await this.access(u);
    if (!a.review && !a.psv) throw new ForbiddenException();
    // The PSV sees their own entries' state; reviewers see everything waiting.
    const mine = a.review ? {} : { createdById: u.id };
    const [deployments, days, payments] = await Promise.all([
      this.prisma.deployment.findMany({ where: { deletedAt: null, reviewStatus: a.review ? 'PENDING_REVIEW' : { in: ['PENDING_REVIEW', 'REJECTED'] }, ...mine }, include: deploymentInclude, orderBy: { createdAt: 'asc' } }),
      this.prisma.daysWorked.findMany({ where: { reviewStatus: a.review ? 'PENDING_REVIEW' : { in: ['PENDING_REVIEW', 'REJECTED'] }, ...mine }, include: { deployment: { include: deploymentInclude } }, orderBy: { createdAt: 'asc' } }),
      this.prisma.payment.findMany({ where: { reviewStatus: a.review ? 'PENDING_REVIEW' : { in: ['PENDING_REVIEW', 'REJECTED'] }, ...mine }, include: { client: true, deployment: { include: deploymentInclude } }, orderBy: { createdAt: 'asc' } }),
    ]);
    return { deployments: await this.withPeople(deployments), days: await this.withPeople(days), payments: await this.withPeople(payments) };
  }

  // ── Dashboard, alerts, summary, report ──

  private async allSummaries(a: Access, period = {}) {
    const rows = await this.prisma.deployment.findMany({ where: { deletedAt: null, reviewStatus: { not: 'REJECTED' }, ...this.plantFilter(a) }, include: deploymentInclude, orderBy: { startDate: 'desc' } });
    return summarise(this.prisma, rows, period);
  }

  /** KPI cards + urgency list (spec §6.3 tab 1). Amounts are per currency; they are never converted or added across currencies. */
  async dashboard(u: AuthUser) {
    const a = await this.access(u);
    const all = await this.allSummaries(a);
    const active = all.filter((d) => d.status !== 'DEMOBILISED');
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const paid = await this.prisma.payment.findMany({ where: { reviewStatus: 'APPROVED', paymentDate: { gte: monthStart }, ...(a.plantOnly ? { OR: [{ deployment: { asset: { category: { not: 'DRILLING' } } } }, { createdById: u.id }] } : {}) } });
    const pending = (await Promise.all([
      this.prisma.deployment.count({ where: { reviewStatus: 'PENDING_REVIEW', deletedAt: null, ...this.plantFilter(a) } }),
      this.prisma.daysWorked.count({ where: { reviewStatus: 'PENDING_REVIEW', deployment: this.plantFilter(a) } }),
      this.prisma.payment.count({ where: { reviewStatus: 'PENDING_REVIEW' } }),
    ])).reduce((x, y) => x + y, 0);
    return {
      collectedThisMonth: perCurrency(paid, (p) => p.currency, (p) => Number(p.amount)),
      outstanding: perCurrency(all.filter((d) => d.outstanding > 0), (d) => d.currency, (d) => d.outstanding),
      expiringWithin7Days: active.filter((d) => d.paymentMode === 'CREDIT' && d.daysRemaining != null && d.daysRemaining <= 7).length,
      activeMachines: new Set(active.filter((d) => d.status === 'ACTIVE').map((d) => d.assetId)).size,
      pendingReview: pending,
      deployments: await this.withPeople(active.sort(byUrgency)),
    };
  }

  /** Follow-up alerts (spec §6.3 tab 4): most critical first, each with a pre-filled message. */
  async alerts(u: AuthUser) {
    const a = await this.access(u);
    const s = await getFinanceSettings(this.prisma);
    const all = await this.allSummaries(a);
    return all
      .filter((d) => (d.status !== 'DEMOBILISED' && !['OK', 'PAID'].includes(d.badge)) || (d.status === 'DEMOBILISED' && d.outstanding > 0))
      .sort(byUrgency)
      .map((d) => {
        const outstanding = d.outstanding > 0 ? money(d.outstanding, d.currency) : null;
        return {
          deploymentId: d.id, machine: d.asset.assetNumber, machineName: d.asset.name, client: d.client, site: d.site, paymentMode: d.paymentMode, badge: d.badge,
          daysRemaining: d.daysRemaining, expiry: d.expiry, outstanding, currency: d.currency,
          message: followUpMessage({ client: d.client.name, machine: d.asset.assetNumber, site: d.site, outstanding, daysRemaining: d.daysRemaining, expiry: d.expiry }, s),
        };
      });
  }

  /** Per-client totals (spec §11.3 tab 4), optionally limited to a client, a machine and a date range. */
  async summary(u: AuthUser, q: { clientId?: string; assetId?: string; from?: string; to?: string }) {
    const a = await this.access(u);
    const period = { from: q.from ? new Date(q.from) : undefined, to: q.to ? new Date(q.to) : undefined };
    const rows = await this.prisma.deployment.findMany({ where: { deletedAt: null, reviewStatus: { not: 'REJECTED' }, ...this.plantFilter(a), ...(q.clientId ? { clientId: q.clientId } : {}), ...(q.assetId ? { assetId: q.assetId } : {}) }, include: deploymentInclude });
    const sums = await summarise(this.prisma, rows, period);
    // Payments not tied to a deployment still count towards the client's balance (when not filtering by machine).
    const loose = q.assetId ? [] : await this.prisma.payment.findMany({ where: { deploymentId: null, reviewStatus: 'APPROVED', ...(q.clientId ? { clientId: q.clientId } : {}), ...(a.plantOnly ? { createdById: u.id } : {}),
      ...(period.from || period.to ? { paymentDate: { ...(period.from ? { gte: period.from } : {}), ...(period.to ? { lte: period.to } : {}) } } : {}) } });
    const clients = new Map<string, { client: { id: string; name: string }; daysWorked: number; billed: Record<string, number>; received: Record<string, number>; outstanding: Record<string, number>; lastPaymentDate: Date | null; activeMachines: number }>();
    const slot = (c: { id: string; name: string }) => { if (!clients.has(c.id)) clients.set(c.id, { client: { id: c.id, name: c.name }, daysWorked: 0, billed: {}, received: {}, outstanding: {}, lastPaymentDate: null, activeMachines: 0 }); return clients.get(c.id)!; };
    const add = (m: Record<string, number>, c: string, v: number) => { m[c] = Math.round(((m[c] ?? 0) + v) * 100) / 100; };
    for (const d of sums) {
      const s = slot(d.client);
      s.daysWorked += d.daysWorked; add(s.billed, d.currency, d.billed); add(s.received, d.currency, d.received);
      if (d.status === 'ACTIVE') s.activeMachines += 1;
      if (d.lastPaymentDate && (!s.lastPaymentDate || d.lastPaymentDate > s.lastPaymentDate)) s.lastPaymentDate = d.lastPaymentDate;
    }
    const clientRows = await this.prisma.client.findMany({ where: { id: { in: loose.map((p) => p.clientId) } } });
    for (const p of loose) {
      const s = slot(clientRows.find((c) => c.id === p.clientId)!);
      add(s.received, p.currency, Number(p.amount));
      if (!s.lastPaymentDate || p.paymentDate > s.lastPaymentDate) s.lastPaymentDate = p.paymentDate;
    }
    for (const s of clients.values()) for (const c of new Set([...Object.keys(s.billed), ...Object.keys(s.received)])) s.outstanding[c] = Math.round(((s.billed[c] ?? 0) - (s.received[c] ?? 0)) * 100) / 100;
    return [...clients.values()].sort((x, y) => x.client.name.localeCompare(y.client.name));
  }

  async summaryCsv(u: AuthUser, q: { clientId?: string; assetId?: string; from?: string; to?: string }) {
    const rows = await this.summary(u, q);
    const cell = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const head = ['Client', 'Days worked', 'Total billed', 'Payments received', 'Outstanding', 'Last payment', 'Active machines'];
    return [head.join(','), ...rows.map((r) => [r.client.name, r.daysWorked, formatPerCurrency(r.billed), formatPerCurrency(r.received), formatPerCurrency(r.outstanding), r.lastPaymentDate?.toISOString().slice(0, 10), r.activeMachines].map(cell).join(','))].join('\n');
  }

  /** Monthly table per machine (spec §6.3 tab 5) for on-screen use; the PDF / Excel export goes through the reports module. */
  async monthly(u: AuthUser, month: string) {
    const a = await this.access(u);
    if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequestException('Month must be YYYY-MM');
    const [y, m] = month.split('-').map(Number);
    const from = new Date(Date.UTC(y, m - 1, 1)); const to = new Date(Date.UTC(y, m, 0));
    const rows = await monthlyFinancial(this.prisma, from, to, a.plantOnly);
    return {
      month, from, to,
      rows: rows.map((r) => ({ deploymentId: r.id, machine: r.asset.assetNumber, machineName: r.asset.name, client: r.client.name, site: r.site, daysWorked: r.daysWorked, ratePerDay: Number(r.ratePerDay), currency: r.currency, billed: r.billed, received: r.received, balance: r.outstanding })),
      totals: { billed: perCurrency(rows, (r) => r.currency, (r) => r.billed), received: perCurrency(rows, (r) => r.currency, (r) => r.received), balance: perCurrency(rows, (r) => r.currency, (r) => r.outstanding) },
    };
  }

  /** The current client of a machine, for the operator's Client Tracker (spec §4A tab 5): no amounts, only dates. */
  async current(u: AuthUser, assetId: string) {
    const asset = await this.prisma.asset.findFirst({ where: { id: assetId, deletedAt: null } });
    if (!asset) throw new NotFoundException('Machine not found');
    if (u.scope === 'self' && !(await this.prisma.assetOperator.findFirst({ where: { assetId, userId: u.id, validTo: null } }))) throw new ForbiddenException('Not your machine');
    if (u.scope === 'site' && asset.siteId !== u.siteId) throw new ForbiddenException('Not on your site');
    const d = await this.prisma.deployment.findFirst({ where: { assetId, deletedAt: null, reviewStatus: { not: 'REJECTED' }, status: { not: 'DEMOBILISED' } }, include: { client: { select: { name: true } } }, orderBy: { startDate: 'desc' } });
    if (!d) return null;
    const today = new Date();
    const daysOnSite = Math.max(0, daysBetween(d.startDate, today));
    const total = d.expectedEndDate ? Math.max(1, daysBetween(d.startDate, d.expectedEndDate)) : null;
    return {
      client: d.client.name, site: d.site, status: d.status, startDate: d.startDate, expectedEndDate: d.expectedEndDate,
      daysOnSite, daysRemaining: d.expectedEndDate ? daysBetween(today, d.expectedEndDate) : null,
      progress: total ? Math.min(1, Math.max(0, daysOnSite / total)) : null,
    };
  }
}
