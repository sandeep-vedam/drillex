'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { I } from './Icons';
import { PhotoPicker, uploadPhotos, type PendingPhoto } from './PhotoPicker';

type Opt = { id: string; name: string; employeeId?: string };
export type EditableAsset = { id: string; assetNumber: string; name: string; category: string; make: string; model: string; serialNumber: string; yearOfManufacture: number; commissionedAt: string; siteId?: string; notes?: string | null; operators?: { userId: string }[] };
const CATS = ['DRILLING', 'HAULAGE', 'COMPRESSOR', 'ANCILLARY', 'OTHER'];
const PREFIX: Record<string, string> = { DRILLING: 'DRL', HAULAGE: 'HAU', COMPRESSOR: 'CMP', ANCILLARY: 'ANC', OTHER: 'EQP' };
const blank = () => ({ name: '', category: 'DRILLING', make: '', model: '', serialNumber: '', yearOfManufacture: new Date().getFullYear(), commissionedAt: new Date().toISOString().slice(0, 10), siteId: '', operatorIds: [] as string[], notes: '' });

export function AssetDrawer({ open, onClose, onSaved, asset }: { open: boolean; onClose: () => void; onSaved: () => void; asset?: EditableAsset | null }) {
  const [sites, setSites] = useState<Opt[]>([]);
  const [ops, setOps] = useState<Opt[]>([]);
  const [f, setF] = useState(blank);
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!open) return; api<Opt[]>('/sites').then((s) => { setSites(s); setF((x) => ({ ...x, siteId: x.siteId || s[0]?.id || '' })); }).catch(() => {}); api<Opt[]>('/users/lookup?role=OPERATOR').then(setOps).catch(() => {}); }, [open]);
  // Prefill runs before the lookups resolve, and the /sites handler above keeps a siteId that is already set.
  useEffect(() => {
    if (!open) return;
    setError(null); setPhotos([]);
    setF(asset ? { name: asset.name, category: asset.category, make: asset.make, model: asset.model, serialNumber: asset.serialNumber, yearOfManufacture: asset.yearOfManufacture, commissionedAt: asset.commissionedAt.slice(0, 10), siteId: asset.siteId ?? '', operatorIds: (asset.operators ?? []).map((o) => o.userId), notes: asset.notes ?? '' } : blank());
  }, [open, asset]);
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    const body = { name: f.name, make: f.make, model: f.model, serialNumber: f.serialNumber, yearOfManufacture: Number(f.yearOfManufacture), commissionedAt: f.commissionedAt, siteId: f.siteId, operatorIds: f.operatorIds, notes: f.notes || undefined };
    try {
      const saved = asset
        ? await api<{ id: string }>(`/assets/${asset.id}`, { method: 'PATCH', body: JSON.stringify(body) })
        : await api<{ id: string }>('/assets', { method: 'POST', body: JSON.stringify({ ...body, category: f.category }) });
      // An attachment needs an owner id, so photos can only go up once the asset itself exists.
      if (photos.length) {
        try { await uploadPhotos(saved.id, photos); }
        catch (err) { onSaved(); setError(`Asset saved, but a photo did not upload: ${(err as Error).message}`); return; }
      }
      onSaved(); onClose();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-navy-900/40 backdrop-blur-[2px]" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="h-full w-full max-w-[520px] bg-surface shadow-card flex flex-col">
        <header className="px-6 py-5 border-b border-line flex items-start justify-between"><div><div className="eyebrow">Asset register</div><h2 className="font-display font-semibold text-[26px] text-navy-800">{asset ? `Edit ${asset.assetNumber}` : 'Register new asset'}</h2><p className="text-[13px] text-muted">{asset ? <>Asset number and category can never change.</> : <>Number will be assigned as <span className="font-mono text-ink">{PREFIX[f.category]}-###</span> and can never change.</>}</p></div><button type="button" onClick={onClose} className="btn-ghost" aria-label="Close">✕</button></header>
        <div className="p-6 flex flex-col gap-4 overflow-y-auto flex-1">
          <L label="Asset name"><input className="input" required value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Drill Rig #3" /></L>
          <div className="grid grid-cols-2 gap-4">
            <L label="Category"><select className="input disabled:text-muted" disabled={!!asset} value={f.category} onChange={(e) => set('category', e.target.value)}>{CATS.map((c) => <option key={c} value={c}>{c[0] + c.slice(1).toLowerCase()}</option>)}</select></L>
            <L label="Site"><select className="input" required value={f.siteId} onChange={(e) => set('siteId', e.target.value)}>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></L>
            <L label="Make"><input className="input" required value={f.make} onChange={(e) => set('make', e.target.value)} placeholder="Sandvik" /></L>
            <L label="Model"><input className="input" required value={f.model} onChange={(e) => set('model', e.target.value)} placeholder="DP1500i" /></L>
            <L label="Serial number"><input className="input font-mono" required value={f.serialNumber} onChange={(e) => set('serialNumber', e.target.value)} /></L>
            <L label="Year of manufacture"><input className="input tnum" type="number" min={1950} max={2100} required value={f.yearOfManufacture} onChange={(e) => set('yearOfManufacture', e.target.value)} /></L>
            <L label="Date commissioned"><input className="input" type="date" required value={f.commissionedAt} onChange={(e) => set('commissionedAt', e.target.value)} /></L>
          </div>
          <L label="Assigned operators" hint="Only these employees can submit logs for this asset">
            <div className="border border-line max-h-40 overflow-y-auto divide-y divide-line">
              {ops.map((o) => { const on = f.operatorIds.includes(o.id); return (
                <label key={o.id} className={`flex items-center gap-3 px-3 py-2 text-[14px] cursor-pointer ${on ? 'bg-navy-100/60' : 'hover:bg-canvas'}`}><input type="checkbox" checked={on} onChange={() => set('operatorIds', on ? f.operatorIds.filter((x) => x !== o.id) : [...f.operatorIds, o.id])} /><span className="font-mono text-[13px]">{o.employeeId}</span><span className="text-muted">{o.name}</span></label>
              ); })}
              {!ops.length && <div className="px-3 py-3 text-[13px] text-muted">No operators found.</div>}
            </div>
          </L>
          <L label="Notes"><textarea className="input min-h-[80px]" value={f.notes} onChange={(e) => set('notes', e.target.value)} /></L>
          <L label="Photos" hint={asset ? 'Added to the ones already on this asset' : 'Uploaded once the asset has been created'}>
            <PhotoPicker photos={photos} onChange={setPhotos} disabled={busy} />
          </L>
          {error && <p role="alert" className="text-[13px] text-crit border-l-2 border-crit pl-3">{error}</p>}
        </div>
        <footer className="px-6 py-4 border-t border-line flex justify-end gap-2"><button type="button" onClick={onClose} className="btn-ghost">Cancel</button><button disabled={busy || !f.operatorIds.length} className="btn-primary h-10"><I.Plus /> {busy ? 'Saving…' : asset ? 'Save changes' : 'Register asset'}</button></footer>
      </form>
    </div>
  );
}
function L({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) { return <label className="flex flex-col gap-1.5 text-[13px] font-medium">{label}{hint && <span className="text-muted font-normal -mt-1">{hint}</span>}{children}</label>; }
