'use client';
import { useEffect, useState } from 'react';
import type { OperationsSettings } from '@drillex/shared';
import { api } from '@/lib/api';

/** Admin policy: when a daily reading raises a maintenance review (SRS §5.3) and whether job cards need sign-off (SRS §7.6). */
export function OperationsForm() {
  const [v, setV] = useState<OperationsSettings | null>(null);
  const [saved, setSaved] = useState<OperationsSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<OperationsSettings>('/settings/operations').then((r) => { setV(r); setSaved(r); }).catch((e) => setError((e as Error).message)); }, []);

  async function save() {
    if (!v) return;
    setBusy(true); setError(null);
    try { const r = await api<OperationsSettings>('/settings/operations', { method: 'PATCH', body: JSON.stringify(v) }); setV(r); setSaved(r); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  if (!v) return error ? <p className="text-[13px] text-crit border-l-2 border-crit pl-3">{error}</p> : <p className="text-[13px] text-muted">Loading…</p>;
  const dirty = JSON.stringify(v) !== JSON.stringify(saved);
  return (
    <div className="flex flex-col gap-5 max-w-[560px]">
      <label className="flex flex-col gap-1.5 text-[13px] font-medium">
        Raise a maintenance review when a machine check is rated
        <select className="input w-auto self-start" value={v.readingAlertThreshold} onChange={(e) => setV({ ...v, readingAlertThreshold: Number(e.target.value) })}>
          {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} star{n > 1 ? 's' : ''} or lower</option>)}
        </select>
        <span className="text-[12px] text-muted font-normal">Warning lights, leaks and unusual noises always raise an alert.</span>
      </label>
      <label className="flex items-start gap-3 text-[13px] font-medium cursor-pointer">
        <input type="checkbox" className="mt-0.5" checked={v.jobCardApprovalRequired} onChange={(e) => setV({ ...v, jobCardApprovalRequired: e.target.checked })} />
        <span>Completed job cards need supervisor approval<span className="block text-[12px] text-muted font-normal">When on, a machine stays under maintenance until its completed job card is approved.</span></span>
      </label>
      {error && <p className="text-[13px] text-crit border-l-2 border-crit pl-3">{error}</p>}
      <div className="flex items-center gap-3">
        <button disabled={busy || !dirty} onClick={save} className="btn-primary h-10 px-6 self-start disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
        {!dirty && <span className="text-[12px] text-muted">Up to date.</span>}
      </div>
    </div>
  );
}
