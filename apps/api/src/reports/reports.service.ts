import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReportBuildersService } from './report-builders.service';
import { ReportRendererService } from './report-renderer.service';
import { REPORT_META, REPORT_TYPES, ReportType } from './report-types';
import { AuthUser } from '../auth/decorators';

@Injectable()
export class ReportsService {
  private log = new Logger('Reports');
  constructor(private prisma: PrismaService, private storage: StorageService, private notify: NotificationsService, private builders: ReportBuildersService, private renderer: ReportRendererService) {}

  types(u: AuthUser) { return REPORT_TYPES.filter((t) => REPORT_META[t].roles.includes(u.role)).map((t) => ({ type: t, title: REPORT_META[t].title })); }
  private assertRole(u: AuthUser, type: ReportType) { if (!REPORT_META[type]?.roles.includes(u.role)) throw new ForbiddenException('This report is not available to your role'); }

  /** Live preview (in-app view, custom date range). */
  async preview(u: AuthUser, type: ReportType, from: Date, to: Date) { this.assertRole(u, type); return this.builders.build(type, from, to, u.scope === 'site' ? u.siteId : null); }

  /** Generate, render both formats, store, archive (SRS §8.1/§8.3: archived ≥ 24 months). */
  async generate(u: AuthUser | null, type: ReportType, from: Date, to: Date, siteId: string | null = null) {
    if (u) this.assertRole(u, type);
    const doc = await this.builders.build(type, from, to, siteId);
    const [pdf, xlsx] = await Promise.all([this.renderer.pdf(doc), this.renderer.xlsx(doc)]);
    const stamp = `${type.toLowerCase()}_${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}_${Date.now()}`;
    const pdfKey = `reports/${stamp}.pdf`, xlsxKey = `reports/${stamp}.xlsx`;
    await this.storage.putBase64(pdfKey, pdf.toString('base64'), 'application/pdf');
    await this.storage.putBase64(xlsxKey, xlsx.toString('base64'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const row = await this.prisma.report.create({ data: { type, periodStart: from, periodEnd: to, pdfKey, xlsxKey, generatedBy: u?.employeeId ?? 'system' } });
    if (u) await this.prisma.auditLog.create({ data: { actorId: u.id, deviceId: u.deviceId, entity: 'Report', entityId: row.id, action: 'GENERATE', diff: { type, from, to } as never } });
    return { ...row, title: REPORT_META[type].title, pdfUrl: await this.storage.urlFor(pdfKey), xlsxUrl: await this.storage.urlFor(xlsxKey), doc };
  }

  async archive(u: AuthUser) {
    const rows = await this.prisma.report.findMany({ where: { type: { in: REPORT_TYPES.filter((t) => REPORT_META[t].roles.includes(u.role)) } }, orderBy: { generatedAt: 'desc' }, take: 200 });
    return Promise.all(rows.map(async (r) => ({ ...r, title: REPORT_META[r.type as ReportType]?.title ?? r.type, pdfUrl: r.pdfKey ? await this.storage.urlFor(r.pdfKey) : null, xlsxUrl: r.xlsxKey ? await this.storage.urlFor(r.xlsxKey) : null })));
  }

  /** Share via email (SRS §8.3). SMTP_* env configures transport; otherwise logged. */
  async email(u: AuthUser, id: string, to: string[], message?: string) {
    const r = await this.prisma.report.findUniqueOrThrow({ where: { id } }); this.assertRole(u, r.type as ReportType);
    const pdfUrl = r.pdfKey ? await this.storage.urlFor(r.pdfKey) : null; const xlsxUrl = r.xlsxKey ? await this.storage.urlFor(r.xlsxKey) : null;
    const subject = `[Drillex Ops] ${REPORT_META[r.type as ReportType].title} ${r.periodStart.toISOString().slice(0, 10)} → ${r.periodEnd.toISOString().slice(0, 10)}`;
    const text = `${message ?? ''}\n\nPDF: ${pdfUrl}\nExcel: ${xlsxUrl}\n\nShared by ${u.employeeId} via Drillex Ops.`;
    if (process.env.SMTP_HOST) {
      const t = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT ?? 587), secure: process.env.SMTP_SECURE === 'true', auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined });
      await t.sendMail({ from: process.env.SMTP_FROM ?? 'drillex-ops@example.com', to: to.join(','), subject, text });
    } else this.log.log(`(SMTP not configured) would email "${subject}" to ${to.join(', ')}`);
    await this.prisma.auditLog.create({ data: { actorId: u.id, deviceId: u.deviceId, entity: 'Report', entityId: id, action: 'EMAIL', diff: { to } as never } });
    return { ok: true, delivered: !!process.env.SMTP_HOST };
  }

  /** Month-end: 1st of each month 02:00 — compile all seven for the previous month, notify managers (SRS §8.1). */
  @Cron('0 2 1 * *')
  async monthEndCron() { await this.runMonthEnd(); }
  async runMonthEnd(ref = new Date()) {
    const from = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - 1, 1)); const to = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 0));
    const made: string[] = [];
    for (const type of REPORT_TYPES) { try { const r = await this.generate(null, type, from, to); made.push(r.title); } catch (e) { this.log.error(`Month-end ${type} failed: ${(e as Error).message}`); } }
    await this.notify.notifyRoles(null, ['MANAGER'], { type: 'report_ready', title: `Monthly reports ready — ${from.toLocaleString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`, body: made.join(', ') });
    return { period: [from, to], generated: made };
  }

  /** Retention: keep ≥ 24 months (SRS §8.3) — purge older archive rows quarterly. */
  @Cron('0 3 1 */3 *')
  async purgeOld() { const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 24); const r = await this.prisma.report.deleteMany({ where: { generatedAt: { lt: cutoff } } }); this.log.log(`Purged ${r.count} report(s) older than 24 months`); }
}
