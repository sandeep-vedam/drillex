'use client';
import { useEffect, useState } from 'react';
import { Shell } from '@/components/Shell';
import { I } from '@/components/Icons';
import { api, getUser } from '@/lib/api';
import { useRoleMatrix } from '@/lib/permissions';
import { can } from '@drillex/shared';

type Chemical = { id: string; name: string; defaultUnit: 'LITRES' | 'KG' | 'BAGS'; unitCost?: string | null; monthlyBudget?: string | null };
type Draft = { name: string; defaultUnit: Chemical['defaultUnit']; unitCost: string; monthlyBudget: string };
const UNITS: [Chemical['defaultUnit'], string][] = [['LITRES', 'Litres'], ['KG', 'Kilograms'], ['BAGS', 'Bags']];
const EMPTY: Draft = { name: '', defaultUnit: 'LITRES', unitCost: '', monthlyBudget: '' };
const toDraft = (c: Chemical): Draft => ({ name: c.name, defaultUnit: c.defaultUnit, unitCost: c.unitCost != null ? String(Number(c.unitCost)) : '', monthlyBudget: c.monthlyBudget != null ? String(Number(c.monthlyBudget)) : '' });
const toBody = (d: Draft) => ({ name: d.name.trim(), defaultUnit: d.defaultUnit, unitCost: d.unitCost === '' ? null : Number(d.unitCost), monthlyBudget: d.monthlyBudget === '' ? null : Number(d.monthlyBudget) });

/** Chemical master list (SRS §4.3): what drillers pick from when they log chemicals on a shift report. */
export default function ChemicalsPage() {
  const [rows, setRows] = useState<Chemical[]>([]);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const me = getUser(); const matrix = useRoleMatrix(); const canWrite = !!matrix && !!can(matrix, me?.role, 'parts:write');
  const load = () => api<Chemical[]>('/chemicals').then(setRows).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  function edit(c: Chemical | null) { setError(null); setEditing(c ? c.id : 'new'); setDraft(c ? toDraft(c) : EMPTY); }
  async function save() {
    setBusy(true); setError(null);
    try {
      if (editing === 'new') await api('/chemicals', { method: 'POST', body: JSON.stringify(toBody(draft)) });
      else await api(`/chemicals/${editing}`, { method: 'PATCH', body: JSON.stringify(toBody(draft)) });
      setEditing(null); await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const formRow = (key: string) => (
    <tr key={key} className="bg-navy-100/40">
      <td className="px-4 py-2"><input autoFocus className="input h-9" placeholder="e.g. Drilling foam" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></td>
      <td className="px-4 py-2"><select className="input h-9" value={draft.defaultUnit} onChange={(e) => setDraft({ ...draft, defaultUnit: e.target.value as Chemical['defaultUnit'] })}>{UNITS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
      <td className="px-4 py-2"><input className="input h-9 tnum" type="number" min={0} step="0.01" value={draft.unitCost} onChange={(e) => setDraft({ ...draft, unitCost: e.target.value })} /></td>
      <td className="px-4 py-2"><input className="input h-9 tnum" type="number" min={0} step="0.01" value={draft.monthlyBudget} onChange={(e) => setDraft({ ...draft, monthlyBudget: e.target.value })} /></td>
      <td className="px-4 py-2 whitespace-nowrap text-right"><button onClick={() => setEditing(null)} className="btn-ghost h-9 text-[13px]">Cancel</button> <button disabled={busy || draft.name.trim().length < 2} onClick={save} className="btn-primary h-9 text-[13px] disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button></td>
    </tr>
  );

  return (
    <Shell title="Chemicals" actions={canWrite && editing !== 'new' ? <button onClick={() => edit(null)} className="btn-primary h-9 text-[13px]"><I.Plus /> Add chemical</button> : undefined}>
      <p className="text-[13px] text-muted">The list drillers choose from when they record chemicals on a shift report.</p>
      {error && <p className="text-crit text-sm">{error}</p>}
      <section className="card overflow-x-auto">
        <table className="w-full text-[14px]">
          <thead><tr className="text-left eyebrow border-b border-line">{['Chemical', 'Unit', 'Unit cost', 'Monthly budget', ''].map((h) => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}</tr></thead>
          <tbody>
            {editing === 'new' && formRow('new')}
            {rows.map((c) => editing === c.id ? formRow(c.id) : (
              <tr key={c.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 text-muted">{UNITS.find(([k]) => k === c.defaultUnit)?.[1]}</td>
                <td className="px-4 py-3 tnum">{c.unitCost != null ? `$${Number(c.unitCost).toFixed(2)}` : '—'}</td>
                <td className="px-4 py-3 tnum">{c.monthlyBudget != null ? `$${Number(c.monthlyBudget).toFixed(0)}` : '—'}</td>
                <td className="px-4 py-3 text-right">{canWrite && editing === null && <button onClick={() => edit(c)} className="text-navy-600 text-[13px] font-semibold hover:underline">Edit</button>}</td>
              </tr>
            ))}
            {!rows.length && editing !== 'new' && <tr><td colSpan={5} className="px-5 py-12 text-center text-muted">No chemicals yet.</td></tr>}
          </tbody>
        </table>
      </section>
    </Shell>
  );
}
