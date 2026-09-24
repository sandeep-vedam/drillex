'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { StatusChip } from '@/components/StatusChip';
import { I } from '@/components/Icons';
import { api, getUser } from '@/lib/api';
import { useRoleMatrix } from '@/lib/permissions';
import { can } from '@drillex/shared';
import { AssetDrawer } from '@/components/AssetDrawer';

type Asset = { id: string; assetNumber: string; name: string; category: string; status: string; make: string; model: string; serialNumber: string; yearOfManufacture: number; commissionedAt: string; operators: { userId: string }[] };
const CATS = ['ALL', 'DRILLING', 'HAULAGE', 'COMPRESSOR', 'ANCILLARY', 'OTHER'];

export default function AssetsPage() {
  const router = useRouter();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('ALL');
  const [drawer, setDrawer] = useState(false);
  const matrix = useRoleMatrix();
  const canWrite = !!matrix && !!can(matrix, getUser()?.role, 'asset:write');
  const load = () => api<Asset[]>('/assets').then(setAssets).catch(() => {});
  useEffect(() => { load(); }, []);
  const rows = useMemo(() => assets.filter((a) => (cat === 'ALL' || a.category === cat) && `${a.assetNumber} ${a.name} ${a.make} ${a.model}`.toLowerCase().includes(q.toLowerCase())), [assets, q, cat]);

  return (
    <Shell title="All machines" actions={canWrite ? <button onClick={() => setDrawer(true)} className="btn-primary h-9 text-[13px]"><I.Plus /> New asset</button> : undefined}>
      <AssetDrawer open={drawer} onClose={() => setDrawer(false)} onSaved={load} />
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative flex-1 min-w-[260px] max-w-md"><I.Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input className="input pl-10" placeholder="Search asset number, name, make…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <div className="flex border border-line bg-surface">{CATS.map((c) => <button key={c} onClick={() => setCat(c)} className={`px-3 py-2 text-[12px] font-semibold tracking-wide transition ${cat === c ? 'bg-navy-800 text-white' : 'text-muted hover:text-ink'}`}>{c === 'ALL' ? 'All' : c[0] + c.slice(1).toLowerCase()}</button>)}</div>
        <div className="ml-auto text-[13px] text-muted tnum">{rows.length} of {assets.length}</div>
      </div>
      <section className="card overflow-x-auto">
        <table className="w-full text-[14px]">
          <thead><tr className="text-left eyebrow border-b border-line">{['Asset', 'Name', 'Make / model', 'Serial', 'Year', 'Operators', 'Status'].map((h) => <th key={h} className="px-5 py-2.5 font-semibold">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} onClick={() => router.push(`/assets/${a.id}`)} className="border-b border-line last:border-0 cursor-pointer transition hover:bg-navy-100/40">
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
    </Shell>
  );
}
