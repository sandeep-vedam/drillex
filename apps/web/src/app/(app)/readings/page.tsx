'use client';
import { useEffect, useMemo, useState } from 'react';
import { Shell } from '@/components/Shell';
import { I } from '@/components/Icons';
import { api } from '@/lib/api';
import { CHECK_LABELS, CRITICAL_ANSWERS, DEFAULT_ALERT_THRESHOLD, readingFlags, WARN_ANSWERS } from '@drillex/shared';

type Reading = {
  id: string; date: string; formType: 'LEGACY' | 'RIG' | 'PLANT';
  hourMeter: string | null; fuelStart: string | null; fuelEnd: string | null; fuelConsumed: string | null;
  engineOil: string | null; hydraulicOil: string | null; coolant: string | null; airFilter: string | null; battery: string | null; tyrePressures: Record<string, number>;
  gearOil: string | null; flushPump: string | null; fuelLevel: string | null; rodCondition: string | null; bitCondition: string | null; brakeFluid: string | null;
  trackCondition: string | null; tyreCondition: string | null; attachmentCondition: string | null; lights: string | null; brakes: string | null;
  startReading: string | null; endReading: string | null; usage: string | null; fuelAdded: string | null; faults: string | null;
  warningLights: boolean; warningLightsNote?: string; unusualNoises: boolean; unusualNoisesNote?: string; leaks: boolean; leaksNote?: string;
  preStartChecklistDone: boolean | null; conditionRating: number; notes?: string; createdAt: string;
  supervisorReason: string | null; enteredBy: { employeeId: string; name: string } | null;
  asset: { assetNumber: string; name: string }; user: { employeeId: string; name: string };
};
const FORM: Record<Reading['formType'], string> = { RIG: 'Rig check', PLANT: 'Machine readings', LEGACY: 'Daily reading' };
const RIG_KEYS = ['engineOil', 'hydraulicOil', 'coolant', 'gearOil', 'flushPump', 'rodCondition', 'bitCondition'] as const;
const PLANT_KEYS = ['coolant', 'engineOil', 'gearOil', 'hydraulicOil', 'brakeFluid', 'fuelLevel', 'trackCondition', 'tyreCondition', 'attachmentCondition', 'lights', 'brakes'] as const;
const tone = (v: string | null) => (!v ? '' : CRITICAL_ANSWERS.includes(v) || v === 'CHANGE_REQUIRED' || v === 'BLOCKED' ? 'text-crit' : WARN_ANSWERS.includes(v) || v === 'ADD' || v === 'WEAK' ? 'text-hazard' : v === 'NA' ? 'text-muted' : 'text-ok');
const fmt = (s: string | null) => (s == null ? '—' : s === 'NA' ? 'N/A' : s === 'OK' ? 'OK' : s.replace('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()));
const n = (v: string | null) => (v == null ? '—' : Number(v).toLocaleString());
const checkKeys = (r: Reading) => (r.formType === 'RIG' ? RIG_KEYS : r.formType === 'PLANT' ? PLANT_KEYS : (['engineOil', 'hydraulicOil', 'coolant'] as const));
const flagsOf = (r: Reading, threshold: number) => [...readingFlags(r), ...(r.conditionRating <= threshold ? ['Poor condition'] : [])];

function Stars({ n }: { n: number }) { return <span className={`font-mono text-[12px] ${n <= 2 ? 'text-crit' : n === 3 ? 'text-hazard' : 'text-ok'}`}>{'★'.repeat(n)}{'☆'.repeat(5 - n)}</span>; }
function Flag({ on, label, note }: { on: boolean; label: string; note?: string }) {
  return <div className={`flex items-start gap-2 border px-3 py-2 ${on ? 'border-crit/40 bg-crit/5' : 'border-line'}`}><span className={`mt-1 h-2 w-2 ${on ? 'bg-crit' : 'bg-ok'}`} /><div className="text-[13px]"><div className="font-semibold">{label}: {on ? 'YES' : 'No'}</div>{on && note && <div className="text-muted">{note}</div>}</div></div>;
}
function Tiles({ items }: { items: [string, string][] }) {
  return <div className="grid grid-cols-3 gap-2 text-center">{items.map(([k, v]) => <div key={k} className="border border-line p-2"><div className="font-display text-[18px] font-semibold tnum">{v}</div><div className="text-[11px] text-muted">{k}</div></div>)}</div>;
}
/** What the reading measured: meter and fuel for the original form, usage for plant machines; a rig check has none. */
function meterCell(r: Reading) {
  if (r.formType === 'PLANT') return `${n(r.usage)} h/km`;
  if (r.formType === 'LEGACY') return `${n(r.hourMeter)} h · ${n(r.fuelConsumed)} L`;
  return '—';
}

export default function ReadingsPage() {
  const [rows, setRows] = useState<Reading[]>([]);
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Reading | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [atts, setAtts] = useState<{ id: string; kind: string; url: string }[]>([]);
  const [threshold, setThreshold] = useState(DEFAULT_ALERT_THRESHOLD); // the server's alert rule (SRS §5.3), admin-configurable
  useEffect(() => { api<{ readingAlertThreshold: number }>('/settings/operations').then((s) => setThreshold(s.readingAlertThreshold)).catch(() => {}); }, []);
  useEffect(() => { if (!sel) { setAtts([]); return; } api<{ attachments: { id: string; kind: string; url: string }[] }>(`/daily-readings/${sel.id}`).then((d) => setAtts(d.attachments ?? [])).catch(() => setAtts([])); }, [sel]);
  useEffect(() => { api<Reading[]>(`/daily-readings${onlyFlagged ? '?flagged=1' : ''}`).then(setRows).catch((e) => setError(e.message)); }, [onlyFlagged]);
  const list = useMemo(() => rows.filter((r) => `${r.asset.assetNumber} ${r.asset.name} ${r.user.employeeId} ${r.enteredBy?.employeeId ?? ''}`.toLowerCase().includes(q.toLowerCase())), [rows, q]);
  const nFlag = rows.filter((r) => flagsOf(r, threshold).length).length;

  return (
    <Shell title="Machine checks">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative flex-1 min-w-[240px] max-w-md"><I.Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input className="input pl-10" placeholder="Search asset or operator…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <button onClick={() => setOnlyFlagged((v) => !v)} className={`inline-flex items-center gap-2 px-3 py-2 text-[13px] font-semibold border transition ${onlyFlagged ? 'bg-crit text-white border-crit' : 'bg-surface border-line text-ink hover:border-crit/50'}`}><I.Alert /> Flagged only {nFlag ? <span className="tnum">({nFlag})</span> : null}</button>
        <div className="ml-auto text-[13px] text-muted tnum">{list.length} readings</div>
      </div>
      {error && <p className="text-crit text-sm">{error}</p>}
      <div className={`grid gap-6 ${sel ? 'xl:grid-cols-[minmax(0,1fr)_440px]' : ''}`}>
        <section className="card overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead><tr className="text-left eyebrow border-b border-line">{['Date', 'Asset', 'Operator', 'Form', 'Meter', 'Checks', 'Condition', 'Flags'].map((h) => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}</tr></thead>
            <tbody>
              {list.map((r) => {
                const flags = flagsOf(r, threshold);
                const notOk = checkKeys(r).filter((k) => r[k] && r[k] !== 'OK' && r[k] !== 'GOOD' && r[k] !== 'NA');
                return (
                  <tr key={r.id} onClick={() => setSel(r)} className={`border-b border-line last:border-0 cursor-pointer transition ${sel?.id === r.id ? 'bg-navy-100/70' : flags.length ? 'bg-crit/[.04] hover:bg-crit/[.08]' : 'hover:bg-navy-100/40'}`}>
                    <td className="px-4 py-3 tnum whitespace-nowrap">{new Date(r.date).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}</td>
                    <td className="px-4 py-3"><span className="font-mono text-[13px] font-medium text-navy-800">{r.asset.assetNumber}</span><span className="text-muted ml-2">{r.asset.name}</span></td>
                    <td className="px-4 py-3 font-mono text-[13px] whitespace-nowrap">{r.user.employeeId}{r.enteredBy && <span title={`Entered by supervisor ${r.enteredBy.employeeId}: ${r.supervisorReason ?? ''}`} className="ml-1.5 bg-supervisor/20 text-ink px-1.5 py-0.5 text-[11px] font-sans font-bold">SUP</span>}</td>
                    <td className="px-4 py-3 text-[13px] whitespace-nowrap">{FORM[r.formType]}</td>
                    <td className="px-4 py-3 tnum whitespace-nowrap">{meterCell(r)}</td>
                    <td className="px-4 py-3 text-[12px]">{notOk.length ? notOk.map((k) => <span key={k} className={`mr-2 font-semibold whitespace-nowrap ${tone(r[k])}`}>{CHECK_LABELS[k]} {fmt(r[k])}</span>) : <span className="text-ok font-semibold">All OK</span>}</td>
                    <td className="px-4 py-3"><Stars n={r.conditionRating} /></td>
                    <td className="px-4 py-3">{flags.length ? <span className="inline-flex items-center gap-1 text-[12px] font-bold text-crit"><I.Alert width={14} height={14} />{flags.join(' · ')}</span> : <span className="text-[12px] text-ok font-semibold">Clear</span>}</td>
                  </tr>
                );
              })}
              {!list.length && <tr><td colSpan={8} className="px-5 py-12 text-center text-muted">No readings yet.</td></tr>}
            </tbody>
          </table>
        </section>
        {sel && (
          <aside className="card p-5 self-start sticky top-24 flex flex-col gap-4">
            <div className="flex items-start justify-between"><div><div className="eyebrow">{FORM[sel.formType]}</div><div className="font-mono text-[22px] font-semibold text-navy-800">{sel.asset.assetNumber}</div><div className="text-[14px]">{sel.asset.name} · {new Date(sel.date).toLocaleDateString()}</div><div className="text-[12px] text-muted">by {sel.user.employeeId} {sel.user.name} · {new Date(sel.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div></div><button onClick={() => setSel(null)} className="btn-ghost">✕</button></div>
            {sel.enteredBy && <div className="border-l-4 border-supervisor bg-supervisor/10 px-3 py-2 text-[13px]"><div className="font-semibold">Entered by supervisor {sel.enteredBy.employeeId} — {sel.enteredBy.name}</div>{sel.supervisorReason && <div className="text-muted">{sel.supervisorReason}</div>}</div>}
            {sel.formType === 'LEGACY' && <Tiles items={[['Hour meter', `${n(sel.hourMeter)} h`], ['Fuel start → end', `${n(sel.fuelStart)} → ${n(sel.fuelEnd)}`], ['Consumed', n(sel.fuelConsumed)]]} />}
            {sel.formType === 'PLANT' && <Tiles items={[['Start → end', `${n(sel.startReading)} → ${n(sel.endReading)}`], ['This shift', `${n(sel.usage)} h/km`], ['Fuel added', sel.fuelAdded != null ? `${n(sel.fuelAdded)} L` : '—']]} />}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
              {([...checkKeys(sel).map((k) => [CHECK_LABELS[k], sel[k]] as [string, string | null]),
                ...(sel.formType === 'LEGACY' ? ([['Air filter', sel.airFilter], ['Battery', sel.battery], ['Pre-start checklist', sel.preStartChecklistDone ? 'Done' : 'NOT DONE']] as [string, string | null][]) : [])]
              ).map(([k, v]) => <div key={k} className="flex justify-between gap-2 border-b border-line py-1"><dt className="text-muted">{k}</dt><dd className={`font-semibold text-right ${v === 'NOT DONE' ? 'text-crit' : tone(v)}`}>{fmt(v)}</dd></div>)}
            </dl>
            {Object.keys(sel.tyrePressures ?? {}).length > 0 && <div><div className="eyebrow mb-1">Tyre pressures</div><div className="flex flex-wrap gap-1.5">{Object.entries(sel.tyrePressures).map(([k, v]) => <span key={k} className="border border-line px-2 py-0.5 text-[12px] font-mono">{k}: {v}</span>)}</div></div>}
            <div className="flex flex-col gap-1.5"><Flag on={sel.warningLights} label="Warning lights" note={sel.warningLightsNote} /><Flag on={sel.leaks} label="Leaks" note={sel.leaksNote} /><Flag on={sel.unusualNoises} label="Unusual noises / vibration" note={sel.unusualNoisesNote} /></div>
            <div className="flex items-center justify-between"><span className="text-[13px] text-muted">Machine condition</span><Stars n={sel.conditionRating} /></div>
            {(sel.faults || sel.notes) && <div className="text-[13px] border-l-2 border-line pl-3"><div className="eyebrow mb-0.5">{sel.faults ? 'Faults / defects' : 'Notes'}</div><div className="text-muted whitespace-pre-wrap">{sel.faults ?? sel.notes}</div></div>}
            {atts.some((a) => a.kind === 'PHOTO') && <div><div className="eyebrow mb-1">Photos</div><div className="flex flex-wrap gap-2">{atts.filter((a) => a.kind === 'PHOTO').map((a) => <a key={a.id} href={a.url} target="_blank" rel="noreferrer"><img src={a.url} alt="Reading photo" className="h-20 w-20 object-cover border border-line" /></a>)}</div></div>}
            {atts.filter((a) => a.kind === 'SIGNATURE').map((a) => <div key={a.id}><div className="eyebrow mb-1">Signature</div><img src={a.url} alt="Signature" className="h-16 border border-line bg-white" /></div>)}
          </aside>
        )}
      </div>
    </Shell>
  );
}
