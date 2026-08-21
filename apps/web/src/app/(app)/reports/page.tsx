'use client';
import { useEffect, useMemo, useState } from 'react';
import { Shell } from '@/components/Shell';
import { I } from '@/components/Icons';
import { api, getUser } from '@/lib/api';

type Kpi = { label: string; value: string | number; hint?: string };
type Section = { title: string; columns: string[]; rows: (string | number | null)[][]; note?: string };
type Doc = { type: string; title: string; subtitle: string; kpis: Kpi[]; sections: Section[] };
type Archived = { id: string; type: string; title: string; periodStart: string; periodEnd: string; generatedAt: string; generatedBy?: string; pdfUrl?: string; xlsxUrl?: string };
const iso = (d: Date) => d.toISOString().slice(0, 10);
const presets = (): [string, string, string][] => { const now = new Date(); const y = now.getFullYear(), m = now.getMonth(); return [['This month', iso(new Date(Date.UTC(y, m, 1))), iso(now)], ['Last month', iso(new Date(Date.UTC(y, m - 1, 1))), iso(new Date(Date.UTC(y, m, 0)))], ['Last 7 days', iso(new Date(now.getTime() - 6 * 864e5)), iso(now)], ['Last 90 days', iso(new Date(now.getTime() - 89 * 864e5)), iso(now)]]; };

export default function ReportsPage() {
  const [types, setTypes] = useState<{ type: string; title: string }[]>([]);
  const [type, setType] = useState(''); const [from, setFrom] = useState(presets()[0][1]); const [to, setTo] = useState(presets()[0][2]);
  const [doc, setDoc] = useState<Doc | null>(null); const [busy, setBusy] = useState<'preview' | 'generate' | null>(null);
  const [archive, setArchive] = useState<Archived[]>([]); const [error, setError] = useState<string | null>(null); const [toast, setToast] = useState<string | null>(null);
  const me = getUser();
  const loadArchive = () => api<Archived[]>('/reports').then(setArchive).catch(() => {});
  useEffect(() => { api<{ type: string; title: string }[]>('/reports/types').then((t) => { setTypes(t); setType((x) => x || t[0]?.type || ''); }).catch((e) => setError(e.message)); loadArchive(); }, []);
  useEffect(() => { if (!type) return; setBusy('preview'); api<Doc>(`/reports/preview?type=${type}&from=${from}&to=${to}`).then(setDoc).catch((e) => setError(e.message)).finally(() => setBusy(null)); }, [type, from, to]);
  async function generate() { setBusy('generate'); setError(null); try { const r = await api<Archived>('/reports/generate', { method: 'POST', body: JSON.stringify({ type, from, to }) }); setToast(`${r.title} generated — PDF and Excel are in the archive below.`); loadArchive(); } catch (e) { setError((e as Error).message); } finally { setBusy(null); } }
  async function email(r: Archived) { const to = prompt(`Email "${r.title}" (${r.periodStart.slice(0, 10)} → ${r.periodEnd.slice(0, 10)}) to — comma-separated addresses:`); if (!to) return; try { const res = await api<{ delivered: boolean }>(`/reports/${r.id}/email`, { method: 'POST', body: JSON.stringify({ to: to.split(',').map((s) => s.trim()) }) }); setToast(res.delivered ? 'Email sent.' : 'Email queued (SMTP not configured on this server — logged only).'); } catch (e) { setError((e as Error).message); } }
  const big = useMemo(() => doc?.sections[0], [doc]);

  return (
    <Shell title="Reports" actions={me?.role !== 'TECHNICIAN' ? <button onClick={generate} disabled={!type || busy === 'generate'} className="btn-primary h-9 text-[13px]"><I.Report /> {busy === 'generate' ? 'Generating…' : 'Generate PDF + Excel'}</button> : undefined}>
      {toast && <div className="card border-l-4 border-l-ok p-3 flex items-center justify-between text-[14px]"><span>{toast}</span><button onClick={() => setToast(null)} className="btn-ghost text-[12px]">Dismiss</button></div>}
      {error && <p className="text-crit text-sm">{error}</p>}
      <div className="grid xl:grid-cols-[260px_minmax(0,1fr)] gap-6">
        <aside className="flex flex-col gap-4 self-start xl:sticky xl:top-24">
          <div className="card p-2">{types.map((t) => <button key={t.type} onClick={() => setType(t.type)} className={`w-full text-left px-3 py-2.5 text-[14px] border-l-2 transition ${type === t.type ? 'border-hazard bg-navy-100/60 font-semibold text-navy-800' : 'border-transparent hover:bg-canvas'}`}>{t.title.replace(' Report', '')}</button>)}</div>
          <div className="card p-4 flex flex-col gap-3">
            <div className="eyebrow">Period</div>
            <div className="grid grid-cols-2 gap-1">{presets().map(([l, f, t]) => <button key={l} onClick={() => { setFrom(f); setTo(t); }} className={`px-2 py-1.5 text-[12px] font-semibold border ${from === f && to === t ? 'bg-navy-800 text-white border-navy-800' : 'border-line hover:border-navy-600'}`}>{l}</button>)}</div>
            <label className="flex flex-col gap-1 text-[12px] font-medium">From<input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="flex flex-col gap-1 text-[12px] font-medium">To<input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
        </aside>
        <div className="flex flex-col gap-6 min-w-0">
          {doc && (
            <>
              <div><div className="eyebrow">{doc.subtitle}{busy === 'preview' ? ' · refreshing…' : ''}</div><h2 className="font-display font-semibold text-[28px] text-navy-800 leading-tight">{doc.title}</h2></div>
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">{doc.kpis.map((k) => <div key={k.label} className="card p-4 relative overflow-hidden"><div className="absolute left-0 top-0 h-full w-1 bg-navy-600" /><div className="eyebrow">{k.label}</div><div className="font-display text-[30px] font-semibold tnum leading-none mt-2">{k.value}</div>{k.hint && <div className="text-[12px] text-muted mt-1">{k.hint}</div>}</div>)}</div>
              {big && big.rows.length > 0 && typeof big.rows[0][2] === 'number' && <Bars section={big} />}
              {doc.sections.map((s) => (
                <section key={s.title} className="card">
                  <header className="px-5 py-3 border-b border-line flex items-baseline justify-between"><h3 className="font-display font-semibold text-[18px] text-navy-800">{s.title}</h3><span className="text-[12px] text-muted tnum">{s.rows.length} rows</span></header>
                  <div className="overflow-x-auto"><table className="w-full text-[13px]"><thead><tr className="text-left eyebrow border-b border-line">{s.columns.map((c) => <th key={c} className="px-4 py-2 font-semibold whitespace-nowrap">{c}</th>)}</tr></thead><tbody>{s.rows.map((r, i) => <tr key={i} className="border-b border-line last:border-0">{r.map((v, j) => <td key={j} className={`px-4 py-2 ${typeof v === 'number' ? 'tnum text-right' : ''} ${j === 0 ? 'font-mono text-[12px] font-medium' : ''}`}>{v == null ? '—' : String(v)}</td>)}</tr>)}{!s.rows.length && <tr><td colSpan={s.columns.length} className="px-4 py-6 text-center text-muted">No data for this period.</td></tr>}</tbody></table></div>
                  {s.note && <div className="px-5 py-2 text-[12px] text-muted border-t border-line">{s.note}</div>}
                </section>
              ))}
            </>
          )}
          <section className="card">
            <header className="px-5 py-4 border-b border-line flex items-center justify-between"><h3 className="font-display font-semibold text-[20px] text-navy-800">Archive</h3><span className="text-[12px] text-muted">Generated files are kept for at least 24 months · month-end reports are produced automatically</span></header>
            <table className="w-full text-[14px]"><tbody>
              {archive.map((r) => <tr key={r.id} className="border-b border-line last:border-0"><td className="px-5 py-2.5 font-medium">{r.title}</td><td className="px-5 py-2.5 tnum text-muted whitespace-nowrap">{r.periodStart.slice(0, 10)} → {r.periodEnd.slice(0, 10)}</td><td className="px-5 py-2.5 text-[12px] text-muted whitespace-nowrap">{new Date(r.generatedAt).toLocaleString()} · {r.generatedBy}</td><td className="px-5 py-2.5 text-right whitespace-nowrap">{r.pdfUrl && <a href={r.pdfUrl} target="_blank" rel="noreferrer" className="btn-ghost text-[12px]">PDF</a>}{r.xlsxUrl && <a href={r.xlsxUrl} target="_blank" rel="noreferrer" className="btn-ghost text-[12px]">Excel</a>}<button onClick={() => email(r)} className="btn-ghost text-[12px]">Email</button></td></tr>)}
              {!archive.length && <tr><td className="px-5 py-8 text-center text-muted">Nothing generated yet — use “Generate PDF + Excel”.</td></tr>}
            </tbody></table>
          </section>
        </div>
      </div>
    </Shell>
  );
}
/** Simple inline bar chart of the first numeric column of the first section (e.g. meters per machine). */
function Bars({ section }: { section: Section }) {
  const ci = section.columns.findIndex((_, i) => typeof section.rows[0][i] === 'number'); if (ci < 0) return null;
  const rows = section.rows.slice(0, 12); const max = Math.max(...rows.map((r) => Number(r[ci]) || 0), 1);
  return (
    <section className="card p-5"><div className="eyebrow mb-3">{section.columns[ci]} — {section.title.toLowerCase()}</div>
      <div className="flex flex-col gap-1.5">{rows.map((r, i) => <div key={i} className="grid grid-cols-[140px_minmax(0,1fr)_70px] items-center gap-3 text-[13px]"><span className="font-mono truncate">{String(r[0])}</span><div className="h-4 bg-line"><div className="h-4 bg-navy-600" style={{ width: `${(Number(r[ci]) / max) * 100}%` }} /></div><span className="tnum text-right font-semibold">{Number(r[ci]).toLocaleString()}</span></div>)}</div>
    </section>
  );
}
