'use client';
import { useCallback, useEffect, useState } from 'react';
import { CreditStatusColor, DeploymentStatusLabel, WorkShiftLabel } from '@drillex/shared';
import { Shell } from '@/components/Shell';
import { I } from '@/components/Icons';
import { api } from '@/lib/api';
import { ErrorText, fmtDate, Modal, Notice, Tabs } from '@/components/kit';
import { amount, Badge, Balance, DeploymentDrawer, PaymentDrawer, PaymentTable, perCurrencyText, ReviewButtons, ReviewChip, type Access, type DaysWorked, type Deployment, type Payment } from '@/components/finance';

type Tab = 'dashboard' | 'mapping' | 'payments' | 'alerts' | 'reports' | 'review';
type Dash = { collectedThisMonth: Record<string, number>; outstanding: Record<string, number>; expiringWithin7Days: number; activeMachines: number; pendingReview: number; deployments: Deployment[] };
type Alert = { deploymentId: string; machine: string; machineName: string; client: { id: string; name: string; phone?: string | null; email?: string | null }; site: string; paymentMode: string; badge: keyof typeof CreditStatusColor; daysRemaining: number | null; expiry: string | null; outstanding: string | null; message: string };
type Monthly = { month: string; from: string; to: string; rows: { deploymentId: string; machine: string; machineName: string; client: string; site: string; daysWorked: number; ratePerDay: number; currency: string; billed: number; received: number; balance: number }[]; totals: { billed: Record<string, number>; received: Record<string, number>; balance: Record<string, number> } };
type Queue = { deployments: Deployment[]; days: DaysWorked[]; payments: Payment[] };

const FINANCE_HEADER = '#0D3060'; // client spec §6 / §7 "Finance Header" token

export default function FinancePage() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [access, setAccess] = useState<Access | null>(null);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<Access>('/finance/access').then(setAccess).catch((e) => setError(e.message)); }, []);
  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'dashboard', label: 'Dashboard' }, { key: 'mapping', label: 'Mapping' }, { key: 'payments', label: 'Payments' },
    { key: 'alerts', label: 'Follow-up alerts' }, { key: 'reports', label: 'Reports' },
    ...(access?.review ? [{ key: 'review' as const, label: 'Review', count: pending }] : []),
  ];

  return (
    <Shell title="Finance">
      <div className="-mx-4 sm:-mx-8 -mt-4 sm:-mt-8 px-4 sm:px-8 pt-4 text-white" style={{ backgroundColor: FINANCE_HEADER }}>
        <div className="eyebrow !text-white/60">Finance Manager</div>
        <div className="font-display text-[22px] font-semibold">Billing & collections</div>
        <Tabs dark tabs={tabs} value={tab} onChange={setTab} />
      </div>
      <ErrorText>{error}</ErrorText>
      {access && tab === 'dashboard' && <DashboardTab onPending={setPending} />}
      {access && tab === 'mapping' && <MappingTab access={access} />}
      {access && tab === 'payments' && <PaymentsTab access={access} />}
      {access && tab === 'alerts' && <AlertsTab access={access} />}
      {access && tab === 'reports' && <ReportsTab />}
      {access && tab === 'review' && <ReviewTab onPending={setPending} />}
    </Shell>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return <div className="card p-4"><div className="eyebrow">{label}</div><div className="font-display text-[22px] font-semibold tnum mt-1 break-words" style={tone ? { color: tone } : undefined}>{value}</div></div>;
}

function DeploymentTable({ rows, onEdit, compact }: { rows: Deployment[]; onEdit?: (d: Deployment) => void; compact?: boolean }) {
  return (
    <section className="card overflow-x-auto">
      <table className="w-full text-[14px]">
        <thead><tr className="text-left eyebrow border-b border-line">{['Machine', 'Client', 'Site', 'Mode', ...(compact ? [] : ['Start', 'Rate / day', 'Days worked']), 'Balance', 'Status', ...(compact ? [] : ['Review', ''])].map((h, i) => <th key={i} className="px-4 py-2.5 font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.id} className="border-b border-line last:border-0 hover:bg-navy-100/40">
              <td className="px-4 py-3 whitespace-nowrap"><span className="font-mono text-[13px] font-semibold text-navy-800">{d.asset.assetNumber}</span>{d.status !== 'ACTIVE' && <span className="ml-2 text-[11px] text-muted">{DeploymentStatusLabel[d.status]}</span>}</td>
              <td className="px-4 py-3 font-medium">{d.client.name}</td>
              <td className="px-4 py-3 text-muted">{d.site}</td>
              <td className="px-4 py-3">{d.paymentMode === 'CREDIT' ? 'Credit' : 'Cash'}</td>
              {!compact && <><td className="px-4 py-3 tnum whitespace-nowrap">{fmtDate(d.startDate)}</td><td className="px-4 py-3 tnum whitespace-nowrap">{amount(d.ratePerDay, d.currency)}</td><td className="px-4 py-3 tnum">{d.daysWorked}</td></>}
              <td className="px-4 py-3 whitespace-nowrap"><Balance v={d.outstanding} c={d.currency} /></td>
              <td className="px-4 py-3"><Badge badge={d.badge} daysRemaining={d.daysRemaining} /></td>
              {!compact && <><td className="px-4 py-3"><ReviewChip r={d} /></td><td className="px-4 py-3 text-right">{onEdit && <button onClick={() => onEdit(d)} className="btn-ghost text-[12px]">Edit</button>}</td></>}
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={11} className="px-5 py-10 text-center text-muted">No deployments yet.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}

function DashboardTab({ onPending }: { onPending: (n: number) => void }) {
  const [d, setD] = useState<Dash | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<Dash>('/finance/dashboard').then((x) => { setD(x); onPending(x.pendingReview); }).catch((e) => setError(e.message)); }, [onPending]);
  if (error) return <ErrorText>{error}</ErrorText>;
  if (!d) return <div className="text-muted">Loading…</div>;
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="Collected this month" value={perCurrencyText(d.collectedThisMonth)} tone="#22C55E" />
        <Kpi label="Outstanding balance" value={perCurrencyText(d.outstanding)} tone={Object.keys(d.outstanding).length ? '#EF4444' : undefined} />
        <Kpi label="Expiring ≤ 7 days" value={d.expiringWithin7Days} tone={d.expiringWithin7Days ? '#F97316' : undefined} />
        <Kpi label="Active machines" value={d.activeMachines} />
        <Kpi label="Waiting for review" value={d.pendingReview} tone={d.pendingReview ? '#F59E0B' : undefined} />
      </div>
      <div className="eyebrow">Deployments by urgency</div>
      <DeploymentTable rows={d.deployments} compact />
    </>
  );
}

function MappingTab({ access }: { access: Access }) {
  const [rows, setRows] = useState<Deployment[]>([]);
  const [all, setAll] = useState(false);
  const [editing, setEditing] = useState<Deployment | null | 'new'>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api<Deployment[]>(`/finance/deployments${all ? '' : '?active=1'}`).then(setRows).catch((e) => setError(e.message)), [all]);
  useEffect(() => { load(); }, [load]);
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Include demobilised and rejected</label>
        <div className="ml-auto flex gap-2">{(access.write || access.psv) && <button onClick={() => setEditing('new')} className="btn-primary h-9 text-[13px]"><I.Plus /> New mapping</button>}</div>
      </div>
      <ErrorText>{error}</ErrorText>
      <DeploymentTable rows={rows} onEdit={access.write ? (d) => setEditing(d) : undefined} />
      <DeploymentDrawer open={editing !== null} onClose={() => setEditing(null)} initial={editing === 'new' ? null : editing} onSaved={load} access={access} />
    </>
  );
}

function PaymentsTab({ access }: { access: Access }) {
  const [rows, setRows] = useState<Payment[]>([]);
  const [editing, setEditing] = useState<Payment | null | 'new'>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api<Payment[]>('/finance/payments').then(setRows).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  return (
    <>
      <div className="flex justify-end">{(access.write || access.psv) && <button onClick={() => setEditing('new')} className="btn-primary h-9 text-[13px]"><I.Plus /> Record payment</button>}</div>
      <ErrorText>{error}</ErrorText>
      <PaymentTable rows={rows} onEdit={access.write ? (p) => setEditing(p) : undefined} />
      <PaymentDrawer open={editing !== null} onClose={() => setEditing(null)} initial={editing === 'new' ? null : editing} onSaved={load} access={access} />
    </>
  );
}

function AlertsTab({ access }: { access: Access }) {
  const [rows, setRows] = useState<Alert[]>([]);
  const [open, setOpen] = useState<Alert | null>(null);
  const [msg, setMsg] = useState('');
  const [contact, setContact] = useState({ phone: '', email: '' });
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api<Alert[]>('/finance/alerts').then(setRows).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const start = (a: Alert) => { setOpen(a); setMsg(a.message); setContact({ phone: a.client.phone ?? '', email: a.client.email ?? '' }); };
  const digits = contact.phone.replace(/[^\d]/g, '');
  async function saveContact() {
    if (!open) return;
    try { await api(`/finance/clients/${open.client.id}`, { method: 'PATCH', body: JSON.stringify({ phone: contact.phone || undefined, email: contact.email || undefined }) }); setNote(`Contact saved for ${open.client.name}.`); load(); } catch (e) { setError((e as Error).message); }
  }
  return (
    <>
      {note && <Notice title={note} onClose={() => setNote(null)} />}
      <ErrorText>{error}</ErrorText>
      <div className="flex flex-col gap-2">
        {rows.map((a) => (
          <div key={a.deploymentId} className="card p-4 flex flex-wrap items-center gap-x-5 gap-y-2" style={{ borderLeft: `4px solid ${CreditStatusColor[a.badge]}` }}>
            <div className="min-w-[110px]"><div className="font-mono font-semibold text-navy-800">{a.machine}</div><div className="text-[12px] text-muted">{a.machineName}</div></div>
            <div className="flex-1 min-w-[160px]"><div className="font-medium">{a.client.name}</div><div className="text-[12px] text-muted">{a.site} · {a.paymentMode === 'CREDIT' ? 'Credit' : 'Cash'}{a.expiry ? ` · expires ${fmtDate(a.expiry)}` : ''}</div></div>
            <div className="text-[13px] tnum">{a.outstanding ? <span className="text-crit font-semibold">{a.outstanding} outstanding</span> : <span className="text-muted">Nothing outstanding</span>}</div>
            <Badge badge={a.badge} daysRemaining={a.daysRemaining} />
            <button onClick={() => start(a)} className="btn-primary h-9 text-[13px]">Message</button>
          </div>
        ))}
        {!rows.length && <div className="card p-10 text-center text-muted">No follow-ups needed — every deployment is paid up.</div>}
      </div>
      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? `Follow up · ${open.client.name}` : ''}
        footer={<>
          <button type="button" onClick={() => { navigator.clipboard?.writeText(msg); setNote('Message copied.'); }} className="btn-ghost">Copy</button>
          <a className={`btn-ghost ${contact.email ? '' : 'pointer-events-none opacity-40'}`} href={`mailto:${contact.email}?subject=${encodeURIComponent(`Payment reminder — ${open?.machine ?? ''}`)}&body=${encodeURIComponent(msg)}`}>Email</a>
          <a className={`btn-primary h-10 ${digits ? '' : 'pointer-events-none opacity-40'}`} href={`https://wa.me/${digits}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer">WhatsApp</a>
        </>}>
        <textarea className="input min-h-[220px] text-[14px] leading-relaxed" value={msg} onChange={(e) => setMsg(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-[12px] font-medium">WhatsApp number<input className="input" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} placeholder="+260 …" /></label>
          <label className="flex flex-col gap-1 text-[12px] font-medium">Email<input className="input" type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} /></label>
        </div>
        {access.write && <button type="button" onClick={saveContact} className="btn-ghost self-start text-[12px]">Save contact to client</button>}
      </Modal>
    </>
  );
}

function ReportsTab() {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [data, setData] = useState<Monthly | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setError(null); api<Monthly>(`/finance/monthly?month=${month}`).then(setData).catch((e) => setError(e.message)); }, [month]);
  async function exportFile(kind: 'pdf' | 'xlsx') {
    if (!data) return;
    setBusy(true); setError(null);
    try {
      const r = await api<{ pdfUrl: string; xlsxUrl: string }>('/reports/generate', { method: 'POST', body: JSON.stringify({ type: 'MONTHLY_FINANCIAL', from: data.from.slice(0, 10), to: data.to.slice(0, 10) }) });
      window.open(kind === 'pdf' ? r.pdfUrl : r.xlsxUrl, '_blank');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[13px] font-medium">Month <input type="month" className="input w-auto" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
        <div className="ml-auto flex gap-2"><button disabled={busy || !data} onClick={() => exportFile('pdf')} className="btn-ghost border border-line"><I.Report /> PDF</button><button disabled={busy || !data} onClick={() => exportFile('xlsx')} className="btn-ghost border border-line"><I.Report /> Excel</button></div>
      </div>
      <ErrorText>{error}</ErrorText>
      {data && (
        <section className="card overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead><tr className="text-left eyebrow border-b border-line">{['Machine', 'Client', 'Days worked', 'Daily rate', 'Total billed', 'Amount received', 'Balance'].map((h) => <th key={h} className="px-4 py-2.5 font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.deploymentId} className="border-b border-line">
                  <td className="px-4 py-2.5 font-mono text-[13px] font-semibold text-navy-800">{r.machine}</td><td className="px-4 py-2.5">{r.client}</td><td className="px-4 py-2.5 tnum">{r.daysWorked}</td>
                  <td className="px-4 py-2.5 tnum whitespace-nowrap">{amount(r.ratePerDay, r.currency)}</td><td className="px-4 py-2.5 tnum whitespace-nowrap">{amount(r.billed, r.currency)}</td>
                  <td className="px-4 py-2.5 tnum whitespace-nowrap">{amount(r.received, r.currency)}</td><td className="px-4 py-2.5 whitespace-nowrap"><Balance v={r.balance} c={r.currency} /></td>
                </tr>
              ))}
              {!data.rows.length && <tr><td colSpan={7} className="px-5 py-10 text-center text-muted">Nothing billed in this month.</td></tr>}
            </tbody>
            {!!data.rows.length && <tfoot><tr className="font-semibold"><td className="px-4 py-3" colSpan={4}>Totals</td><td className="px-4 py-3 tnum">{perCurrencyText(data.totals.billed)}</td><td className="px-4 py-3 tnum">{perCurrencyText(data.totals.received)}</td><td className="px-4 py-3 tnum">{perCurrencyText(data.totals.balance)}</td></tr></tfoot>}
          </table>
        </section>
      )}
    </>
  );
}

function ReviewTab({ onPending }: { onPending: (n: number) => void }) {
  const [q, setQ] = useState<Queue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api<Queue>('/finance/reviews').then((x) => { setQ(x); onPending(x.deployments.length + x.days.length + x.payments.length); }).catch((e) => setError(e.message)), [onPending]);
  useEffect(() => { load(); }, [load]);
  if (!q) return <ErrorText>{error}</ErrorText>;
  const empty = !q.deployments.length && !q.days.length && !q.payments.length;
  const by = (p: { createdBy: { employeeId: string } | null; resubmitted: boolean }) => <span className="text-[12px] text-muted">by {p.createdBy?.employeeId}{p.resubmitted ? ' · corrected after rejection' : ''}</span>;
  return (
    <>
      <ErrorText>{error}</ErrorText>
      {empty && <div className="card p-10 text-center text-muted">Nothing is waiting for review.</div>}
      {!!q.deployments.length && <><div className="eyebrow">Machine & client</div><div className="card divide-y divide-line">{q.deployments.map((d) => <div key={d.id} className="p-4 flex flex-wrap items-center gap-x-4 gap-y-1"><span className="font-mono font-semibold text-navy-800">{d.asset.assetNumber}</span><span className="font-medium">{d.client.name}</span><span className="text-muted text-[13px]">{d.site} · from {fmtDate(d.startDate)} · {amount(d.ratePerDay, d.currency)}/day · {d.paymentMode === 'CREDIT' ? `Credit ${d.creditTermDays}d` : 'Cash'}</span>{by(d)}<span className="ml-auto"><ReviewButtons kind="deployments" id={d.id} onDone={load} onError={setError} /></span></div>)}</div></>}
      {!!q.days.length && <><div className="eyebrow">Days worked</div><div className="card divide-y divide-line">{q.days.map((d) => <div key={d.id} className="p-4 flex flex-wrap items-center gap-x-4 gap-y-1"><span className="font-mono font-semibold text-navy-800">{d.deployment.asset.assetNumber}</span><span>{fmtDate(d.workDate)} · {WorkShiftLabel[d.shift]}</span><span className="text-muted text-[13px]">{Number(d.hoursWorked)} h worked{Number(d.standbyHours) ? ` · ${Number(d.standbyHours)} h standby` : ''} · {d.operatorEmployeeId}{d.billable ? '' : ' · not billable'}</span>{by(d)}<span className="ml-auto"><ReviewButtons kind="days-worked" id={d.id} onDone={load} onError={setError} /></span></div>)}</div></>}
      {!!q.payments.length && <><div className="eyebrow">Payments</div><PaymentTable rows={q.payments} actions={(p) => <ReviewButtons kind="payments" id={p.id} onDone={load} onError={setError} />} /></>}
    </>
  );
}
