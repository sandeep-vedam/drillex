'use client';
import { useCallback, useEffect, useState } from 'react';
import { DeploymentStatusLabel, WorkShiftLabel } from '@drillex/shared';
import { Shell } from '@/components/Shell';
import { I } from '@/components/Icons';
import { api, getUser } from '@/lib/api';
import { ErrorText, fmtDate, Tabs } from '@/components/kit';
import { amount, Balance, DaysDrawer, DeploymentDrawer, PaymentDrawer, PaymentTable, perCurrencyText, ReviewChip, type Access, type Client, type DaysWorked, type Deployment, type Payment } from '@/components/finance';

type Tab = 'machines' | 'days' | 'payments' | 'summary';
type SummaryRow = { client: { id: string; name: string }; daysWorked: number; billed: Record<string, number>; received: Record<string, number>; outstanding: Record<string, number>; lastPaymentDate: string | null; activeMachines: number };
const BASE = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? '/api/v1' : 'http://localhost:4000/api/v1');

/** A rejected entry of your own may be corrected once (client spec §11.4). */
const correctable = (r: { reviewStatus: string; resubmitted: boolean; createdById: string }, a: Access) => a.write || (r.reviewStatus === 'REJECTED' && !r.resubmitted && r.createdById === getUser()?.id);

/** Plant Hire Supervisor module (client spec §11.3): machine & client, days worked, payments, summary. */
export default function PlantHirePage() {
  const [tab, setTab] = useState<Tab>('machines');
  const [access, setAccess] = useState<Access | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<Access>('/finance/access').then(setAccess).catch((e) => setError(e.message)); }, []);
  return (
    <Shell title="Plant hire">
      <div className="border-b border-line -mt-2"><Tabs tabs={[{ key: 'machines', label: 'Machine & client' }, { key: 'days', label: 'Days worked' }, { key: 'payments', label: 'Payments' }, { key: 'summary', label: 'Summary' }]} value={tab} onChange={setTab} /></div>
      <ErrorText>{error}</ErrorText>
      {access && !access.write && <p className="text-[13px] text-muted -mt-2">Everything you save is reviewed by the Finance Manager or Admin. Approved entries are locked; a rejected entry can be corrected once.</p>}
      {access && tab === 'machines' && <MachinesTab access={access} />}
      {access && tab === 'days' && <DaysTab access={access} />}
      {access && tab === 'payments' && <PaymentsTab access={access} />}
      {access && tab === 'summary' && <SummaryTab />}
    </Shell>
  );
}

function MachinesTab({ access }: { access: Access }) {
  const [rows, setRows] = useState<Deployment[]>([]);
  const [editing, setEditing] = useState<Deployment | null | 'new'>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api<Deployment[]>('/finance/deployments').then((r) => setRows(r.filter((d) => d.asset.category !== 'DRILLING'))).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  return (
    <>
      <div className="flex justify-end"><button onClick={() => setEditing('new')} className="btn-primary h-9 text-[13px]"><I.Plus /> Assign machine to client</button></div>
      <ErrorText>{error}</ErrorText>
      <section className="card overflow-x-auto">
        <table className="w-full text-[14px]">
          <thead><tr className="text-left eyebrow border-b border-line">{['Machine', 'Client', 'Site', 'Contract', 'Start', 'Expected end', 'Rate / day', 'Status', 'Days worked', 'Balance', 'Review', ''].map((h, i) => <th key={i} className="px-4 py-2.5 font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 font-mono text-[13px] font-semibold text-navy-800 whitespace-nowrap">{d.asset.assetNumber}</td>
                <td className="px-4 py-3 font-medium">{d.client.name}</td><td className="px-4 py-3 text-muted">{d.site}</td><td className="px-4 py-3 text-[12px] font-mono">{d.contractRef ?? '—'}</td>
                <td className="px-4 py-3 tnum whitespace-nowrap">{fmtDate(d.startDate)}</td><td className="px-4 py-3 tnum whitespace-nowrap">{fmtDate(d.expectedEndDate)}</td>
                <td className="px-4 py-3 tnum whitespace-nowrap">{amount(d.ratePerDay, d.currency)}</td><td className="px-4 py-3">{DeploymentStatusLabel[d.status]}</td>
                <td className="px-4 py-3 tnum">{d.daysWorked}</td><td className="px-4 py-3 whitespace-nowrap"><Balance v={d.outstanding} c={d.currency} /></td>
                <td className="px-4 py-3"><ReviewChip r={d} />{d.reviewStatus === 'REJECTED' && <div className="text-[11px] text-crit mt-1 max-w-[220px]">{d.rejectionReason}</div>}</td>
                <td className="px-4 py-3 text-right">{correctable(d, access) && <button onClick={() => setEditing(d)} className="btn-ghost text-[12px]">{access.write ? 'Edit' : 'Correct'}</button>}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={12} className="px-5 py-10 text-center text-muted">No plant machines on hire yet.</td></tr>}
          </tbody>
        </table>
      </section>
      <DeploymentDrawer open={editing !== null} onClose={() => setEditing(null)} initial={editing === 'new' ? null : editing} onSaved={load} access={access} />
    </>
  );
}

function DaysTab({ access }: { access: Access }) {
  const [rows, setRows] = useState<DaysWorked[]>([]);
  const [editing, setEditing] = useState<DaysWorked | null | 'new'>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api<DaysWorked[]>('/finance/days-worked').then((r) => setRows(r.filter((d) => d.deployment.asset.category !== 'DRILLING'))).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  return (
    <>
      <div className="flex justify-end"><button onClick={() => setEditing('new')} className="btn-primary h-9 text-[13px]"><I.Plus /> Record days worked</button></div>
      <ErrorText>{error}</ErrorText>
      <section className="card overflow-x-auto">
        <table className="w-full text-[14px]">
          <thead><tr className="text-left eyebrow border-b border-line">{['Date', 'Machine', 'Client', 'Shift', 'Hours', 'Standby', 'Operator', 'Billable', 'Review', ''].map((h, i) => <th key={i} className="px-4 py-2.5 font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 tnum whitespace-nowrap">{fmtDate(d.workDate)}</td><td className="px-4 py-3 font-mono text-[13px] font-semibold text-navy-800">{d.deployment.asset.assetNumber}</td>
                <td className="px-4 py-3">{d.deployment.client.name}</td><td className="px-4 py-3">{WorkShiftLabel[d.shift]}</td>
                <td className="px-4 py-3 tnum">{Number(d.hoursWorked)}</td><td className="px-4 py-3 tnum">{Number(d.standbyHours) || '—'}</td>
                <td className="px-4 py-3 font-mono text-[12px]">{d.operatorEmployeeId}</td><td className="px-4 py-3">{d.billable ? 'Yes' : <span className="text-muted">No</span>}</td>
                <td className="px-4 py-3"><ReviewChip r={d} />{d.reviewStatus === 'REJECTED' && <div className="text-[11px] text-crit mt-1 max-w-[220px]">{d.rejectionReason}</div>}</td>
                <td className="px-4 py-3 text-right">{correctable(d, access) && <button onClick={() => setEditing(d)} className="btn-ghost text-[12px]">{access.write ? 'Edit' : 'Correct'}</button>}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={10} className="px-5 py-10 text-center text-muted">No days recorded yet.</td></tr>}
          </tbody>
        </table>
      </section>
      <DaysDrawer open={editing !== null} onClose={() => setEditing(null)} initial={editing === 'new' ? null : editing} onSaved={load} access={access} />
    </>
  );
}

function PaymentsTab({ access }: { access: Access }) {
  const [rows, setRows] = useState<Payment[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api<Payment[]>('/finance/payments').then(setRows).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  return (
    <>
      <div className="flex justify-end"><button onClick={() => setOpen(true)} className="btn-primary h-9 text-[13px]"><I.Plus /> Record payment</button></div>
      <ErrorText>{error}</ErrorText>
      <PaymentTable rows={rows} />
      <PaymentDrawer open={open} onClose={() => setOpen(false)} onSaved={load} access={access} />
    </>
  );
}

function SummaryTab() {
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [machines, setMachines] = useState<{ id: string; assetNumber: string; category: string }[]>([]);
  const [f, setF] = useState({ clientId: '', assetId: '', from: '', to: '' });
  const [error, setError] = useState<string | null>(null);
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  useEffect(() => { api<Client[]>('/finance/clients').then(setClients).catch(() => {}); api<typeof machines>('/finance/machines').then((m) => setMachines(m.filter((x) => x.category !== 'DRILLING'))).catch(() => {}); }, []);
  useEffect(() => { api<SummaryRow[]>(`/finance/summary${qs ? `?${qs}` : ''}`).then(setRows).catch((e) => setError(e.message)); }, [qs]);
  async function csv() {
    // The API needs the bearer token, so fetch the file and hand it to the browser rather than linking to it.
    const res = await fetch(`${BASE}/finance/summary.csv${qs ? `?${qs}` : ''}`, { headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` } });
    if (!res.ok) { setError('Could not export'); return; }
    const url = URL.createObjectURL(await res.blob());
    Object.assign(document.createElement('a'), { href: url, download: 'client-summary.csv' }).click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[12px] font-medium">Client<select className="input w-auto" value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })}><option value="">All clients</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-[12px] font-medium">Machine<select className="input w-auto" value={f.assetId} onChange={(e) => setF({ ...f, assetId: e.target.value })}><option value="">All machines</option>{machines.map((m) => <option key={m.id} value={m.id}>{m.assetNumber}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-[12px] font-medium">From<input type="date" className="input w-auto" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
        <label className="flex flex-col gap-1 text-[12px] font-medium">To<input type="date" className="input w-auto" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
        <button onClick={csv} className="btn-ghost border border-line ml-auto"><I.Report /> Export CSV</button>
      </div>
      <ErrorText>{error}</ErrorText>
      <section className="card overflow-x-auto">
        <table className="w-full text-[14px]">
          <thead><tr className="text-left eyebrow border-b border-line">{['Client', 'Days worked', 'Total billed', 'Payments received', 'Outstanding', 'Last payment', 'Machines on hire'].map((h) => <th key={h} className="px-4 py-2.5 font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.client.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 font-medium">{r.client.name}</td><td className="px-4 py-3 tnum">{r.daysWorked}</td>
                <td className="px-4 py-3 tnum whitespace-nowrap">{perCurrencyText(r.billed)}</td><td className="px-4 py-3 tnum whitespace-nowrap">{perCurrencyText(r.received)}</td>
                <td className="px-4 py-3 whitespace-nowrap">{Object.entries(r.outstanding).map(([c, v]) => <div key={c}><Balance v={v} c={c} /></div>)}</td>
                <td className="px-4 py-3 tnum whitespace-nowrap">{fmtDate(r.lastPaymentDate)}</td><td className="px-4 py-3 tnum">{r.activeMachines}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="px-5 py-10 text-center text-muted">No plant hire activity for these filters.</td></tr>}
          </tbody>
        </table>
      </section>
      <p className="text-[12px] text-muted">Billed = billable days worked × daily rate. Amounts in different currencies are shown separately, never added together.</p>
    </>
  );
}
