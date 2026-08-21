'use client';
import { useEffect, useMemo, useState } from 'react';
import { Shell } from '@/components/Shell';
import { StatusChip } from '@/components/StatusChip';
import { I } from '@/components/Icons';
import { api } from '@/lib/api';
import { AssetDrawer } from '@/components/AssetDrawer';

type Asset = { id: string; assetNumber: string; name: string; category: string; status: string; make: string; model: string; serialNumber: string; yearOfManufacture: number; commissionedAt: string; operators: { userId: string }[] };
const CATS = ['ALL', 'DRILLING', 'HAULAGE', 'COMPRESSOR', 'ANCILLARY', 'OTHER'];

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('ALL');
  const [sel, setSel] = useState<Asset | null>(null);
  const [drawer, setDrawer] = useState(false);
  const load = () => api<Asset[]>('/assets').then(setAssets).catch(() => {});
  useEffect(() => { load(); }, []);
  const rows = useMemo(() => assets.filter((a) => (cat === 'ALL' || a.category === cat) && `${a.assetNumber} ${a.name} ${a.make} ${a.model}`.toLowerCase().includes(q.toLowerCase())), [assets, q, cat]);

  return (
    <Shell title="Asset register" actions={<button onClick={() => setDrawer(true)} className="btn-primary h-9 text-[13px]"><I.Plus /> New asset</button>}>
      <AssetDrawer open={drawer} onClose={() => setDrawer(false)} onCreated={load} />
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative flex-1 min-w-[260px] max-w-md"><I.Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input className="input pl-10" placeholder="Search asset number, name, make…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <div className="flex border border-line bg-surface">{CATS.map((c) => <button key={c} onClick={() => setCat(c)} className={`px-3 py-2 text-[12px] font-semibold tracking-wide transition ${cat === c ? 'bg-navy-800 text-white' : 'text-muted hover:text-ink'}`}>{c === 'ALL' ? 'All' : c[0] + c.slice(1).toLowerCase()}</button>)}</div>
        <div className="ml-auto text-[13px] text-muted tnum">{rows.length} of {assets.length}</div>
      </div>
      <div className={`grid gap-6 ${sel ? 'xl:grid-cols-[minmax(0,1fr)_380px]' : ''}`}>
        <section className="card overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead><tr className="text-left eyebrow border-b border-line">{['Asset', 'Name', 'Make / model', 'Serial', 'Year', 'Operators', 'Status'].map((h) => <th key={h} className="px-5 py-2.5 font-semibold">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} onClick={() => setSel(a)} className={`border-b border-line last:border-0 cursor-pointer transition ${sel?.id === a.id ? 'bg-navy-100/70' : 'hover:bg-navy-100/40'}`}>
                  <td className="px-5 py-3 font-mono text-[13px] font-medium text-navy-800">{a.assetNumber}</td>
                  <td className="px-5 py-3 font-medium">{a.name}</td>
                  <td className="px-5 py-3 text-muted">{a.make} {a.model}</td>
                  <td className="px-5 py-3 font-mono text-[12px] text-muted">{a.serialNumber}</td>
                  <td className="px-5 py-3 tnum text-muted">{a.yearOfManufacture}</td>
                  <td className="px-5 py-3 tnum text-muted">{a.operators?.length ?? 0}</td>
                  <td className="px-5 py-3"><StatusChip status={a.status} /></td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={7} className="px-5 py-12 text-center text-muted">No assets match.</td></tr>}
            </tbody>
          </table>
        </section>
        {sel && (
          <aside className="card p-5 self-start sticky top-24">
            <div className="flex items-start justify-between"><div><div className="eyebrow">Asset profile</div><div className="font-mono text-[22px] font-semibold text-navy-800">{sel.assetNumber}</div><div className="text-[15px]">{sel.name}</div></div><StatusChip status={sel.status} /></div>
            <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
              {[['Category', sel.category], ['Make / model', `${sel.make} ${sel.model}`], ['Serial', sel.serialNumber], ['Year', String(sel.yearOfManufacture)], ['Commissioned', new Date(sel.commissionedAt).toLocaleDateString()], ['Operators', String(sel.operators?.length ?? 0)]].map(([k, v]) => (
                <div key={k}><dt className="eyebrow !text-[10px]">{k}</dt><dd className="mt-0.5 font-medium">{v}</dd></div>
              ))}
            </dl>
            <div className="mt-6 grid grid-cols-3 gap-2 text-center">
              {[['Readings', '—'], ['Job cards', '—'], ['Next service', '—']].map(([k, v]) => <div key={k} className="border border-line p-2"><div className="font-display text-[20px] font-semibold tnum">{v}</div><div className="text-[11px] text-muted">{k}</div></div>)}
            </div>
            <p className="mt-4 text-[12px] text-muted">History, photos and schedule arrive with Phase 1–2 modules.</p>
          </aside>
        )}
      </div>
    </Shell>
  );
}
