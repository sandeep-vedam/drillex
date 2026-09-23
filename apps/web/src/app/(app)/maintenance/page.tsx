'use client';
import { useEffect, useMemo, useState } from 'react';
import { Shell } from '@/components/Shell';
import { StatusChip } from '@/components/StatusChip';
import { I } from '@/components/Icons';
import { api, getUser } from '@/lib/api';
import { useRoleMatrix } from '@/lib/permissions';
import { can } from '@drillex/shared';

type Sched = { id: string; serviceType: string; description: string; intervalHours?: number; intervalDays?: number; lastServiceAt?: string; lastServiceHours?: string; nextDueAt?: string; nextDueHours?: string; reminderLeadDays: number; status: string; technicianIds: string[]; estDowntimeHours?: string; notes?: string; currentHours: number | null; hoursRemaining: number | null; asset: { assetNumber: string; name: string; status: string } ; assetId: string };
type Opt = { id: string; name: string; employeeId?: string; assetNumber?: string };
const TYPES = [['HR_250', '250 hr'], ['HR_500', '500 hr'], ['HR_1000', '1000 hr'], ['ANNUAL', 'Annual'], ['CONDITION_BASED', 'Condition-based'], ['AD_HOC', 'Ad-hoc']];
const DEFAULTS: Record<string, { hours?: number; days?: number }> = { HR_250: { hours: 250 }, HR_500: { hours: 500 }, HR_1000: { hours: 1000 }, ANNUAL: { days: 365 } };
const ORDER: Record<string, number> = { OVERDUE: 0, DUE_NOW: 1, UPCOMING: 2, COMPLETED: 3 };
const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export default function MaintenancePage() {
  const [rows, setRows] = useState<Sched[]>([]);
  const [tab, setTab] = useState('ALL');
  const [sel, setSel] = useState<Sched | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const me = getUser();
  const matrix = useRoleMatrix();
  const load = () => api<Sched[]>('/maintenance/schedules').then((r) => { setRows(r); if (sel) setSel(r.find((x) => x.id === sel.id) ?? null); }).catch((e) => setError(e.message));
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const list = useMemo(() => rows.filter((r) => tab === 'ALL' ? r.status !== 'COMPLETED' : r.status === tab).sort((a, b) => ORDER[a.status] - ORDER[b.status] || (a.nextDueAt ?? '9').localeCompare(b.nextDueAt ?? '9')), [rows, tab]);
  const count = (s: string) => rows.filter((r) => r.status === s).length;

  async function complete(s: Sched) {
    const hm = prompt(`Mark "${s.description}" on ${s.asset.assetNumber} as completed.\n\nHour meter at time of service${s.currentHours != null ? ` (latest reading: ${s.currentHours} h)` : ''}:`, s.currentHours != null ? String(s.currentHours) : '');
    if (hm === null) return;
    const notes = prompt('Notes (optional):') ?? undefined;
    try { await api(`/maintenance/schedules/${s.id}/complete`, { method: 'POST', body: JSON.stringify({ hourMeter: hm ? Number(hm) : undefined, notes: notes || undefined }) }); load(); } catch (e) { setError((e as Error).message); }
  }
  async function remove(s: Sched) { if (!confirm(`Delete schedule "${s.description}" for ${s.asset.assetNumber}?`)) return; await api(`/maintenance/schedules/${s.id}`, { method: 'DELETE' }); setSel(null); load(); }
  const canWrite = !!matrix && !!can(matrix, me?.role, 'maintenance:write');

  return (
    <Shell title="Maintenance schedule" actions={canWrite ? <button onClick={() => setDrawer(true)} className="btn-primary h-9 text-[13px]"><I.Plus /> New schedule</button> : undefined}>
      <ScheduleDrawer open={drawer} onClose={() => setDrawer(false)} onCreated={load} />
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex border border-line bg-surface">{[['ALL', 'Open'], ['OVERDUE', 'Overdue'], ['DUE_NOW', 'Due now'], ['UPCOMING', 'Upcoming'], ['COMPLETED', 'Completed']].map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`px-3 py-2 text-[12px] font-semibold tracking-wide transition ${tab === k ? (k === 'OVERDUE' ? 'bg-crit text-white' : 'bg-navy-800 text-white') : 'text-muted hover:text-ink'}`}>{l} <span className="tnum opacity-70">{k === 'ALL' ? rows.filter((r) => r.status !== 'COMPLETED').length : count(k)}</span></button>)}</div>
        {count('OVERDUE') > 0 && <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-crit"><I.Alert width={14} height={14} />{count('OVERDUE')} overdue — flagged on all dashboards</span>}
      </div>
      {error && <p className="text-crit text-sm">{error}</p>}
      <div className={`grid gap-6 ${sel ? 'xl:grid-cols-[minmax(0,1fr)_420px]' : ''}`}>
        <section className="card overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead><tr className="text-left eyebrow border-b border-line">{['Asset', 'Service', 'Type', 'Next due', 'Hours', 'Last done', 'Status'].map((h) => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}</tr></thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} onClick={() => setSel(r)} className={`border-b border-line last:border-0 cursor-pointer transition ${sel?.id === r.id ? 'bg-navy-100/70' : r.status === 'OVERDUE' ? 'bg-crit/[.05] hover:bg-crit/[.09]' : 'hover:bg-navy-100/40'}`}>
                  <td className="px-4 py-3"><span className="font-mono text-[13px] font-medium text-navy-800">{r.asset.assetNumber}</span><span className="text-muted ml-2">{r.asset.name}</span></td>
                  <td className="px-4 py-3 font-medium">{r.description}</td>
                  <td className="px-4 py-3 text-muted text-[12px]">{TYPES.find((t) => t[0] === r.serviceType)?.[1]}</td>
                  <td className={`px-4 py-3 tnum ${r.status === 'OVERDUE' ? 'text-crit font-semibold' : ''}`}>{fmtDate(r.nextDueAt)}</td>
                  <td className="px-4 py-3 tnum text-[13px]">{r.nextDueHours != null ? <>at {Number(r.nextDueHours).toLocaleString()} h {r.hoursRemaining != null && <span className={r.hoursRemaining < 0 ? 'text-crit font-semibold' : 'text-muted'}>({r.hoursRemaining < 0 ? `${Math.abs(r.hoursRemaining)} over` : `${r.hoursRemaining} left`})</span>}</> : <span className="text-muted">—</span>}</td>
                  <td className="px-4 py-3 text-muted tnum">{fmtDate(r.lastServiceAt)}</td>
                  <td className="px-4 py-3"><StatusChip status={r.status} /></td>
                </tr>
              ))}
              {!list.length && <tr><td colSpan={7} className="px-5 py-12 text-center text-muted">No schedules here.</td></tr>}
            </tbody>
          </table>
        </section>
        {sel && (
          <aside className="card self-start sticky top-24">
            <header className="p-5 border-b border-line flex items-start justify-between"><div><div className="eyebrow">{TYPES.find((t) => t[0] === sel.serviceType)?.[1]} service</div><div className="font-display font-semibold text-[22px] text-navy-800 leading-tight">{sel.description}</div><div className="font-mono text-[13px] mt-1">{sel.asset.assetNumber} <span className="font-sans text-muted">{sel.asset.name}</span></div></div><div className="flex flex-col items-end gap-2"><StatusChip status={sel.status} /><button onClick={() => setSel(null)} className="btn-ghost text-[12px]">Close</button></div></header>
            <div className="p-5 flex flex-col gap-4 text-[13px]">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1">{([['Interval', [sel.intervalHours && `${sel.intervalHours} h`, sel.intervalDays && `${sel.intervalDays} days`].filter(Boolean).join(' / ') || 'One-off'], ['Next due', fmtDate(sel.nextDueAt)], ['Due at hours', sel.nextDueHours != null ? `${Number(sel.nextDueHours)} h` : '—'], ['Current hours', sel.currentHours != null ? `${sel.currentHours} h` : 'no readings'], ['Last service', fmtDate(sel.lastServiceAt)], ['Last service hours', sel.lastServiceHours != null ? `${Number(sel.lastServiceHours)} h` : '—'], ['Reminder lead', `${sel.reminderLeadDays} days`], ['Est. downtime', sel.estDowntimeHours != null ? `${Number(sel.estDowntimeHours)} h` : '—'], ['Technicians', String(sel.technicianIds.length)]] as [string, string][]).map(([k, v]) => <div key={k} className="flex justify-between border-b border-line py-1"><dt className="text-muted">{k}</dt><dd className="font-medium text-right">{v}</dd></div>)}</dl>
              {sel.notes && <pre className="whitespace-pre-wrap font-sans text-muted border-l-2 border-line pl-3">{sel.notes}</pre>}
              <div className="flex gap-2 pt-2 border-t border-line">
                {sel.status !== 'COMPLETED' && <button onClick={() => complete(sel)} className="btn-primary h-10 flex-1"><I.Check /> Mark completed</button>}
                {canWrite && <button onClick={() => remove(sel)} className="btn-ghost border border-line h-10 text-crit">Delete</button>}
              </div>
            </div>
          </aside>
        )}
      </div>
    </Shell>
  );
}

function ScheduleDrawer({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [assets, setAssets] = useState<Opt[]>([]); const [techs, setTechs] = useState<Opt[]>([]);
  const [f, setF] = useState({ assetId: '', serviceType: 'HR_250', description: 'Engine oil & filter change', intervalHours: '250', intervalDays: '', nextDueAt: '', nextDueHours: '', reminderLeadDays: '3', technicianIds: [] as string[], estDowntimeHours: '', notes: '' });
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { if (!open) return; api<Opt[]>('/assets').then((a) => { setAssets(a); setF((x) => ({ ...x, assetId: x.assetId || a[0]?.id || '' })); }).catch(() => {}); api<Opt[]>('/users/lookup?role=TECHNICIAN').then(setTechs).catch(() => {}); }, [open]);
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  function setType(t: string) { const d = DEFAULTS[t] ?? {}; setF((x) => ({ ...x, serviceType: t, intervalHours: d.hours ? String(d.hours) : '', intervalDays: d.days ? String(d.days) : '' })); }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    const n = (v: string) => (v === '' ? undefined : Number(v));
    try { await api('/maintenance/schedules', { method: 'POST', body: JSON.stringify({ assetId: f.assetId, serviceType: f.serviceType, description: f.description, intervalHours: n(f.intervalHours), intervalDays: n(f.intervalDays), nextDueAt: f.nextDueAt || undefined, nextDueHours: n(f.nextDueHours), reminderLeadDays: Number(f.reminderLeadDays || 3), technicianIds: f.technicianIds, estDowntimeHours: n(f.estDowntimeHours), notes: f.notes || undefined }) }); onCreated(); onClose(); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-navy-900/40 backdrop-blur-[2px]" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="h-full w-full max-w-[520px] bg-surface shadow-card flex flex-col">
        <header className="px-6 py-5 border-b border-line"><div className="eyebrow">Maintenance</div><h2 className="font-display font-semibold text-[26px] text-navy-800">New service schedule</h2><p className="text-[13px] text-muted">Hour-based services are due from the machine’s latest daily-reading hour meter; date-based from the calendar. Reminders go to the assigned technicians and the site supervisor.</p></header>
        <div className="p-6 flex flex-col gap-4 overflow-y-auto flex-1">
          <L label="Asset"><select className="input font-mono" value={f.assetId} onChange={(e) => set('assetId', e.target.value)}>{assets.map((a) => <option key={a.id} value={a.id}>{a.assetNumber} — {a.name}</option>)}</select></L>
          <L label="Service type"><div className="grid grid-cols-3 gap-1">{TYPES.map(([k, l]) => <button type="button" key={k} onClick={() => setType(k)} className={`px-2 py-2 text-[12px] font-semibold border ${f.serviceType === k ? 'bg-navy-800 text-white border-navy-800' : 'border-line hover:border-navy-600'}`}>{l}</button>)}</div></L>
          <L label="Service description"><input className="input" required value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="Engine oil & filter change, greasing…" /></L>
          <div className="grid grid-cols-2 gap-4">
            <L label="Interval (hours)"><input className="input tnum" type="number" min={1} value={f.intervalHours} onChange={(e) => set('intervalHours', e.target.value)} /></L>
            <L label="Interval (days)"><input className="input tnum" type="number" min={1} value={f.intervalDays} onChange={(e) => set('intervalDays', e.target.value)} /></L>
            <L label="Next due date"><input className="input" type="date" value={f.nextDueAt} onChange={(e) => set('nextDueAt', e.target.value)} /></L>
            <L label="Next due at hours"><input className="input tnum" type="number" min={0} value={f.nextDueHours} onChange={(e) => set('nextDueHours', e.target.value)} /></L>
            <L label="Reminder lead (days)"><input className="input tnum" type="number" min={0} max={60} value={f.reminderLeadDays} onChange={(e) => set('reminderLeadDays', e.target.value)} /></L>
            <L label="Est. downtime (h)"><input className="input tnum" type="number" min={0} step="0.5" value={f.estDowntimeHours} onChange={(e) => set('estDowntimeHours', e.target.value)} /></L>
          </div>
          <L label="Assigned technicians"><div className="border border-line max-h-36 overflow-y-auto divide-y divide-line">{techs.map((t) => { const on = f.technicianIds.includes(t.id); return <label key={t.id} className={`flex items-center gap-3 px-3 py-2 text-[14px] cursor-pointer ${on ? 'bg-navy-100/60' : 'hover:bg-canvas'}`}><input type="checkbox" checked={on} onChange={() => set('technicianIds', on ? f.technicianIds.filter((x) => x !== t.id) : [...f.technicianIds, t.id])} /><span className="font-mono text-[13px]">{t.employeeId}</span><span className="text-muted">{t.name}</span></label>; })}{!techs.length && <div className="px-3 py-3 text-[13px] text-muted">No technicians found.</div>}</div></L>
          <L label="Notes / cautions"><textarea className="input min-h-[70px]" value={f.notes} onChange={(e) => set('notes', e.target.value)} /></L>
          {error && <p className="text-[13px] text-crit border-l-2 border-crit pl-3">{error}</p>}
        </div>
        <footer className="px-6 py-4 border-t border-line flex justify-end gap-2"><button type="button" onClick={onClose} className="btn-ghost">Cancel</button><button disabled={busy} className="btn-primary h-10"><I.Plus /> {busy ? 'Saving…' : 'Create schedule'}</button></footer>
      </form>
    </div>
  );
}
function L({ label, children }: { label: string; children: React.ReactNode }) { return <label className="flex flex-col gap-1.5 text-[13px] font-medium">{label}{children}</label>; }
