import { Prisma } from '@prisma/client';
import { coverageExpiry, creditStatus, daysBetween, URGENCY_ORDER, type CreditStatus } from '@drillex/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Billing arithmetic for the finance module (client spec §6.2, §11.3), in one place so the screens, the follow-up
 * alerts and the monthly PDF/Excel report can never disagree.
 *
 * - Days worked: each date with a billable, non-rejected Days Worked entry counts once; for a drilling rig a date with a
 *   shift report also counts, so rigs need no separate utilisation entry. Dates run from the deployment start up to the
 *   next deployment of the same machine, so successive clients never share a day.
 * - Billed = days worked × daily rate, in the deployment's currency.
 * - Received = approved payments linked to the deployment, in that currency. Pending payments are counted separately.
 * - Credit: expiry = paid-from + days covered of the latest approved payment (deployment start when none); badge by days left.
 * - Cash: PAID when nothing is outstanding, else CASH_DUE.
 */
export type Badge = CreditStatus | 'PAID' | 'CASH_DUE';

const n = (v: Prisma.Decimal | number | null | undefined) => (v == null ? 0 : Number(v));
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export const deploymentInclude = {
  asset: { select: { id: true, assetNumber: true, name: true, category: true } },
  client: true,
} satisfies Prisma.DeploymentInclude;
type DeploymentRow = Prisma.DeploymentGetPayload<{ include: typeof deploymentInclude }>;

export type DeploymentSummary = DeploymentRow & {
  daysWorked: number; billed: number; received: number; outstanding: number; pendingPayments: number;
  expiry: Date | null; daysRemaining: number | null; badge: Badge; lastPaymentDate: Date | null;
};

/** Range limits for a period report: count only work and payments dated inside [from, to]. */
export type Period = { from?: Date; to?: Date };

export async function summarise(prisma: PrismaService, rows: DeploymentRow[], period: Period = {}, today = new Date()): Promise<DeploymentSummary[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const assetIds = [...new Set(rows.map((r) => r.assetId))];
  const inPeriod = (d: Date) => (!period.from || d >= period.from) && (!period.to || d <= period.to);

  const [work, payments, siblings, shifts] = await Promise.all([
    prisma.daysWorked.findMany({ where: { deploymentId: { in: ids }, reviewStatus: { not: 'REJECTED' }, billable: true }, select: { deploymentId: true, workDate: true } }),
    prisma.payment.findMany({ where: { deploymentId: { in: ids }, reviewStatus: { not: 'REJECTED' } } }),
    prisma.deployment.findMany({ where: { assetId: { in: assetIds }, deletedAt: null, reviewStatus: { not: 'REJECTED' } }, select: { id: true, assetId: true, startDate: true } }),
    prisma.shiftReport.findMany({ where: { assetId: { in: assetIds }, deletedAt: null, asset: { category: 'DRILLING' } }, select: { assetId: true, date: true } }),
  ]);

  return rows.map((d) => {
    // The day this deployment's run ends: the next deployment of the same machine (exclusive), or today.
    const next = siblings.filter((s) => s.assetId === d.assetId && s.id !== d.id && s.startDate > d.startDate).sort((a, b) => +a.startDate - +b.startDate)[0];
    const within = (x: Date) => x >= d.startDate && (!next || x < next.startDate) && x <= today && inPeriod(x);
    const dates = new Set<string>();
    for (const w of work) if (w.deploymentId === d.id && within(w.workDate)) dates.add(dayKey(w.workDate));
    if (d.asset.category === 'DRILLING') for (const s of shifts) if (s.assetId === d.assetId && within(s.date)) dates.add(dayKey(s.date));

    const mine = payments.filter((p) => p.deploymentId === d.id);
    const approved = mine.filter((p) => p.reviewStatus === 'APPROVED');
    const received = approved.filter((p) => p.currency === d.currency && inPeriod(p.paymentDate)).reduce((a, p) => a + n(p.amount), 0);
    const billed = dates.size * n(d.ratePerDay);
    const outstanding = Math.round((billed - received) * 100) / 100;

    let expiry: Date | null = null; let daysRemaining: number | null = null; let badge: Badge;
    if (d.paymentMode === 'CREDIT') {
      expiry = coverageExpiry(approved) ?? d.startDate;
      daysRemaining = daysBetween(today, expiry);
      badge = creditStatus(daysRemaining);
    } else badge = outstanding > 0 ? 'CASH_DUE' : 'PAID';

    const lastPaymentDate = approved.reduce<Date | null>((m, p) => (!m || p.paymentDate > m ? p.paymentDate : m), null);
    return { ...d, daysWorked: dates.size, billed, received, outstanding, pendingPayments: mine.filter((p) => p.reviewStatus === 'PENDING_REVIEW').length, expiry, daysRemaining, badge, lastPaymentDate };
  });
}

export const byUrgency = (a: { badge: Badge; daysRemaining: number | null }, b: { badge: Badge; daysRemaining: number | null }) =>
  URGENCY_ORDER[a.badge] - URGENCY_ORDER[b.badge] || (a.daysRemaining ?? 999) - (b.daysRemaining ?? 999);

/** Sums per currency, e.g. { ZMW: 1200, USD: 300 } — amounts in different currencies are never added together. */
export function perCurrency<T>(items: T[], currency: (t: T) => string, amount: (t: T) => number) {
  const out: Record<string, number> = {};
  for (const i of items) { const c = currency(i); out[c] = Math.round(((out[c] ?? 0) + amount(i)) * 100) / 100; }
  return out;
}
export const formatPerCurrency = (m: Record<string, number>) => Object.entries(m).map(([c, v]) => `${c} ${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`).join(' · ') || '—';

/** Monthly summary per machine (client spec §6.3 tab 5): days worked, rate, billed, received and balance for the month. */
export async function monthlyFinancial(prisma: PrismaService, from: Date, to: Date, plantOnly = false) {
  const rows = await prisma.deployment.findMany({
    where: { deletedAt: null, reviewStatus: { not: 'REJECTED' }, startDate: { lte: to }, ...(plantOnly ? { asset: { category: { not: 'DRILLING' } } } : {}) },
    include: deploymentInclude, orderBy: [{ asset: { assetNumber: 'asc' } }, { startDate: 'asc' }],
  });
  const sums = await summarise(prisma, rows, { from, to }, new Date(Math.min(Date.now(), to.getTime() + 864e5 - 1)));
  // A deployment that had no work and no money in the month is not part of that month's report.
  return sums.filter((s) => s.daysWorked > 0 || s.received > 0 || (s.startDate <= to && s.status !== 'DEMOBILISED'));
}
