import { z } from 'zod';

/**
 * Finance Manager module (client spec §6) and Plant Hire Supervisor entries (§11), on one shared model:
 * a Deployment is a machine on hire to a client (the spec's "machine–client mapping" / "plant_deployments"),
 * DaysWorked records billable utilisation, and Payments record money received.
 */
export const PaymentModes = ['CASH', 'CREDIT'] as const;
export const DeploymentStatuses = ['ACTIVE', 'STANDBY', 'MOBILISING', 'DEMOBILISED'] as const;
export const ReviewStatuses = ['PENDING_REVIEW', 'APPROVED', 'REJECTED'] as const;
export const WorkShifts = ['DAY', 'NIGHT', 'FULL_DAY'] as const;
export const PaymentMethods = ['BANK_TRANSFER', 'CHEQUE', 'CASH', 'MOBILE_MONEY'] as const;
export type PaymentMode = (typeof PaymentModes)[number];
export type ReviewStatus = (typeof ReviewStatuses)[number];

export const PaymentMethodLabel: Record<(typeof PaymentMethods)[number], string> = { BANK_TRANSFER: 'Bank transfer', CHEQUE: 'Cheque', CASH: 'Cash', MOBILE_MONEY: 'Mobile money' };
export const WorkShiftLabel: Record<(typeof WorkShifts)[number], string> = { DAY: 'Day', NIGHT: 'Night', FULL_DAY: 'Full day' };
export const DeploymentStatusLabel: Record<(typeof DeploymentStatuses)[number], string> = { ACTIVE: 'Active', STANDBY: 'Standby', MOBILISING: 'Mobilising', DEMOBILISED: 'Demobilised' };
export const ReviewStatusLabel: Record<ReviewStatus, string> = { PENDING_REVIEW: 'Pending review', APPROVED: 'Approved', REJECTED: 'Rejected' };

/** Admin-configurable finance settings: which currencies can be used and the company details on follow-up messages. */
export const FinanceSettingsSchema = z.object({
  currencies: z.array(z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Use 3-letter currency codes, e.g. ZMW')).min(1),
  defaultCurrency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  companyName: z.string().trim().min(1),
  companyPhone: z.string().trim().min(1),
  companyEmail: z.string().trim().email(),
  website: z.string().trim().optional(),
}).refine((s) => s.currencies.includes(s.defaultCurrency), { message: 'The default currency must be one of the currencies', path: ['defaultCurrency'] });
export type FinanceSettings = z.infer<typeof FinanceSettingsSchema>;
export const DEFAULT_FINANCE_SETTINGS: FinanceSettings = {
  currencies: ['ZMW', 'USD'], defaultCurrency: 'ZMW',
  companyName: 'SR Drilling and Mining Zambia Ltd', companyPhone: '+260 975 236 381', companyEmail: 'srdrillingzambia@gmail.com', website: 'srdmining.com',
};

const currency = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/);
const day = z.coerce.date();

export const ClientSchema = z.object({
  name: z.string().trim().min(1).max(120),
  contactName: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().email().optional().or(z.literal('').transform(() => undefined)),
});
export type ClientInput = z.infer<typeof ClientSchema>;

/** Machine & client (spec §6.1 mapping, §11.3 tab 1). A new client name creates the client. */
export const DeploymentSchema = z
  .object({
    assetId: z.string().uuid(),
    clientName: z.string().trim().min(1).max(120),
    site: z.string().trim().min(1).max(120),
    contractRef: z.string().trim().max(60).optional(),
    startDate: day,
    expectedEndDate: day.optional(),
    ratePerDay: z.number().positive(),
    currency,
    paymentMode: z.enum(PaymentModes).default('CASH'),
    creditTermDays: z.number().int().positive().optional(),
    status: z.enum(DeploymentStatuses).default('ACTIVE'),
    notes: z.string().max(2000).optional(),
  })
  .refine((d) => !d.expectedEndDate || d.expectedEndDate >= d.startDate, { message: 'End date must be on or after the start date', path: ['expectedEndDate'] })
  .refine((d) => d.paymentMode !== 'CREDIT' || !!d.creditTermDays, { message: 'Enter the credit term (days) for a credit deployment', path: ['creditTermDays'] });
export type DeploymentInput = z.infer<typeof DeploymentSchema>;

/** Days worked (spec §11.3 tab 2): one record per machine per shift per day. */
export const DaysWorkedSchema = z.object({
  deploymentId: z.string().uuid(),
  workDate: day,
  shift: z.enum(WorkShifts),
  hoursWorked: z.number().min(0).max(12),
  standbyHours: z.number().min(0).max(12).default(0),
  operatorEmployeeId: z.string().trim().toUpperCase().min(1).max(20),
  billable: z.boolean().default(true),
  productionNotes: z.string().max(2000).optional(),
});
export type DaysWorkedInput = z.infer<typeof DaysWorkedSchema>;

/** Payments (spec §6.3 tab 3, §11.3 tab 3). Paid-from + days covered apply to credit deployments (§6.2). */
export const PaymentSchema = z
  .object({
    clientId: z.string().uuid(),
    deploymentId: z.string().uuid().optional(),
    paymentDate: day,
    amount: z.number().positive(),
    currency,
    method: z.enum(PaymentMethods),
    reference: z.string().trim().max(80).optional(),
    paidFrom: day.optional(),
    daysCovered: z.number().int().positive().optional(),
    notes: z.string().max(2000).optional(),
  })
  .refine((p) => !(p.method === 'BANK_TRANSFER' || p.method === 'CHEQUE') || !!p.reference, { message: 'Enter the bank reference or cheque number', path: ['reference'] })
  .refine((p) => (p.paidFrom == null) === (p.daysCovered == null), { message: 'Enter both the paid-from date and the days covered', path: ['daysCovered'] });
export type PaymentInput = z.infer<typeof PaymentSchema>;

export const ReviewSchema = z
  .object({ decision: z.enum(['APPROVE', 'REJECT']), reason: z.string().trim().max(500).optional() })
  .refine((r) => r.decision !== 'REJECT' || (r.reason ?? '').length >= 3, { message: 'Give the reason for rejecting', path: ['reason'] });

// ── Credit countdown (spec §6.2) ──

export const CreditStatuses = ['EXPIRED', 'CRITICAL', 'FOLLOW_UP', 'DUE_SOON', 'OK'] as const;
export type CreditStatus = (typeof CreditStatuses)[number];
export const CreditStatusLabel: Record<CreditStatus | 'PAID' | 'CASH_DUE', string> = { EXPIRED: 'Expired', CRITICAL: 'Critical', FOLLOW_UP: 'Follow up', DUE_SOON: 'Due soon', OK: 'OK', PAID: 'Paid', CASH_DUE: 'Cash due' };
/** Badge colours from the spec's design tokens. */
export const CreditStatusColor: Record<CreditStatus | 'PAID' | 'CASH_DUE', string> = { EXPIRED: '#EF4444', CRITICAL: '#EF4444', FOLLOW_UP: '#F97316', DUE_SOON: '#F59E0B', OK: '#22C55E', PAID: '#22C55E', CASH_DUE: '#F97316' };
/** Most urgent first, for sorting follow-ups. */
export const URGENCY_ORDER: Record<string, number> = { EXPIRED: 0, CRITICAL: 1, FOLLOW_UP: 2, CASH_DUE: 3, DUE_SOON: 4, OK: 5, PAID: 6 };

export function creditStatus(daysRemaining: number): CreditStatus {
  if (daysRemaining <= 0) return 'EXPIRED';
  if (daysRemaining <= 3) return 'CRITICAL';
  if (daysRemaining <= 10) return 'FOLLOW_UP';
  if (daysRemaining <= 14) return 'DUE_SOON';
  return 'OK';
}

const DAY_MS = 864e5;
/** 10 Nov 2026 — never 11/10/2026, which reads as a different day in Zambia (dd/mm) than in the US (mm/dd). */
export const longDate = (d: Date | string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const utcDay = (d: Date | string) => { const x = new Date(d); return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()); };
/** Whole days from `a` to `b` (b − a), ignoring time of day. */
export const daysBetween = (a: Date | string, b: Date | string) => Math.round((utcDay(b) - utcDay(a)) / DAY_MS);
export const addDays = (d: Date | string, n: number) => new Date(utcDay(d) + n * DAY_MS);

/** Expiry = paid from + days covered (spec §6.2); the latest one when several payments cover a deployment. */
export function coverageExpiry(payments: { paidFrom?: Date | string | null; daysCovered?: number | null }[]): Date | null {
  let best: number | null = null;
  for (const p of payments) if (p.paidFrom && p.daysCovered) { const e = utcDay(p.paidFrom) + p.daysCovered * DAY_MS; if (best == null || e > best) best = e; }
  return best == null ? null : new Date(best);
}

/** The live preview on the Record Payment form: expiry, days remaining and status. */
export function previewCoverage(paidFrom: Date | string, daysCovered: number, today: Date | string = new Date()) {
  const expiry = addDays(paidFrom, daysCovered);
  const daysRemaining = daysBetween(today, expiry);
  return { expiry, daysRemaining, status: creditStatus(daysRemaining) };
}

/** Billable days worked: each date with at least one billable shift counts once (Day + Night on one date is one day). */
export function billableDays(entries: { workDate: Date | string; billable: boolean }[]): number {
  return new Set(entries.filter((e) => e.billable).map((e) => utcDay(e.workDate))).size;
}

export const money = (amount: number, currency: string) => `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Pre-filled follow-up message (spec §6.3 tab 4); the finance manager edits it before sending by WhatsApp or email. */
export function followUpMessage(a: { client: string; machine: string; site?: string; outstanding?: string | null; daysRemaining?: number | null; expiry?: Date | string | null }, s: Pick<FinanceSettings, 'companyName' | 'companyPhone' | 'companyEmail'>) {
  const when = a.daysRemaining == null ? '' : a.daysRemaining <= 0
    ? `The paid period for ${a.machine} ended ${a.expiry ? `on ${longDate(a.expiry)}` : ''} (${Math.abs(a.daysRemaining)} day(s) ago).`
    : `The paid period for ${a.machine} ends ${a.expiry ? `on ${longDate(a.expiry)}` : ''} — ${a.daysRemaining} day(s) remaining.`;
  return [
    `Dear ${a.client},`,
    '',
    `This is a reminder regarding machine ${a.machine}${a.site ? ` at ${a.site}` : ''}.`,
    when,
    a.outstanding ? `Outstanding amount: ${a.outstanding}.` : '',
    'Kindly arrange payment at your earliest convenience to avoid interruption of service.',
    '',
    `For any queries please contact ${s.companyName} on ${s.companyPhone} or ${s.companyEmail}.`,
    '',
    'Thank you.',
  ].filter((l, i, all) => l !== '' || (all[i - 1] ?? '') !== '').join('\n').trim();
}
