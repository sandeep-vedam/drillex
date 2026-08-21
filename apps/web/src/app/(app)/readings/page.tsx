'use client';
import { useEffect, useMemo, useState } from 'react';
import { Shell } from '@/components/Shell';
import { I } from '@/components/Icons';
import { api } from '@/lib/api';

type Reading = {
  id: string; date: string; hourMeter: string; fuelStart: string; fuelEnd: string; fuelConsumed: string;
  engineOil: string; hydraulicOil: string; coolant: string; airFilter: string; battery: string; tyrePressures: Record<string, number>;
  warningLights: boolean; warningLightsNote?: string; unusualNoises: boolean; unusualNoisesNote?: string; leaks: boolean; leaksNote?: string;
  preStartChecklistDone: boolean; conditionRating: number; notes?: string; createdAt: string;
  asset: { assetNumber: string; name: string }; user: { employeeId: string; name: string };
};
const LEVEL_TONE: Record<string, string> = { OK: 'text-ok', LOW: 'text-hazard', ADD: 'text-hazard', CHANGE_REQUIRED: 'text-crit', BLOCKED: 'text-crit', CHANGED: 'text-ok', WEAK: 'text-hazard', FLAT: 'text-crit' };
const fmt = (s: string) => s.replace('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
const flagged = (r: Reading) => r.warningLights || r.leaks || r.unusualNoises || r.conditionRating <= 2;

function Stars({ n }: { n: number }) { return <span className={`font-mono text-[12px] ${n <= 2 ? 'text-crit' : n === 3 ? 'text-hazard' : 'text-ok'}`}>{'★'.repeat(n)}{'☆'.repeat(5 - n)}</span>; }
function Flag({ on, label, note }: { on: boolean; label: string; note?: string }) {
  return <div className={`flex items-start gap-2 border px-3 py-2 ${on ? 'border-crit/40 bg-crit/5' : 'border-line'}`}><span className={`mt-1 h-2 w-2 ${on ? 'bg-crit' : 'bg-ok'}`} /><div className="text-[13px]"><div className="font-semibold">{label}: {on ? 'YES' : 'No'}</div>{on && note && <div className="text-muted">{note}</div>}</div></div>;
}

export default function ReadingsPage() {
  const [rows, setRows] = useState<Reading[]>([]);
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Reading | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [atts, setAtts] = useState<{ id: string; kind: string; url: string }[]>([]);
  useEffect(() => { if (!sel) { setAtts([]); return; } api<{ attachments: { id: string; kind: string; url: string }[] }>(`/daily-readings/${sel.id}`).then((d) => setAtts(d.attachments ?? [])).catch(() => setAtts([])); }, [sel]);
  useEffect(() => { api<Reading[]>(`/daily-readings${onlyFlagged ? '?flagged=1' : ''}`).then(setRows).catch((e) => setError(e.message)); }, [onlyFlagged]);
  const list = useMemo(() => rows.filter((r) => `${r.asset.assetNumber} ${r.asset.name} ${r.user.employeeId}`.toLowerCase().includes(q.toLowerCase())), [rows, q]);
  const nFlag = rows.filter(flagged).length;

  return (
    <Shell title="Daily readings">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative flex-1 min-w-[240px] max-w-md"><I.Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input className="input pl-10" placeholder="Search asset or operator…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <button onClick={() => setOnlyFlagged((v) => !v)} className={`inline-flex items-center gap-2 px-3 py-2 text-[13px] font-semibold border transition ${onlyFlagged ? 'bg-crit text-white border-crit' : 'bg-surface border-line text-ink hover:border-crit/50'}`}><I.Alert /> Flagged only {nFlag ? <span className="tnum">({nFlag})</span> : null}</button>
        <div className="ml-auto text-[13px] text-muted tnum">{list.length} readings</div>
      </div>
      {error && <p className="text-crit text-sm">{error}</p>}
      <div className={`grid gap-6 ${sel ? 'xl:grid-cols-[minmax(0,1fr)_440px]' : ''}`}>
        <section className="card overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead><tr className="text-left eyebrow border-b border-line">{['Date', 'Asset', 'Operator', 'Hour meter', 'Fuel used', 'Fluids', 'Condition', 'Flags'].map((h) => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}</tr></thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} onClick={() => setSel(r)} className={`border-b border-line last:border-0 cursor-pointer transition ${sel?.id === r.id ? 'bg-navy-100/70' : flagged(r) ? 'bg-crit/[.04] hover:bg-crit/[.08]' : 'hover:bg-navy-100/40'}`}>
                  <td className="px-4 py-3 tnum whitespace-nowrap">{new Date(r.date).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}</td>
                  <td className="px-4 py-3"><span className="font-mono text-[13px] font-medium text-navy-800">{r.asset.assetNumber}</span><span className="text-muted ml-2">{r.asset.name}</span></td>
                  <td className="px-4 py-3 font-mono text-[13px]">{r.user.employeeId}</td>
                  <td className="px-4 py-3 tnum">{Number(r.hourMeter).toLocaleString()} h</td>
                  <td className="px-4 py-3 tnum">{Number(r.fuelConsumed)}</td>
                  <td className="px-4 py-3 text-[12px] whitespace-nowrap">{(['engineOil', 'hydraulicOil', 'coolant'] as const).map((k) => <span key={k} className={`mr-2 font-semibold ${LEVEL_TONE[r[k]] ?? ''}`}>{k === 'engineOil' ? 'Eng' : k === 'hydraulicOil' ? 'Hyd' : 'Cool'} {r[k] === 'OK' ? '✓' : fmt(r[k])}</span>)}</td>
                  <td className="px-4 py-3"><Stars n={r.conditionRating} /></td>
                  <td className="px-4 py-3">{flagged(r) ? <span className="inline-flex items-center gap-1 text-[12px] font-bold text-crit"><I.Alert width={14} height={14} />{[r.warningLights && 'Lights', r.leaks && 'Leak', r.unusualNoises && 'Noise', r.conditionRating <= 2 && 'Poor'].filter(Boolean).join(' · ')}</span> : <span className="text-[12px] text-ok font-semibold">Clear</span>}</td>
                </tr>
              ))}
              {!list.length && <tr><td colSpan={8} className="px-5 py-12 text-center text-muted">No readings yet.</td></tr>}
            </tbody>
          </table>
        </section>
        {sel && (
          <aside className="card p-5 self-start sticky top-24 flex flex-col gap-4">
            <div className="flex items-start justify-between"><div><div className="eyebrow">Daily reading</div><div className="font-mono text-[22px] font-semibold text-navy-800">{sel.asset.assetNumber}</div><div className="text-[14px]">{sel.asset.name} · {new Date(sel.date).toLocaleDateString()}</div><div className="text-[12px] text-muted">by {sel.user.employeeId} {sel.user.name} · {new Date(sel.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div></div><button onClick={() => setSel(null)} className="btn-ghost">✕</button></div>
            <div className="grid grid-cols-3 gap-2 text-center">{[['Hour meter', `${Number(sel.hourMeter).toLocaleString()} h`], ['Fuel start → end', `${Number(sel.fuelStart)} → ${Number(sel.fuelEnd)}`], ['Consumed', `${Number(sel.fuelConsumed)}`]].map(([k, v]) => <div key={k} className="border border-line p-2"><div className="font-display text-[18px] font-semibold tnum">{v}</div><div className="text-[11px] text-muted">{k}</div></div>)}</div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">{([['Engine oil', sel.engineOil], ['Hydraulic oil', sel.hydraulicOil], ['Coolant', sel.coolant], ['Air filter', sel.airFilter], ['Battery', sel.battery], ['Pre-start checklist', sel.preStartChecklistDone ? 'Done' : 'NOT DONE']] as [string, string][]).map(([k, v]) => <div key={k} className="flex justify-between border-b border-line py-1"><dt className="text-muted">{k}</dt><dd className={`font-semibold ${LEVEL_TONE[v] ?? (v === 'NOT DONE' ? 'text-crit' : '')}`}>{fmt(v)}</dd></div>)}</dl>
            {Object.keys(sel.tyrePressures ?? {}).length > 0 && <div><div className="eyebrow mb-1">Tyre pressures</div><div className="flex flex-wrap gap-1.5">{Object.entries(sel.tyrePressures).map(([k, v]) => <span key={k} className="border border-line px-2 py-0.5 text-[12px] font-mono">{k}: {v}</span>)}</div></div>}
            <div className="flex flex-col gap-1.5"><Flag on={sel.warningLights} label="Warning lights" note={sel.warningLightsNote} /><Flag on={sel.leaks} label="Leaks" note={sel.leaksNote} /><Flag on={sel.unusualNoises} label="Unusual noises / vibration" note={sel.unusualNoisesNote} /></div>
            <div className="flex items-center justify-between"><span className="text-[13px] text-muted">Machine condition</span><Stars n={sel.conditionRating} /></div>
            {sel.notes && <div className="text-[13px] border-l-2 border-line pl-3 text-muted">“{sel.notes}”</div>}
            {atts.some((a) => a.kind === 'PHOTO') && <div><div className="eyebrow mb-1">Photos</div><div className="flex flex-wrap gap-2">{atts.filter((a) => a.kind === 'PHOTO').map((a) => <a key={a.id} href={a.url} target="_blank" rel="noreferrer"><img src={a.url} alt="Reading photo" className="h-20 w-20 object-cover border border-line" /></a>)}</div></div>}
            {atts.filter((a) => a.kind === 'SIGNATURE').map((a) => <div key={a.id}><div className="eyebrow mb-1">Operator signature</div><img src={a.url} alt="Operator signature" className="h-16 border border-line bg-white" /></div>)}
          </aside>
        )}
      </div>
    </Shell>
  );
}
