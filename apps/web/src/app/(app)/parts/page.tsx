'use client';
import { useEffect, useMemo, useState } from 'react';
import { Shell } from '@/components/Shell';
import { I } from '@/components/Icons';
import { api, getUser } from '@/lib/api';
import { useRoleMatrix } from '@/lib/permissions';
import { can } from '@drillex/shared';

type Part = { id: string; partNo: string; name: string; qtyOnHand: number; minQty: number; unitCost?: string };
type PR = { id: string; quantity: number; status: string; requestedBy: string; notes?: string; createdAt: string; part: Part };
type Move = { id: string; type: string; quantity: number; reference?: string; createdAt: string };

export default function PartsPage() {
  const [parts, setParts] = useState<Part[]>([]);
  const [prs, setPrs] = useState<PR[]>([]);
  const [q, setQ] = useState(''); const [lowOnly, setLowOnly] = useState(false);
  const [sel, setSel] = useState<Part | null>(null); const [moves, setMoves] = useState<Move[]>([]);
  const [newPart, setNewPart] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const me = getUser(); const matrix = useRoleMatrix(); const canWrite = !!matrix && !!can(matrix, me?.role, 'parts:write');
  const load = () => Promise.all([api<Part[]>('/parts').then(setParts), api<PR[]>('/parts/purchase-requests/all').then(setPrs)]).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  useEffect(() => { if (sel) api<Move[]>(`/parts/${sel.id}/movements`).then(setMoves).catch(() => setMoves([])); }, [sel]);
  const rows = useMemo(() => parts.filter((p) => (!lowOnly || p.qtyOnHand < p.minQty) && `${p.partNo} ${p.name}`.toLowerCase().includes(q.toLowerCase())), [parts, q, lowOnly]);
  const low = parts.filter((p) => p.qtyOnHand < p.minQty).length;
  const value = parts.reduce((n, p) => n + p.qtyOnHand * Number(p.unitCost ?? 0), 0);

  async function move(p: Part, type: 'IN' | 'OUT' | 'ADJUST') {
    const qty = prompt(type === 'IN' ? `Receive stock for ${p.partNo} — quantity:` : type === 'OUT' ? `Issue stock for ${p.partNo} — quantity:` : `Stock-take adjustment for ${p.partNo} (± quantity):`); if (!qty) return;
    const ref = prompt('Reference (delivery note, job no., stock-take):') ?? undefined;
    try { const upd = await api<Part>(`/parts/${p.id}/movements`, { method: 'POST', body: JSON.stringify({ type, quantity: Number(qty), reference: ref }) }); await load(); setSel(upd); } catch (e) { setError((e as Error).message); }
  }
  async function raise(p: Part) {
    const qty = prompt(`Raise purchase request for ${p.partNo} ${p.name} — quantity:`, String(Math.max(p.minQty * 2 - p.qtyOnHand, 1))); if (!qty) return;
    const notes = prompt('Notes (supplier, urgency):') ?? undefined;
    try { await api('/parts/purchase-requests', { method: 'POST', body: JSON.stringify({ partId: p.id, quantity: Number(qty), notes }) }); load(); } catch (e) { setError((e as Error).message); }
  }
  async function prStatus(pr: PR, status: string) { try { await api(`/parts/purchase-requests/${pr.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); load(); } catch (e) { setError((e as Error).message); } }

  return (
    <Shell title="Parts inventory" actions={canWrite ? <button onClick={() => setNewPart(true)} className="btn-primary h-9 text-[13px]"><I.Plus /> New part</button> : undefined}>
      {newPart && <NewPartDrawer onClose={() => setNewPart(false)} onCreated={load} />}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[['Part lines', parts.length, ''], ['Below minimum', low, low ? 'crit' : 'ok'], ['Open purchase requests', prs.filter((p) => p.status === 'OPEN' || p.status === 'ORDERED').length, ''], ['Stock value', `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, '']].map(([k, v, t]) => <div key={k as string} className="card p-4 relative overflow-hidden"><div className={`absolute left-0 top-0 h-full w-1 ${t === 'crit' ? 'bg-crit' : t === 'ok' ? 'bg-ok' : 'bg-navy-600'}`} /><div className="eyebrow">{k}</div><div className="font-display text-[32px] font-semibold tnum leading-none mt-2">{v}</div></div>)}
      </div>
      {error && <p className="text-crit text-sm">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative flex-1 min-w-[240px] max-w-md"><I.Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input className="input pl-10" placeholder="Search part number or name…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <button onClick={() => setLowOnly((v) => !v)} className={`inline-flex items-center gap-2 px-3 py-2 text-[13px] font-semibold border transition ${lowOnly ? 'bg-crit text-white border-crit' : 'bg-surface border-line hover:border-crit/50'}`}><I.Alert /> Low stock only {low ? `(${low})` : ''}</button>
      </div>
      <div className={`grid gap-6 ${sel ? 'xl:grid-cols-[minmax(0,1fr)_400px]' : ''}`}>
        <div className="flex flex-col gap-6">
          <section className="card overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead><tr className="text-left eyebrow border-b border-line">{['Part no.', 'Name', 'On hand', 'Minimum', 'Unit cost', 'Level', ''].map((h, i) => <th key={i} className="px-4 py-2.5 font-semibold">{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((p) => { const lowP = p.qtyOnHand < p.minQty; const pct = p.minQty ? Math.min(100, Math.round((p.qtyOnHand / (p.minQty * 2)) * 100)) : 100; return (
                  <tr key={p.id} onClick={() => setSel(p)} className={`border-b border-line last:border-0 cursor-pointer transition ${sel?.id === p.id ? 'bg-navy-100/70' : lowP ? 'bg-crit/[.04] hover:bg-crit/[.08]' : 'hover:bg-navy-100/40'}`}>
                    <td className="px-4 py-3 font-mono text-[13px] font-medium text-navy-800 whitespace-nowrap">{p.partNo}</td>
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className={`px-4 py-3 tnum font-semibold ${lowP ? 'text-crit' : ''}`}>{p.qtyOnHand}</td>
                    <td className="px-4 py-3 tnum text-muted">{p.minQty}</td>
                    <td className="px-4 py-3 tnum text-muted">{p.unitCost ? `$${Number(p.unitCost).toFixed(2)}` : '—'}</td>
                    <td className="px-4 py-3 w-40"><div className="h-2 bg-line relative"><div className={`h-2 ${lowP ? 'bg-crit' : pct < 75 ? 'bg-hazard' : 'bg-ok'}`} style={{ width: `${pct}%` }} /><div className="absolute top-0 h-2 w-px bg-ink/40" style={{ left: '50%' }} /></div></td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{canWrite && <><button onClick={(e) => { e.stopPropagation(); move(p, 'IN'); }} className="btn-ghost text-[12px]">Receive</button><button onClick={(e) => { e.stopPropagation(); raise(p); }} className={`btn-ghost text-[12px] ${lowP ? 'text-crit' : ''}`}>Request</button></>}</td>
                  </tr>
                ); })}
                {!rows.length && <tr><td colSpan={7} className="px-5 py-12 text-center text-muted">No parts match.</td></tr>}
              </tbody>
            </table>
          </section>
          <section className="card">
            <header className="px-5 py-4 border-b border-line flex items-center justify-between"><h2 className="font-display font-semibold text-[20px] text-navy-800">Purchase requests</h2><span className="text-[12px] text-muted">Receiving a request books the stock in automatically</span></header>
            <table className="w-full text-[14px]"><tbody>
              {prs.map((pr) => <tr key={pr.id} className="border-b border-line last:border-0"><td className="px-5 py-2.5 font-mono text-[13px]">{pr.part.partNo}</td><td className="px-5 py-2.5">{pr.part.name}</td><td className="px-5 py-2.5 tnum font-semibold">×{pr.quantity}</td><td className="px-5 py-2.5 text-muted text-[12px]">{pr.requestedBy} · {new Date(pr.createdAt).toLocaleDateString()}{pr.notes ? ` · ${pr.notes}` : ''}</td><td className="px-5 py-2.5"><span className={`text-[11px] font-bold tracking-wider px-1.5 py-0.5 ${pr.status === 'OPEN' ? 'bg-hazard/10 text-hazard' : pr.status === 'ORDERED' ? 'bg-navy-100 text-navy-800' : pr.status === 'RECEIVED' ? 'bg-ok/10 text-ok' : 'bg-steel/10 text-steel'}`}>{pr.status}</span></td><td className="px-5 py-2.5 text-right whitespace-nowrap">{canWrite && pr.status === 'OPEN' && <><button onClick={() => prStatus(pr, 'ORDERED')} className="btn-ghost text-[12px]">Mark ordered</button><button onClick={() => prStatus(pr, 'CANCELLED')} className="btn-ghost text-[12px] text-crit">Cancel</button></>}{canWrite && pr.status === 'ORDERED' && <button onClick={() => prStatus(pr, 'RECEIVED')} className="btn-primary h-8 text-[12px]">Receive</button>}</td></tr>)}
              {!prs.length && <tr><td className="px-5 py-8 text-center text-muted">No purchase requests.</td></tr>}
            </tbody></table>
          </section>
        </div>
        {sel && (
          <aside className="card self-start sticky top-24">
            <header className="p-5 border-b border-line flex items-start justify-between"><div><div className="eyebrow">Part</div><div className="font-mono text-[22px] font-semibold text-navy-800">{sel.partNo}</div><div className="text-[15px]">{sel.name}</div></div><button onClick={() => setSel(null)} className="btn-ghost text-[12px]">Close</button></header>
            <div className="p-5 flex flex-col gap-4 text-[13px]">
              <div className="grid grid-cols-3 gap-2 text-center">{[['On hand', sel.qtyOnHand], ['Minimum', sel.minQty], ['Unit cost', sel.unitCost ? `$${Number(sel.unitCost).toFixed(2)}` : '—']].map(([k, v]) => <div key={k as string} className="border border-line p-2"><div className={`font-display text-[22px] font-semibold tnum ${k === 'On hand' && sel.qtyOnHand < sel.minQty ? 'text-crit' : ''}`}>{v}</div><div className="text-[11px] text-muted">{k}</div></div>)}</div>
              {canWrite && <div className="flex gap-2"><button onClick={() => move(sel, 'IN')} className="btn-primary h-9 flex-1 text-[13px]">Receive</button><button onClick={() => move(sel, 'OUT')} className="btn-ghost border border-line h-9 flex-1 justify-center text-[13px]">Issue</button><button onClick={() => move(sel, 'ADJUST')} className="btn-ghost border border-line h-9 flex-1 justify-center text-[13px]">Adjust</button></div>}
              <div><div className="eyebrow mb-1">Movement history</div><ul className="divide-y divide-line max-h-72 overflow-y-auto">{moves.map((m) => <li key={m.id} className="py-1.5 flex items-center gap-3"><span className={`w-10 text-[11px] font-bold ${m.type === 'IN' ? 'text-ok' : m.type === 'OUT' ? 'text-crit' : 'text-hazard'}`}>{m.type}</span><span className={`tnum font-semibold w-10 ${m.quantity < 0 ? 'text-crit' : 'text-ok'}`}>{m.quantity > 0 ? '+' : ''}{m.quantity}</span><span className="flex-1 text-muted truncate">{m.reference ?? ''}</span><time className="text-muted tnum">{new Date(m.createdAt).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}</time></li>)}{!moves.length && <li className="py-2 text-muted">No movements yet.</li>}</ul></div>
            </div>
          </aside>
        )}
      </div>
    </Shell>
  );
}
function NewPartDrawer({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [f, setF] = useState({ partNo: '', name: '', qtyOnHand: '0', minQty: '0', unitCost: '' }); const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) { e.preventDefault(); try { await api('/parts', { method: 'POST', body: JSON.stringify({ partNo: f.partNo.toUpperCase(), name: f.name, qtyOnHand: Number(f.qtyOnHand), minQty: Number(f.minQty), unitCost: f.unitCost ? Number(f.unitCost) : undefined }) }); onCreated(); onClose(); } catch (err) { setError((err as Error).message); } }
  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-navy-900/40 backdrop-blur-[2px]" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="h-full w-full max-w-[420px] bg-surface shadow-card flex flex-col">
        <header className="px-6 py-5 border-b border-line"><div className="eyebrow">Parts inventory</div><h2 className="font-display font-semibold text-[26px] text-navy-800">New part</h2></header>
        <div className="p-6 flex flex-col gap-4 flex-1">
          <label className="flex flex-col gap-1.5 text-[13px] font-medium">Part number<input className="input font-mono uppercase" required value={f.partNo} onChange={(e) => setF({ ...f, partNo: e.target.value })} placeholder="FLT-OIL-01" /></label>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium">Name<input className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <div className="grid grid-cols-3 gap-3">{([['qtyOnHand', 'On hand'], ['minQty', 'Minimum'], ['unitCost', 'Unit cost']] as const).map(([k, l]) => <label key={k} className="flex flex-col gap-1.5 text-[13px] font-medium">{l}<input className="input tnum" type="number" min={0} step={k === 'unitCost' ? '0.01' : '1'} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>)}</div>
          {error && <p className="text-[13px] text-crit border-l-2 border-crit pl-3">{error}</p>}
        </div>
        <footer className="px-6 py-4 border-t border-line flex justify-end gap-2"><button type="button" onClick={onClose} className="btn-ghost">Cancel</button><button className="btn-primary h-10">Create part</button></footer>
      </form>
    </div>
  );
}
