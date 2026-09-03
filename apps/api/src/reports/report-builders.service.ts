import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReportDoc, ReportType, REPORT_META } from './report-types';
import { technicianIds } from '../common/technician-ids';

const n = (v: unknown) => (v == null ? 0 : Number(v));
const r1 = (v: number) => Math.round(v * 10) / 10;
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');
const d = (x: Date) => x.toISOString().slice(0, 10);

/** SRS §8.2 — seven report builders over a common document shape; rendered to PDF/XLSX by ReportRenderer. */
@Injectable()
export class ReportBuildersService {
  constructor(private prisma: PrismaService) {}

  async build(type: ReportType, from: Date, to: Date, siteId?: string | null): Promise<ReportDoc> {
    const base = { type, title: REPORT_META[type].title, subtitle: `${d(from)} to ${d(to)}${siteId ? ' · site-scoped' : ' · all sites'}`, periodStart: from, periodEnd: to, generatedAt: new Date() };
    const range = { gte: from, lte: to };
    const assetWhere = siteId ? { siteId } : {};
    switch (type) {
      case 'DRILLING_PRODUCTION': {
        const rows = await this.prisma.shiftReport.findMany({ where: { date: range, deletedAt: null, asset: assetWhere }, include: { asset: true, site: true, chemicals: { include: { chemical: true } } } });
        const byAsset = group(rows, (r) => r.asset.assetNumber, (g) => [g[0].asset.assetNumber, g[0].asset.name, r1(sum(g, (x) => n(x.totalMeters))), sum(g, (x) => x.holesCompleted), r1(sum(g, (x) => n(x.downtimeHours))), g.length, r1(avg(g, (x) => n(x.penetrationRate)))]);
        const bySite = group(rows, (r) => r.site.name, (g) => [g[0].site.name, r1(sum(g, (x) => n(x.totalMeters))), sum(g, (x) => x.holesCompleted), g.length]);
        const byShift = group(rows, (r) => r.shift, (g) => [g[0].shift, r1(sum(g, (x) => n(x.totalMeters))), sum(g, (x) => x.holesCompleted), r1(sum(g, (x) => n(x.downtimeHours)))]);
        const down = group(rows.filter((r) => n(r.downtimeHours) > 0), (r) => r.downtimeReason ?? 'Unspecified', (g) => [g[0].downtimeReason ?? 'Unspecified', r1(sum(g, (x) => n(x.downtimeHours))), g.length]);
        const chem = group(rows.flatMap((r) => r.chemicals), (c) => `${c.chemical.name}|${c.unit}`, (g) => [g[0].chemical.name, r1(sum(g, (x) => n(x.quantity))), g[0].unit.toLowerCase()]);
        const totalM = sum(rows, (x) => n(x.totalMeters));
        return { ...base, kpis: [{ label: 'Total meters drilled', value: `${r1(totalM).toLocaleString()} m` }, { label: 'Holes completed', value: sum(rows, (x) => x.holesCompleted) }, { label: 'Shift reports', value: rows.length, hint: `${rows.filter((x) => x.status === 'APPROVED').length} approved` }, { label: 'Downtime', value: `${r1(sum(rows, (x) => n(x.downtimeHours)))} h` }],
          sections: [{ title: 'Per machine', columns: ['Asset', 'Name', 'Meters', 'Holes', 'Downtime h', 'Shifts', 'Avg penetration m/h'], rows: byAsset }, { title: 'Per site', columns: ['Site', 'Meters', 'Holes', 'Shifts'], rows: bySite }, { title: 'Per shift', columns: ['Shift', 'Meters', 'Holes', 'Downtime h'], rows: byShift }, { title: 'Downtime analysis', columns: ['Reason', 'Hours', 'Occurrences'], rows: down }, { title: 'Chemical consumption', columns: ['Chemical', 'Quantity', 'Unit'], rows: chem }] };
      }
      case 'MACHINE_UTILISATION': {
        const readings = await this.prisma.dailyReading.findMany({ where: { date: range, deletedAt: null, asset: assetWhere }, include: { asset: true, user: true }, orderBy: { date: 'asc' } });
        const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 864e5) + 1);
        const byAsset = group(readings, (r) => r.asset.assetNumber, (g) => { const hrs = n(g[g.length - 1].hourMeter) - n(g[0].hourMeter); const fuel = sum(g, (x) => n(x.fuelConsumed)); return [g[0].asset.assetNumber, g[0].asset.name, r1(hrs), g.length, pct(g.length, days), r1(fuel), hrs > 0 ? r1(fuel / hrs) : '—', r1(avg(g, (x) => x.conditionRating))]; });
        const byOp = group(readings, (r) => r.user.employeeId, (g) => [g[0].user.employeeId, g[0].user.name, g.length, r1(avg(g, (x) => x.conditionRating)), g.filter((x) => x.warningLights || x.leaks || x.unusualNoises).length]);
        const trend = group(readings, (r) => d(r.date), (g) => [d(g[0].date), r1(sum(g, (x) => n(x.fuelConsumed))), g.length]);
        return { ...base, kpis: [{ label: 'Machines reporting', value: new Set(readings.map((r) => r.assetId)).size }, { label: 'Readings submitted', value: readings.length }, { label: 'Fuel consumed', value: r1(sum(readings, (x) => n(x.fuelConsumed))) }, { label: 'Avg availability', value: pct(readings.length, days * Math.max(1, new Set(readings.map((r) => r.assetId)).size)) }],
          sections: [{ title: 'Hours, availability & fuel per asset', columns: ['Asset', 'Name', 'Hours operated', 'Days reported', 'Availability', 'Fuel', 'Fuel / hour', 'Avg condition'], rows: byAsset }, { title: 'Operator performance summary', columns: ['Employee', 'Name', 'Readings', 'Avg condition', 'Issues flagged'], rows: byOp }, { title: 'Fuel consumption trend', columns: ['Date', 'Fuel', 'Readings'], rows: trend }] };
      }
      case 'MAINTENANCE_SUMMARY': {
        const sched = await this.prisma.maintenanceSchedule.findMany({ where: { deletedAt: null, asset: assetWhere }, include: { asset: true } });
        const done = await this.prisma.auditLog.findMany({ where: { entity: 'MaintenanceSchedule', action: 'COMPLETE', createdAt: range } });
        const doneIds = new Set(done.map((x) => x.entityId));
        const jobs = await this.prisma.jobCard.findMany({ where: { date: range, deletedAt: null, asset: assetWhere }, include: { asset: true } });
        const hoursByAsset = group(jobs, (j) => j.asset.assetNumber, (g) => [g[0].asset.assetNumber, g[0].asset.name, r1(sum(g, (x) => n(x.labourHours))), g.length]);
        return { ...base, kpis: [{ label: 'Services completed', value: done.length }, { label: 'Overdue now', value: sched.filter((s) => s.status === 'OVERDUE').length }, { label: 'Due now', value: sched.filter((s) => s.status === 'DUE_NOW').length }, { label: 'Maintenance labour', value: `${r1(sum(jobs, (x) => n(x.labourHours)))} h` }],
          sections: [{ title: 'Services completed in period', columns: ['Asset', 'Service', 'Last done', 'Last hours'], rows: sched.filter((s) => doneIds.has(s.id)).map((s) => [s.asset.assetNumber, s.description, s.lastServiceAt ? d(s.lastServiceAt) : '—', n(s.lastServiceHours)]) }, { title: 'Overdue items', columns: ['Asset', 'Service', 'Due date', 'Due hours'], rows: sched.filter((s) => s.status === 'OVERDUE').map((s) => [s.asset.assetNumber, s.description, s.nextDueAt ? d(s.nextDueAt) : '—', s.nextDueHours ? n(s.nextDueHours) : '—']) }, { title: 'Upcoming schedule', columns: ['Asset', 'Service', 'Due date', 'Due hours', 'Status'], rows: sched.filter((s) => s.status !== 'COMPLETED' && s.status !== 'OVERDUE').sort((a, b) => (a.nextDueAt?.getTime() ?? 9e15) - (b.nextDueAt?.getTime() ?? 9e15)).map((s) => [s.asset.assetNumber, s.description, s.nextDueAt ? d(s.nextDueAt) : '—', s.nextDueHours ? n(s.nextDueHours) : '—', s.status]) }, { title: 'Maintenance hours per asset (job cards)', columns: ['Asset', 'Name', 'Labour h', 'Job cards'], rows: hoursByAsset }] };
      }
      case 'JOB_CARD_HISTORY': {
        const jobs = await this.prisma.jobCard.findMany({ where: { date: range, deletedAt: null, asset: assetWhere }, include: { asset: true, parts: { include: { part: true } } }, orderBy: { date: 'asc' } });
        const cost = (j: (typeof jobs)[number]) => sum(j.parts, (p) => p.quantity * n(p.part.unitCost));
        const byAsset = group(jobs, (j) => j.asset.assetNumber, (g) => [g[0].asset.assetNumber, g[0].asset.name, g.length, g.filter((x) => x.jobType === 'BREAKDOWN_REPAIR').length, r1(sum(g, (x) => n(x.labourHours))), r1(sum(g, cost))]);
        const faults = group(jobs.filter((j) => j.jobType === 'BREAKDOWN_REPAIR'), (j) => (j.reportedFault ?? 'Unspecified').split(/[;,.]/)[0].trim().toLowerCase(), (g) => [g[0].reportedFault?.split(/[;,.]/)[0].trim() ?? 'Unspecified', g.length, [...new Set(g.map((x) => x.asset.assetNumber))].join(', ')]);
        return { ...base, kpis: [{ label: 'Job cards', value: jobs.length }, { label: 'Breakdowns', value: jobs.filter((x) => x.jobType === 'BREAKDOWN_REPAIR').length }, { label: 'Labour hours', value: r1(sum(jobs, (x) => n(x.labourHours))) }, { label: 'Parts cost', value: `$${r1(sum(jobs, cost)).toLocaleString()}` }],
          sections: [{ title: 'All work performed', columns: ['Job #', 'Date', 'Asset', 'Type', 'Work performed', 'Labour h', 'Parts $', 'Status'], rows: jobs.map((j) => [j.jobNo, d(j.date), j.asset.assetNumber, j.jobType, j.workPerformed.slice(0, 80), n(j.labourHours), r1(cost(j)), j.approvedAt ? 'APPROVED' : j.status]) }, { title: 'Per machine', columns: ['Asset', 'Name', 'Jobs', 'Breakdowns', 'Labour h', 'Parts $'], rows: byAsset }, { title: 'Parts used', columns: ['Part no.', 'Part', 'Qty', 'Cost $'], rows: group(jobs.flatMap((j) => j.parts), (p) => p.part.partNo, (g) => [g[0].part.partNo, g[0].part.name, sum(g, (x) => x.quantity), r1(sum(g, (x) => x.quantity * n(x.part.unitCost)))]) }, { title: 'Fault frequency analysis', columns: ['Reported fault', 'Occurrences', 'Assets'], rows: faults.sort((a, b) => n(b[1]) - n(a[1])) }] };
      }
      case 'CHEMICAL_USAGE': {
        const rows = await this.prisma.shiftReportChemical.findMany({ where: { shiftReport: { date: range, deletedAt: null, asset: assetWhere } }, include: { chemical: true, shiftReport: { include: { asset: true } } } });
        const shifts = new Set(rows.map((r) => r.shiftReportId)).size;
        const byType = group(rows, (r) => r.chemical.name, (g) => { const qty = sum(g, (x) => n(x.quantity)); const c = qty * n(g[0].chemical.unitCost); const b = n(g[0].chemical.monthlyBudget); return [g[0].chemical.name, r1(qty), g[0].unit.toLowerCase(), r1(c), b ? r1(b) : '—', b ? r1(c - b) : '—']; });
        const total = sum(rows, (x) => n(x.quantity) * n(x.chemical.unitCost));
        return { ...base, kpis: [{ label: 'Chemical lines', value: rows.length }, { label: 'Total cost', value: `$${r1(total).toLocaleString()}` }, { label: 'Cost per shift', value: shifts ? `$${r1(total / shifts)}` : '—' }, { label: 'Types used', value: new Set(rows.map((r) => r.chemicalId)).size }],
          sections: [{ title: 'By type with budget variance', columns: ['Chemical', 'Quantity', 'Unit', 'Cost $', 'Budget $', 'Variance $'], rows: byType, note: 'Variance = cost − budget; set unit cost & monthly budget on the chemical master list.' }, { title: 'By machine', columns: ['Asset', 'Chemical', 'Quantity', 'Unit'], rows: group(rows, (r) => `${r.shiftReport.asset.assetNumber}|${r.chemical.name}|${r.unit}`, (g) => [g[0].shiftReport.asset.assetNumber, g[0].chemical.name, r1(sum(g, (x) => n(x.quantity))), g[0].unit.toLowerCase()]) }] };
      }
      case 'ASSET_HEALTH': {
        const assets = await this.prisma.asset.findMany({ where: { deletedAt: null, ...assetWhere }, include: { dailyReadings: { where: { date: range }, orderBy: { date: 'desc' } }, alerts: { where: { createdAt: range } } }, orderBy: { assetNumber: 'asc' } });
        const attention = assets.filter((a) => a.status === 'UNDER_MAINTENANCE' || a.alerts.some((x) => !x.resolvedAt) || (a.dailyReadings[0]?.conditionRating ?? 5) <= 2);
        return { ...base, kpis: [{ label: 'Fleet', value: assets.length, hint: `${assets.filter((a) => a.status === 'ACTIVE').length} active` }, { label: 'Under maintenance', value: assets.filter((a) => a.status === 'UNDER_MAINTENANCE').length }, { label: 'Alerts in period', value: sum(assets, (a) => a.alerts.length) }, { label: 'Need attention', value: attention.length }],
          sections: [{ title: 'Fleet condition overview', columns: ['Asset', 'Name', 'Status', 'Readings', 'Latest condition', 'Avg condition', 'Alerts', 'Open alerts'], rows: assets.map((a) => [a.assetNumber, a.name, a.status, a.dailyReadings.length, a.dailyReadings[0]?.conditionRating ?? '—', a.dailyReadings.length ? r1(avg(a.dailyReadings, (x) => x.conditionRating)) : '—', a.alerts.length, a.alerts.filter((x) => !x.resolvedAt).length]) }, { title: 'Machines requiring attention', columns: ['Asset', 'Name', 'Why'], rows: attention.map((a) => [a.assetNumber, a.name, [a.status === 'UNDER_MAINTENANCE' && 'under maintenance', a.alerts.some((x) => !x.resolvedAt) && `${a.alerts.filter((x) => !x.resolvedAt).length} open alert(s)`, (a.dailyReadings[0]?.conditionRating ?? 5) <= 2 && 'latest condition poor'].filter(Boolean).join('; ')]) }, { title: 'Alert history', columns: ['Date', 'Asset', 'Severity', 'Message', 'Resolved'], rows: assets.flatMap((a) => a.alerts.map((x) => [d(x.createdAt), a.assetNumber, x.severity, x.message, x.resolvedAt ? 'yes' : 'no'])).sort((x, y) => String(y[0]).localeCompare(String(x[0]))) }] };
      }
      case 'EMPLOYEE_ACTIVITY': {
        const users = await this.prisma.user.findMany({ where: { status: 'ACTIVE' }, orderBy: { employeeId: 'asc' } });
        const [logins, readings, shifts, jobs, approvals] = await Promise.all([
          this.prisma.loginEvent.groupBy({ by: ['employeeId', 'success'], where: { createdAt: range }, _count: true }),
          this.prisma.dailyReading.groupBy({ by: ['userId'], where: { date: range }, _count: true }),
          this.prisma.shiftReport.groupBy({ by: ['userId'], where: { date: range }, _count: true }),
          this.prisma.jobCard.findMany({ where: { date: range }, select: { technicianIds: true } }),
          this.prisma.auditLog.groupBy({ by: ['actorId'], where: { action: { in: ['APPROVE'] }, createdAt: range }, _count: true }),
        ]);
        const cnt = (arr: { _count: number }[], pred: (x: never) => boolean) => (arr as never[]).filter(pred).reduce((s, x) => s + (x as { _count: number })._count, 0);
        const rows = users.map((u) => [u.employeeId, u.name, u.role, cnt(logins, (l: { employeeId: string; success: boolean }) => l.employeeId === u.employeeId && l.success), cnt(logins, (l: { employeeId: string; success: boolean }) => l.employeeId === u.employeeId && !l.success), cnt(readings, (r: { userId: string }) => r.userId === u.id), cnt(shifts, (r: { userId: string }) => r.userId === u.id), jobs.filter((j) => technicianIds(j.technicianIds).includes(u.id)).length, cnt(approvals, (a: { actorId: string | null }) => a.actorId === u.id)]);
        const ops = users.filter((u) => u.role === 'OPERATOR');
        const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 864e5) + 1);
        const incomplete = ops.map((u) => { const r = cnt(readings, (x: { userId: string }) => x.userId === u.id); return [u.employeeId, u.name, r, days, Math.max(0, days - r)]; }).filter((x) => n(x[4]) > 0);
        return { ...base, kpis: [{ label: 'Active employees', value: users.length }, { label: 'Logins', value: cnt(logins, (l: { success: boolean }) => l.success) }, { label: 'Failed logins', value: cnt(logins, (l: { success: boolean }) => !l.success) }, { label: 'Submissions', value: readings.reduce((s, x) => s + x._count, 0) + shifts.reduce((s, x) => s + x._count, 0) + jobs.length }],
          sections: [{ title: 'Per employee', columns: ['Employee', 'Name', 'Role', 'Logins', 'Failed', 'Readings', 'Shift reports', 'Job cards', 'Approvals'], rows }, { title: 'Shift coverage — incomplete daily readings', columns: ['Operator', 'Name', 'Readings', 'Days in period', 'Missing'], rows: incomplete, note: 'Assumes one reading per operator per calendar day.' }] };
      }
    }
  }
}
function sum<T>(a: T[], f: (x: T) => number) { return a.reduce((s, x) => s + f(x), 0); }
function avg<T>(a: T[], f: (x: T) => number) { return a.length ? sum(a, f) / a.length : 0; }
function group<T>(a: T[], key: (x: T) => string, map: (g: T[]) => (string | number | null)[]) { const m = new Map<string, T[]>(); for (const x of a) { const k = key(x); m.set(k, [...(m.get(k) ?? []), x]); } return [...m.values()].map(map); }
