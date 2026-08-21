'use client';
import { useEffect, useState } from 'react';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/api';

type Conflict = { id: string; entity: string; entityId: string; versions: { incoming: Record<string, unknown>; submittedBy: string; deviceId: string }; createdAt: string };
export default function SyncConflictsPage() {
  const [rows, setRows] = useState<Conflict[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = () => api<Conflict[]>('/sync/conflicts').then(setRows).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  async function resolve(id: string) { await api(`/sync/conflicts/${id}/resolve`, { method: 'POST' }); load(); }
  return (
    <Shell title="Sync conflicts">
      <p className="text-[14px] text-muted max-w-[70ch]">When two devices submit the same record offline (same machine, same day/shift), the first one wins and the second is held here for review (SRS §9.2). Compare with the accepted record, then mark as reviewed.</p>
      {error && <p className="text-crit text-sm">{error}</p>}
      {!rows.length && <div className="card p-8 text-center text-muted">No unresolved conflicts.</div>}
      <div className="grid gap-4">
        {rows.map((c) => (
          <section key={c.id} className="card p-5 border-l-4 border-l-hazard">
            <div className="flex items-start justify-between gap-4">
              <div><div className="eyebrow">{c.entity.replace(/([A-Z])/g, ' $1').trim()}</div><div className="font-semibold">Rejected duplicate from <span className="font-mono">{c.versions.submittedBy}</span> <span className="text-muted font-normal">· device {c.versions.deviceId} · {new Date(c.createdAt).toLocaleString()}</span></div></div>
              <button onClick={() => resolve(c.id)} className="btn-primary h-9 text-[13px]">Mark reviewed</button>
            </div>
            <pre className="mt-3 text-[12px] bg-canvas border border-line p-3 overflow-x-auto max-h-64">{JSON.stringify(c.versions.incoming, null, 2)}</pre>
          </section>
        ))}
      </div>
    </Shell>
  );
}
