import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { DEFAULT_FINANCE_SETTINGS, type CreditStatusColor, type DeploymentStatuses, type FinanceSettings, type PaymentMethods, type WorkShifts } from '@drillex/shared';
import { api } from './api';
import { cached } from '../sync/cache';
import { enqueue, type OpKind } from '../sync/outbox';

/**
 * Finance Manager (client spec §6) and Plant Hire Supervisor (§11) on the phone. Same API and rules as the web
 * pages: finance staff entries are approved on save, plant hire supervisor entries wait for finance review.
 */
export type Person = { employeeId: string; name: string } | null;
export type Review = { reviewStatus: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED'; rejectionReason: string | null; resubmitted: boolean; createdById: string; createdBy: Person; reviewedBy: Person; reviewedAt: string | null };
export type FAsset = { id: string; assetNumber: string; name: string; category: string };
export type Client = { id: string; name: string; contactName?: string | null; phone?: string | null; email?: string | null };
export type Badge = keyof typeof CreditStatusColor;
export type Deployment = Review & {
  id: string; asset: FAsset; assetId: string; client: Client; clientId: string; site: string; contractRef: string | null; startDate: string; expectedEndDate: string | null;
  ratePerDay: string; currency: string; paymentMode: 'CASH' | 'CREDIT'; creditTermDays: number | null; status: (typeof DeploymentStatuses)[number]; notes: string | null;
  daysWorked: number; billed: number; received: number; outstanding: number; expiry: string | null; daysRemaining: number | null; badge: Badge; lastPaymentDate: string | null;
};
export type Payment = Review & { id: string; client: Client; clientId: string; deployment: (Deployment & { asset: FAsset }) | null; deploymentId: string | null; paymentDate: string; amount: string; currency: string; method: (typeof PaymentMethods)[number]; reference: string | null; paidFrom: string | null; daysCovered: number | null; notes: string | null };
export type DaysWorked = Review & { id: string; deploymentId: string; deployment: Deployment; workDate: string; shift: (typeof WorkShifts)[number]; hoursWorked: string; standbyHours: string; operatorEmployeeId: string; billable: boolean; productionNotes: string | null };
export type Access = { full: boolean; write: boolean; review: boolean; psv: boolean; plantOnly: boolean };
export type Machine = FAsset & { status: string; deployment: { id: string; client: { name: string } } | null };

export const amount = (v: number | string, c: string) => `${c} ${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** Amounts in different currencies are listed side by side, never added together. */
export const perCurrency = (m: Record<string, number>) => Object.entries(m).map(([c, v]) => amount(v, c)).join('\n') || '—';
/** 10 Nov 2026 — unambiguous, unlike 11/10/2026. */
export const fmtDate = (d?: string | Date | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');
export const isoDay = (d: Date = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const iso = (d?: string | null) => (d ? d.slice(0, 10) : '');
export const isPlant = (category: string) => category !== 'DRILLING';

export async function loadAccess() { return (await cached('finance.access', () => api<Access>('/finance/access'))).data; }

export function useFinanceSettings() {
  const [s, setS] = useState<FinanceSettings>(DEFAULT_FINANCE_SETTINGS);
  useEffect(() => { cached('finance.settings', () => api<FinanceSettings>('/settings/finance')).then((r) => setS(r.data)).catch(() => {}); }, []);
  return s;
}

/** A failure to reach the server at all, as opposed to the server saying no. */
const unreachable = (e: unknown) => e instanceof TypeError || /network request failed|failed to fetch|network/i.test((e as Error)?.message ?? '');

/**
 * New entries go straight to the server when there is signal, so a problem ("machine already on hire") shows on the form
 * while it can still be fixed. With no signal they are queued in the outbox and sent later — the server applies each
 * queued entry at most once.
 */
export async function saveOrQueue(kind: Extract<OpKind, 'finance_deployment' | 'finance_days' | 'finance_payment'>, path: string, body: object, label: string): Promise<'saved' | 'queued'> {
  const net = await NetInfo.fetch();
  if (!net.isConnected) { await enqueue(kind, body, label); return 'queued'; }
  try { await api(path, { method: 'POST', body: JSON.stringify(body) }); return 'saved'; }
  catch (e) { if (!unreachable(e)) throw e; await enqueue(kind, body, label); return 'queued'; }
}
