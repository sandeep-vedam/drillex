'use client';
import { useEffect, useMemo, useState } from 'react';
import { Shell } from '@/components/Shell';
import { StatusChip } from '@/components/StatusChip';
import { I } from '@/components/Icons';
import { api, getUser } from '@/lib/api';
import { useRoleMatrix } from '@/lib/permissions';
import { can } from '@drillex/shared';

type Chem = { id: string; quantity: string; unit: string; purpose?: string; stockOnHand?: string; chemical: { name: string } };
type Report = {
  id: string; date: string; shift: 'DAY' | 'NIGHT'; holeRef: string; startDepth: string; endDepth: string; totalMeters: string; holesCompleted: number; holeDiameterMm: string; rockType: string; penetrationRate: string; downtimeHours: string; downtimeReason?: string;
  status: 'SUBMITTED' | 'APPROVED' | 'UNLOCKED'; submittedAt: string; approvedAt?: string; approvedById?: string;
  asset: { assetNumber: string; name: string }; user: { employeeId: string; name: string }; site: { name: string }; chemicals: Chem[];
};
const TABS = [['ALL', 'All'], ['SUBMITTED', 'Awaiting approval'], ['APPROVED', 'Approved'], ['UNLOCKED', 'Unlocked']] as const;

export default function ShiftReportsPage() {
  const [rows, setRows] = useState<Report[]>([]);
  const [tab, setTab] = useState<string>('ALL');
  const [sel, setSel] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const me = getUser();
  const matrix = useRoleMatrix();
  const load = () => api<Report[]>('/shift-reports').then((r) => { setRows(r); if (sel) setSel(r.find((x) => x.id === sel.id) ?? null); }).catch((e) => setError(e.message));
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const list = useMemo(() => rows.filter((r) => tab === 'ALL' || r.status === tab), [rows, tab]);
  const totals = useMemo(() => ({ m: list.reduce((n, r) => n + Number(r.totalMeters), 0), holes: list.reduce((n, r) => n + r.holesCompleted, 0), down: list.reduce((n, r) => n + Number(r.downtimeHours), 0) }), [list]);

  async function approve(r: Report) { setBusy(true); try { await api(`/shift-reports/${r.id}/approve`, { method: 'POST' }); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  async function unlock(r: Report) {
    const reason = prompt(`Unlock ${r.asset.assetNumber} ${r.shift.toLowerCase()} shift (${new Date(r.date).toLocaleDateString()}) for correction?\n\nReason (recorded in the audit trail):`);
    if (!reason) return; setBusy(true);
    try { await api(`/shift-reports/${r.id}/unlock`, { method: 'POST', body: JSON.stringify({ reason }) }); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const canApprove = !!matrix && !!can(matrix, me?.role, 'shift_report:approve');

  return (
    <Shell title="Shift production">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex border border-line bg-surface">{TABS.map(([k, l]) => { const n = k === 'ALL' ? rows.length : rows.filter((r) => r.status === k).length; return <button key={k} onClick={() => setTab(k)} className={`px-3 py-2 text-[12px] font-semibold tracking-wide transition ${tab === k ? 'bg-navy-800 text-white' : 'text-muted hover:text-ink'}`}>{l} <span className="tnum opacity-70">{n}</span></button>; })}</div>
        <div className="ml-auto flex gap-5 text-[13px] text-muted tnum"><span><b className="text-ink font-semibold">{totals.m.toLocaleString()} m</b> drilled</span><span><b className="text-ink font-semibold">{totals.holes}</b> holes</span><span><b className="text-ink font-semibold">{totals.down} h</b> downtime</span></div>
      </div>
      {error && <p className="text-crit text-sm">{error}</p>}
      <div className={`grid gap-6 ${sel ? 'xl:grid-cols-[minmax(0,1fr)_460px]' : ''}`}>
        <section className="card overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead><tr className="text-left eyebrow border-b border-line">{['Date', 'Shift', 'Asset', 'Driller', 'Hole / block', 'Meters', 'Holes', 'Downtime', 'Status'].map((h) => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}</tr></thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} onClick={() => setSel(r)} className={`border-b border-line last:border-0 cursor-pointer transition ${sel?.id === r.id ? 'bg-navy-100/70' : 'hover:bg-navy-100/40'}`}>
                  <td className="px-4 py-3 tnum whitespace-nowrap">{new Date(r.date).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}</td>
                  <td className="px-4 py-3"><span className={`text-[11px] font-bold tracking-wider px-1.5 py-0.5 ${r.shift === 'DAY' ? 'bg-warn/15 text-warn' : 'bg-navy-100 text-navy-800'}`}>{r.shift}</span></td>
                  <td className="px-4 py-3"><span className="font-mono text-[13px] font-medium text-navy-800">{r.asset.assetNumber}</span><span className="text-muted ml-2">{r.asset.name}</span></td>
                  <td className="px-4 py-3 font-mono text-[13px]">{r.user.employeeId}</td>
                  <td className="px-4 py-3 text-muted">{r.holeRef}</td>
                  <td className="px-4 py-3 tnum font-semibold">{Number(r.totalMeters).toLocaleString()} m</td>
                  <td className="px-4 py-3 tnum">{r.holesCompleted}</td>
                  <td className={`px-4 py-3 tnum ${Number(r.downtimeHours) > 0 ? 'text-hazard font-semibold' : 'text-muted'}`}>{Number(r.downtimeHours)} h</td>
                  <td className="px-4 py-3"><StatusChip status={r.status} /></td>
                </tr>
              ))}
              {!list.length && <tr><td colSpan={9} className="px-5 py-12 text-center text-muted">No shift reports.</td></tr>}
            </tbody>
          </table>
        </section>
        {sel && (
          <aside className="card self-start sticky top-24 flex flex-col">
            <header className="p-5 border-b border-line flex items-start justify-between">
              <div><div className="eyebrow">Shift production report</div><div className="font-mono text-[22px] font-semibold text-navy-800">{sel.asset.assetNumber}</div><div className="text-[14px]">{sel.asset.name} · {sel.site.name}</div><div className="text-[12px] text-muted">{new Date(sel.date).toLocaleDateString()} · {sel.shift === 'DAY' ? 'Day' : 'Night'} shift · {sel.user.employeeId} {sel.user.name}</div></div>
              <div className="flex flex-col items-end gap-2"><StatusChip status={sel.status} /><button onClick={() => setSel(null)} className="btn-ghost text-[12px]">Close</button></div>
            </header>
            <div className="p-5 flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-2 text-center">{[['Total drilled', `${Number(sel.totalMeters)} m`], ['Holes', String(sel.holesCompleted)], ['Penetration', `${Number(sel.penetrationRate)} m/h`]].map(([k, v]) => <div key={k} className="border border-line p-2"><div className="font-display text-[20px] font-semibold tnum">{v}</div><div className="text-[11px] text-muted">{k}</div></div>)}</div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">{([['Hole / block', sel.holeRef], ['Depth', `${Number(sel.startDepth)} → ${Number(sel.endDepth)} m`], ['Diameter', `${Number(sel.holeDiameterMm)} mm`], ['Rock type', sel.rockType], ['Downtime', `${Number(sel.downtimeHours)} h`], ['Reason', sel.downtimeReason ?? '—']] as [string, string][]).map(([k, v]) => <div key={k} className="flex justify-between border-b border-line py-1"><dt className="text-muted">{k}</dt><dd className="font-medium text-right">{v}</dd></div>)}</dl>
              <div><div className="eyebrow mb-1">Chemicals used</div>
                {sel.chemicals.length ? <table className="w-full text-[13px]"><thead><tr className="text-left text-muted"><th className="py-1 font-medium">Chemical</th><th className="py-1 font-medium text-right">Qty</th><th className="py-1 font-medium">Purpose</th><th className="py-1 font-medium text-right">Stock</th></tr></thead><tbody>{sel.chemicals.map((c) => <tr key={c.id} className="border-t border-line"><td className="py-1.5 font-medium">{c.chemical.name}</td><td className="py-1.5 text-right tnum">{Number(c.quantity)} {c.unit.toLowerCase()}</td><td className="py-1.5 text-muted">{c.purpose ?? '—'}</td><td className="py-1.5 text-right tnum text-muted">{c.stockOnHand != null ? Number(c.stockOnHand) : '—'}</td></tr>)}</tbody></table> : <div className="text-[13px] text-muted">None recorded.</div>}
              </div>
              <div className="text-[12px] text-muted">Submitted {new Date(sel.submittedAt).toLocaleString()}{sel.approvedAt && ` · Approved ${new Date(sel.approvedAt).toLocaleString()}`}</div>
              {canApprove && (
                <div className="flex gap-2 pt-2 border-t border-line">
                  {sel.status === 'SUBMITTED' && <button disabled={busy} onClick={() => approve(sel)} className="btn-primary h-10 flex-1"><I.Check /> Approve</button>}
                  {sel.status !== 'UNLOCKED' && <button disabled={busy} onClick={() => unlock(sel)} className="btn-ghost border border-line h-10 flex-1 justify-center">Unlock for correction</button>}
                  {sel.status === 'UNLOCKED' && <div className="text-[13px] text-hazard">Unlocked — waiting for the driller to resubmit.</div>}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </Shell>
  );
}
