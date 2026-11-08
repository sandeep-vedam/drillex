'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  CreditStatusColor, CreditStatusLabel, DEFAULT_FINANCE_SETTINGS, DeploymentStatuses, DeploymentStatusLabel, PaymentMethodLabel, PaymentMethods, previewCoverage,
  ReviewStatusLabel, WorkShiftLabel, WorkShifts, type FinanceSettings,
} from '@drillex/shared';
import { api } from '@/lib/api';
import { Drawer, ErrorText, Field, fmtDate, today } from './kit';

export type Person = { employeeId: string; name: string } | null;
export type Review = { reviewStatus: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED'; rejectionReason: string | null; resubmitted: boolean; createdById: string; createdBy: Person; reviewedBy: Person; reviewedAt: string | null };
export type Asset = { id: string; assetNumber: string; name: string; category: string };
export type Client = { id: string; name: string; contactName?: string | null; phone?: string | null; email?: string | null };
export type Deployment = Review & {
  id: string; asset: Asset; assetId: string; client: Client; clientId: string; site: string; contractRef: string | null; startDate: string; expectedEndDate: string | null;
  ratePerDay: string; currency: string; paymentMode: 'CASH' | 'CREDIT'; creditTermDays: number | null; status: (typeof DeploymentStatuses)[number]; notes: string | null;
  daysWorked: number; billed: number; received: number; outstanding: number; pendingPayments: number; expiry: string | null; daysRemaining: number | null; badge: keyof typeof CreditStatusColor; lastPaymentDate: string | null;
};
export type Payment = Review & { id: string; client: Client; clientId: string; deployment: (Deployment & { asset: Asset }) | null; deploymentId: string | null; paymentDate: string; amount: string; currency: string; method: (typeof PaymentMethods)[number]; reference: string | null; paidFrom: string | null; daysCovered: number | null; notes: string | null };
export type DaysWorked = Review & { id: string; deploymentId: string; deployment: Deployment; workDate: string; shift: (typeof WorkShifts)[number]; hoursWorked: string; standbyHours: string; operatorEmployeeId: string; billable: boolean; productionNotes: string | null };
export type Access = { full: boolean; write: boolean; review: boolean; psv: boolean; plantOnly: boolean };

export const amount = (v: number | string, c: string) => `${c} ${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const perCurrencyText = (m: Record<string, number>) => Object.entries(m).map(([c, v]) => amount(v, c)).join(' · ') || '—';

/** Urgency badge (spec §6.2 colours). */
export function Badge({ badge, daysRemaining }: { badge: keyof typeof CreditStatusColor; daysRemaining?: number | null }) {
  const c = CreditStatusColor[badge];
  return <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-bold tracking-wider uppercase whitespace-nowrap" style={{ color: c, backgroundColor: `${c}1F` }}><span className="h-1.5 w-1.5" style={{ backgroundColor: c }} />{CreditStatusLabel[badge]}{daysRemaining != null && badge !== 'PAID' && badge !== 'CASH_DUE' ? <span className="tnum font-semibold normal-case">· {daysRemaining <= 0 ? `${Math.abs(daysRemaining)}d over` : `${daysRemaining}d`}</span> : null}</span>;
}

export function ReviewChip({ r }: { r: Pick<Review, 'reviewStatus' | 'rejectionReason'> }) {
  const tone = r.reviewStatus === 'APPROVED' ? 'text-ok bg-ok/10' : r.reviewStatus === 'REJECTED' ? 'text-crit bg-crit/10' : 'text-hazard bg-hazard/10';
  return <span title={r.rejectionReason ?? undefined} className={`px-2 py-0.5 text-[11px] font-bold tracking-wider whitespace-nowrap ${tone}`}>{ReviewStatusLabel[r.reviewStatus]}</span>;
}

/** Outstanding shown as owed (red), settled, or in credit when the client has paid ahead. */
export function Balance({ v, c }: { v: number; c: string }) {
  if (v > 0) return <span className="text-crit font-semibold tnum">{amount(v, c)}</span>;
  if (v < 0) return <span className="text-ok tnum">{amount(-v, c)} in credit</span>;
  return <span className="text-muted tnum">Settled</span>;
}

export function useFinanceSettings() {
  const [s, setS] = useState<FinanceSettings>(DEFAULT_FINANCE_SETTINGS);
  useEffect(() => { api<FinanceSettings>('/settings/finance').then(setS).catch(() => {}); }, []);
  return s;
}

const iso = (d?: string | null) => (d ? d.slice(0, 10) : '');

// ── Machine & client (deployment) ──

export function DeploymentDrawer({ open, onClose, onSaved, initial, access }: { open: boolean; onClose: () => void; onSaved: (d: Deployment) => void; initial?: Deployment | null; access: Access }) {
  const settings = useFinanceSettings();
  const [machines, setMachines] = useState<(Asset & { status: string; deployment: { id: string; client: { name: string } } | null })[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const blank = { assetId: '', clientName: '', site: '', contractRef: '', startDate: today(), expectedEndDate: '', ratePerDay: '', currency: '', paymentMode: 'CASH', creditTermDays: '', status: 'ACTIVE', notes: '' };
  const [f, setF] = useState(blank);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  useEffect(() => {
    if (!open) return;
    setError(null);
    api<typeof machines>('/finance/machines').then(setMachines).catch(() => {});
    api<Client[]>('/finance/clients').then(setClients).catch(() => {});
    setF(initial ? { assetId: initial.assetId, clientName: initial.client.name, site: initial.site, contractRef: initial.contractRef ?? '', startDate: iso(initial.startDate), expectedEndDate: iso(initial.expectedEndDate), ratePerDay: String(Number(initial.ratePerDay)), currency: initial.currency, paymentMode: initial.paymentMode, creditTermDays: initial.creditTermDays ? String(initial.creditTermDays) : '', status: initial.status, notes: initial.notes ?? '' } : blank);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);
  const currency = f.currency || settings.defaultCurrency;

  async function save(e: React.FormEvent) {
    e.preventDefault(); setError(null); setBusy(true);
    const body = { assetId: f.assetId, clientName: f.clientName, site: f.site, contractRef: f.contractRef || undefined, startDate: f.startDate, expectedEndDate: f.expectedEndDate || undefined, ratePerDay: Number(f.ratePerDay), currency, paymentMode: f.paymentMode, creditTermDays: f.paymentMode === 'CREDIT' && f.creditTermDays ? Number(f.creditTermDays) : undefined, status: f.status, notes: f.notes || undefined };
    try { onSaved(await api<Deployment>(initial ? `/finance/deployments/${initial.id}` : '/finance/deployments', { method: initial ? 'PATCH' : 'POST', body: JSON.stringify(body) })); onClose(); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  return (
    <Drawer open={open} onClose={onClose} onSubmit={save} eyebrow="Machine & client" title={initial ? `Edit ${initial.asset.assetNumber}` : 'New deployment'}
      intro={access.write ? 'Saved as approved.' : 'Saved for review by the Finance Manager. You can correct it once if it is rejected.'}
      footer={<><button type="button" onClick={onClose} className="btn-ghost">Cancel</button><button disabled={busy} className="btn-primary h-10">{busy ? 'Saving…' : initial?.reviewStatus === 'REJECTED' && !access.write ? 'Correct & resubmit' : 'Save'}</button></>}>
      {initial?.reviewStatus === 'REJECTED' && <div className="border-l-4 border-crit bg-crit/5 px-3 py-2 text-[13px]"><b>Rejected:</b> {initial.rejectionReason}</div>}
      <Field label="Machine" required hint={access.plantOnly ? 'plant machines only' : undefined}>
        <select className="input" required value={f.assetId} onChange={(e) => set('assetId', e.target.value)}>
          <option value="">Choose a machine…</option>
          {machines.map((m) => <option key={m.id} value={m.id} disabled={!!m.deployment && m.deployment.id !== initial?.id}>{m.assetNumber} — {m.name}{m.deployment && m.deployment.id !== initial?.id ? ` (on hire to ${m.deployment.client.name})` : ''}</option>)}
        </select>
      </Field>
      <Field label="Client name" required hint="type a new name to add a client">
        <input className="input" required list="client-list" value={f.clientName} onChange={(e) => set('clientName', e.target.value)} />
        <datalist id="client-list">{clients.map((c) => <option key={c.id} value={c.name} />)}</datalist>
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Client site" required><input className="input" required value={f.site} onChange={(e) => set('site', e.target.value)} placeholder="e.g. Pit 3" /></Field>
        <Field label="Contract / PO ref"><input className="input" value={f.contractRef} onChange={(e) => set('contractRef', e.target.value)} /></Field>
        <Field label="Start date" required><input type="date" className="input" required value={f.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
        <Field label="Expected end date"><input type="date" className="input" value={f.expectedEndDate} min={f.startDate} onChange={(e) => set('expectedEndDate', e.target.value)} /></Field>
        <Field label="Rate per day" required><input type="number" min={0.01} step="0.01" className="input tnum" required value={f.ratePerDay} onChange={(e) => set('ratePerDay', e.target.value)} /></Field>
        <Field label="Currency" required><select className="input" value={currency} onChange={(e) => set('currency', e.target.value)}>{settings.currencies.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Payment mode" required><select className="input" value={f.paymentMode} onChange={(e) => set('paymentMode', e.target.value)}><option value="CASH">Cash</option><option value="CREDIT">Credit</option></select></Field>
        {f.paymentMode === 'CREDIT' ? <Field label="Credit term (days)" required><input type="number" min={1} className="input tnum" required value={f.creditTermDays} onChange={(e) => set('creditTermDays', e.target.value)} /></Field> : <div />}
        <Field label="Status" required><select className="input" value={f.status} onChange={(e) => set('status', e.target.value)}>{DeploymentStatuses.map((s) => <option key={s} value={s}>{DeploymentStatusLabel[s]}</option>)}</select></Field>
      </div>
      <Field label="Notes"><textarea className="input min-h-[72px]" value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
      <ErrorText>{error}</ErrorText>
    </Drawer>
  );
}

// ── Payments (with live expiry preview, spec §6.3 tab 3) ──

export function PaymentDrawer({ open, onClose, onSaved, initial, preset, access }: { open: boolean; onClose: () => void; onSaved: (p: Payment) => void; initial?: Payment | null; preset?: { clientId: string; deploymentId?: string } | null; access: Access }) {
  const settings = useFinanceSettings();
  const [clients, setClients] = useState<Client[]>([]);
  const [deps, setDeps] = useState<Deployment[]>([]);
  const blank = { clientId: '', deploymentId: '', paymentDate: today(), amount: '', currency: '', method: 'BANK_TRANSFER', reference: '', paidFrom: '', daysCovered: '', notes: '' };
  const [f, setF] = useState(blank);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  useEffect(() => {
    if (!open) return;
    setError(null);
    api<Client[]>('/finance/clients').then(setClients).catch(() => {});
    api<Deployment[]>('/finance/deployments').then(setDeps).catch(() => {});
    setF(initial ? { clientId: initial.clientId, deploymentId: initial.deploymentId ?? '', paymentDate: iso(initial.paymentDate), amount: String(Number(initial.amount)), currency: initial.currency, method: initial.method, reference: initial.reference ?? '', paidFrom: iso(initial.paidFrom), daysCovered: initial.daysCovered ? String(initial.daysCovered) : '', notes: initial.notes ?? '' }
      : { ...blank, clientId: preset?.clientId ?? '', deploymentId: preset?.deploymentId ?? '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial, preset]);
  const clientDeps = deps.filter((d) => d.clientId === f.clientId);
  const dep = deps.find((d) => d.id === f.deploymentId);
  const credit = dep?.paymentMode === 'CREDIT';
  const currency = f.currency || dep?.currency || settings.defaultCurrency;
  const needsRef = f.method === 'BANK_TRANSFER' || f.method === 'CHEQUE';
  const preview = useMemo(() => (f.paidFrom && Number(f.daysCovered) > 0 ? previewCoverage(f.paidFrom, Number(f.daysCovered)) : null), [f.paidFrom, f.daysCovered]);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setError(null); setBusy(true);
    const body = { clientId: f.clientId, deploymentId: f.deploymentId || undefined, paymentDate: f.paymentDate, amount: Number(f.amount), currency, method: f.method, reference: f.reference || undefined, paidFrom: f.paidFrom || undefined, daysCovered: f.daysCovered ? Number(f.daysCovered) : undefined, notes: f.notes || undefined };
    try { onSaved(await api<Payment>(initial ? `/finance/payments/${initial.id}` : '/finance/payments', { method: initial ? 'PATCH' : 'POST', body: JSON.stringify(body) })); onClose(); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  return (
    <Drawer open={open} onClose={onClose} onSubmit={save} eyebrow="Payments" title={initial ? 'Correct payment' : 'Record payment'}
      intro={access.write ? 'Saved as approved.' : 'Saved for review. A saved payment cannot be changed afterwards — corrections go through the Finance Manager.'}
      footer={<><button type="button" onClick={onClose} className="btn-ghost">Cancel</button><button disabled={busy} className="btn-primary h-10">{busy ? 'Saving…' : 'Save payment'}</button></>}>
      <Field label="Client" required><select className="input" required value={f.clientId} onChange={(e) => setF((x) => ({ ...x, clientId: e.target.value, deploymentId: '' }))}><option value="">Choose a client…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label="Deployment" hint="link to a specific machine on hire"><select className="input" value={f.deploymentId} onChange={(e) => set('deploymentId', e.target.value)} disabled={!f.clientId}><option value="">Not linked</option>{clientDeps.map((d) => <option key={d.id} value={d.id}>{d.asset.assetNumber} · {d.site} · {d.paymentMode === 'CREDIT' ? 'Credit' : 'Cash'}</option>)}</select></Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Payment date" required><input type="date" className="input" required max={today()} value={f.paymentDate} onChange={(e) => set('paymentDate', e.target.value)} /></Field>
        <Field label="Method" required><select className="input" value={f.method} onChange={(e) => set('method', e.target.value)}>{PaymentMethods.map((m) => <option key={m} value={m}>{PaymentMethodLabel[m]}</option>)}</select></Field>
        <Field label="Amount" required><input type="number" min={0.01} step="0.01" className="input tnum" required value={f.amount} onChange={(e) => set('amount', e.target.value)} /></Field>
        <Field label="Currency" required><select className="input" value={currency} onChange={(e) => set('currency', e.target.value)}>{settings.currencies.map((c) => <option key={c}>{c}</option>)}</select></Field>
      </div>
      {needsRef && <Field label={f.method === 'CHEQUE' ? 'Cheque number' : 'Bank reference'} required><input className="input font-mono" required value={f.reference} onChange={(e) => set('reference', e.target.value)} /></Field>}
      {(credit || f.paidFrom || f.daysCovered) && (
        <div className="border border-line p-4 flex flex-col gap-3">
          <div className="eyebrow">Credit period covered</div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Paid from" required={credit}><input type="date" className="input" required={credit} value={f.paidFrom} onChange={(e) => set('paidFrom', e.target.value)} /></Field>
            <Field label="Days covered" required={credit}><input type="number" min={1} className="input tnum" required={credit} value={f.daysCovered} onChange={(e) => set('daysCovered', e.target.value)} /></Field>
          </div>
          {preview && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-canvas px-3 py-2">
              <div><div className="text-[11px] text-muted">Expires</div><div className="font-semibold tnum">{fmtDate(preview.expiry)}</div></div>
              <div><div className="text-[11px] text-muted">Days remaining</div><div className="font-semibold tnum" style={{ color: CreditStatusColor[preview.status] }}>{preview.daysRemaining}</div></div>
              <Badge badge={preview.status} />
            </div>
          )}
        </div>
      )}
      <Field label="Notes"><textarea className="input min-h-[64px]" value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
      <ErrorText>{error}</ErrorText>
    </Drawer>
  );
}

// ── Days worked (spec §11.3 tab 2) ──

export function DaysDrawer({ open, onClose, onSaved, initial, access }: { open: boolean; onClose: () => void; onSaved: () => void; initial?: DaysWorked | null; access: Access }) {
  const [deps, setDeps] = useState<Deployment[]>([]);
  const [operators, setOperators] = useState<{ employeeId: string; name: string }[]>([]);
  const blank = { deploymentId: '', workDate: today(), shift: 'FULL_DAY', hoursWorked: '', standbyHours: '0', operatorEmployeeId: '', billable: true, productionNotes: '' };
  const [f, setF] = useState(blank);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setError(null);
    api<Deployment[]>('/finance/deployments?active=1').then(setDeps).catch(() => {});
    api<{ employeeId: string; name: string }[]>('/users/lookup?role=OPERATOR').then(setOperators).catch(() => {});
    setF(initial ? { deploymentId: initial.deploymentId, workDate: iso(initial.workDate), shift: initial.shift, hoursWorked: String(Number(initial.hoursWorked)), standbyHours: String(Number(initial.standbyHours)), operatorEmployeeId: initial.operatorEmployeeId, billable: initial.billable, productionNotes: initial.productionNotes ?? '' } : blank);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);
  const dep = deps.find((d) => d.id === f.deploymentId);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setError(null); setBusy(true);
    const body = { ...f, hoursWorked: Number(f.hoursWorked), standbyHours: Number(f.standbyHours || 0), productionNotes: f.productionNotes || undefined };
    try { await api(initial ? `/finance/days-worked/${initial.id}` : '/finance/days-worked', { method: initial ? 'PATCH' : 'POST', body: JSON.stringify(body) }); onSaved(); onClose(); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  return (
    <Drawer open={open} onClose={onClose} onSubmit={save} eyebrow="Days worked" title={initial ? 'Correct days worked' : 'Record days worked'}
      intro={access.write ? 'Saved as approved.' : 'Saved for review by the Finance Manager.'}
      footer={<><button type="button" onClick={onClose} className="btn-ghost">Cancel</button><button disabled={busy} className="btn-primary h-10">{busy ? 'Saving…' : 'Save'}</button></>}>
      {initial?.reviewStatus === 'REJECTED' && <div className="border-l-4 border-crit bg-crit/5 px-3 py-2 text-[13px]"><b>Rejected:</b> {initial.rejectionReason}</div>}
      <Field label="Deployment" required><select className="input" required value={f.deploymentId} onChange={(e) => setF({ ...f, deploymentId: e.target.value })}><option value="">Choose…</option>{deps.map((d) => <option key={d.id} value={d.id}>{d.asset.assetNumber} — {d.client.name} · {d.site}</option>)}</select></Field>
      {dep && <div className="text-[12px] text-muted -mt-2">{dep.asset.name} · {dep.client.name} · since {fmtDate(dep.startDate)}</div>}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Date" required><input type="date" className="input" required max={today()} min={dep ? iso(dep.startDate) : undefined} value={f.workDate} onChange={(e) => setF({ ...f, workDate: e.target.value })} /></Field>
        <Field label="Shift" required><select className="input" value={f.shift} onChange={(e) => setF({ ...f, shift: e.target.value })}>{WorkShifts.map((s) => <option key={s} value={s}>{WorkShiftLabel[s]}</option>)}</select></Field>
        <Field label="Hours worked" required hint="0–12"><input type="number" min={0} max={12} step="0.5" className="input tnum" required value={f.hoursWorked} onChange={(e) => setF({ ...f, hoursWorked: e.target.value })} /></Field>
        <Field label="Standby hours" hint="0–12"><input type="number" min={0} max={12} step="0.5" className="input tnum" value={f.standbyHours} onChange={(e) => setF({ ...f, standbyHours: e.target.value })} /></Field>
      </div>
      <Field label="Operator on shift" required hint="employee ID">
        <input className="input font-mono uppercase" required list="operator-list" value={f.operatorEmployeeId} onChange={(e) => setF({ ...f, operatorEmployeeId: e.target.value.toUpperCase() })} />
        <datalist id="operator-list">{operators.map((o) => <option key={o.employeeId} value={o.employeeId}>{o.name}</option>)}</datalist>
      </Field>
      <label className="flex items-center gap-2 text-[14px] font-medium"><input type="checkbox" checked={f.billable} onChange={(e) => setF({ ...f, billable: e.target.checked })} className="h-4 w-4" /> Billable</label>
      <Field label="Production notes"><textarea className="input min-h-[64px]" value={f.productionNotes} onChange={(e) => setF({ ...f, productionNotes: e.target.value })} /></Field>
      <ErrorText>{error}</ErrorText>
    </Drawer>
  );
}

/** Approve / reject buttons for a pending entry (spec §11.4). */
export function ReviewButtons({ kind, id, onDone, onError }: { kind: 'deployments' | 'days-worked' | 'payments'; id: string; onDone: () => void; onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  async function decide(decision: 'APPROVE' | 'REJECT') {
    const reason = decision === 'REJECT' ? prompt('Reason for rejecting (the supervisor will see this):')?.trim() : undefined;
    if (decision === 'REJECT' && !reason) return;
    setBusy(true);
    try { await api(`/finance/${kind}/${id}/review`, { method: 'POST', body: JSON.stringify({ decision, reason }) }); onDone(); } catch (e) { onError((e as Error).message); } finally { setBusy(false); }
  }
  return <span className="inline-flex gap-1"><button type="button" disabled={busy} onClick={() => decide('APPROVE')} className="btn-ghost text-[12px] text-ok font-semibold">Approve</button><button type="button" disabled={busy} onClick={() => decide('REJECT')} className="btn-ghost text-[12px] text-crit">Reject</button></span>;
}

/** Payments list shared by the Finance and Plant Hire pages. */
export function PaymentTable({ rows, onEdit, actions }: { rows: Payment[]; onEdit?: (p: Payment) => void; actions?: (p: Payment) => ReactNode }) {
  return (
    <section className="card overflow-x-auto">
      <table className="w-full text-[14px]">
        <thead><tr className="text-left eyebrow border-b border-line">{['Date', 'Client', 'Machine', 'Amount', 'Method', 'Reference', 'Covers', 'Entered by', 'Review', ''].map((h, i) => <th key={i} className="px-4 py-2.5 font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-b border-line last:border-0">
              <td className="px-4 py-3 tnum whitespace-nowrap">{fmtDate(p.paymentDate)}</td>
              <td className="px-4 py-3 font-medium">{p.client.name}</td>
              <td className="px-4 py-3 font-mono text-[13px]">{p.deployment?.asset.assetNumber ?? '—'}</td>
              <td className="px-4 py-3 tnum whitespace-nowrap font-semibold">{amount(p.amount, p.currency)}</td>
              <td className="px-4 py-3 whitespace-nowrap">{PaymentMethodLabel[p.method]}</td>
              <td className="px-4 py-3 font-mono text-[12px]">{p.reference ?? '—'}</td>
              <td className="px-4 py-3 text-[12px] whitespace-nowrap">{p.paidFrom && p.daysCovered ? `${fmtDate(p.paidFrom)} + ${p.daysCovered}d` : '—'}</td>
              <td className="px-4 py-3 font-mono text-[12px]">{p.createdBy?.employeeId ?? '—'}</td>
              <td className="px-4 py-3"><ReviewChip r={p} /></td>
              <td className="px-4 py-3 text-right whitespace-nowrap">{actions?.(p)}{onEdit && <button onClick={() => onEdit(p)} className="btn-ghost text-[12px]">Correct</button>}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={10} className="px-5 py-10 text-center text-muted">No payments yet.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}
