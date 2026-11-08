'use client';
import { useCallback, useEffect, useState } from 'react';
import { can, RequestPriorities, RequestPriorityLabel, requestNumber, RequestStatuses, RequestStatusLabel, RequestTypeLabel, RequestTypes, type RequestStatus } from '@drillex/shared';
import { Shell } from '@/components/Shell';
import { I } from '@/components/Icons';
import { api, getUser } from '@/lib/api';
import { useRoleMatrix } from '@/lib/permissions';
import { readPhotoFiles, type PendingPhoto } from '@/components/PhotoPicker';
import { Drawer, ErrorText, Field, Notice } from '@/components/kit';

type Req = {
  id: string; number: number; type: keyof typeof RequestTypeLabel; priority: keyof typeof RequestPriorityLabel; details: string; status: RequestStatus; createdAt: string; resolvedAt: string | null;
  createdBy: { id: string; employeeId: string; name: string; role: string }; asset: { assetNumber: string; name: string } | null;
  replies: { id: string; body: string; status: RequestStatus | null; createdAt: string; author: { employeeId: string; name: string } }[];
  attachments?: { id: string; kind: string; url: string }[];
};
const STATUS_TONE: Record<RequestStatus, string> = { RECEIVED: 'text-hazard bg-hazard/10', IN_PROGRESS: 'text-navy-800 bg-navy-100', RESOLVED: 'text-ok bg-ok/10' };
const PRIORITY_TONE: Record<string, string> = { URGENT: 'text-crit', MEDIUM: 'text-hazard', LOW: 'text-muted' };
const when = (d: string) => new Date(d).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Requests inbox (client spec §4A tab 7): Received → In Progress → Resolved, with replies visible to the requester. */
export default function RequestsPage() {
  const matrix = useRoleMatrix();
  const me = getUser();
  const manage = !!matrix && !!can(matrix, me?.role, 'request:manage');
  const create = !!matrix && !!can(matrix, me?.role, 'request:create');
  const [rows, setRows] = useState<Req[]>([]);
  const [filter, setFilter] = useState<RequestStatus | ''>('');
  const [sel, setSel] = useState<Req | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api<Req[]>(`/requests${filter ? `?status=${filter}` : ''}`).then(setRows).catch((e) => setError(e.message)), [filter]);
  useEffect(() => { load(); }, [load]);
  const open = (r: Req) => { setReply(''); api<Req>(`/requests/${r.id}`).then(setSel).catch((e) => setError(e.message)); };

  async function send(status?: RequestStatus) {
    if (!sel) return;
    setBusy(true); setError(null);
    try { const r = await api<Req>(`/requests/${sel.id}/replies`, { method: 'POST', body: JSON.stringify({ body: reply.trim(), status }) }); setSel(r); setReply(''); load(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const counts = Object.fromEntries(RequestStatuses.map((s) => [s, rows.filter((r) => r.status === s).length]));

  return (
    <Shell title="Requests" actions={create ? <button onClick={() => setCreating(true)} className="btn-primary h-9 text-[13px]"><I.Plus /> New request</button> : undefined}>
      {notice && <Notice title={notice} onClose={() => setNotice(null)} />}
      <div className="flex flex-wrap gap-2">
        {([['', 'All'], ...RequestStatuses.map((s) => [s, RequestStatusLabel[s]])] as [RequestStatus | '', string][]).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className={`px-3 py-1.5 text-[13px] font-semibold border ${filter === k ? 'bg-navy-800 text-white border-navy-800' : 'bg-surface border-line'}`}>{l}{k && !filter ? <span className="ml-1 tnum opacity-70">{counts[k]}</span> : null}</button>
        ))}
      </div>
      <ErrorText>{error}</ErrorText>
      <div className={`grid gap-6 ${sel ? 'xl:grid-cols-[minmax(0,1fr)_480px]' : ''}`}>
        <section className="card divide-y divide-line">
          {rows.map((r) => (
            <button key={r.id} onClick={() => open(r)} className={`w-full text-left p-4 flex flex-wrap items-start gap-x-4 gap-y-1 hover:bg-navy-100/40 ${sel?.id === r.id ? 'bg-navy-100/70' : ''}`}>
              <div className="min-w-[90px]"><div className="font-mono text-[13px] font-semibold text-navy-800">{requestNumber(r.number)}</div><div className={`text-[11px] font-bold uppercase ${PRIORITY_TONE[r.priority]}`}>{RequestPriorityLabel[r.priority]}</div></div>
              <div className="flex-1 min-w-[200px]"><div className="font-medium">{RequestTypeLabel[r.type]}{r.asset && <span className="text-muted font-normal"> · {r.asset.assetNumber}</span>}</div><div className="text-[13px] text-muted line-clamp-2">{r.details}</div></div>
              <div className="text-right"><span className={`px-2 py-0.5 text-[11px] font-bold ${STATUS_TONE[r.status]}`}>{RequestStatusLabel[r.status]}</span><div className="text-[12px] text-muted mt-1">{r.createdBy.employeeId} · {when(r.createdAt)}</div>{r.replies.length > 0 && <div className="text-[11px] text-muted">{r.replies.length} repl{r.replies.length === 1 ? 'y' : 'ies'}</div>}</div>
            </button>
          ))}
          {!rows.length && <div className="p-10 text-center text-muted">No requests.</div>}
        </section>
        {sel && (
          <aside className="card p-5 self-start sticky top-24 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div><div className="eyebrow">{RequestTypeLabel[sel.type]} request · <span className={PRIORITY_TONE[sel.priority]}>{RequestPriorityLabel[sel.priority]}</span></div><div className="font-mono text-[22px] font-semibold text-navy-800">{requestNumber(sel.number)}</div>
                <div className="text-[12px] text-muted">{sel.createdBy.employeeId} {sel.createdBy.name}{sel.asset ? ` · ${sel.asset.assetNumber} ${sel.asset.name}` : ''} · {when(sel.createdAt)}</div></div>
              <button onClick={() => setSel(null)} className="btn-ghost">✕</button>
            </div>
            <span className={`self-start px-2 py-0.5 text-[12px] font-bold ${STATUS_TONE[sel.status]}`}>{RequestStatusLabel[sel.status]}</span>
            <p className="text-[14px] whitespace-pre-wrap">{sel.details}</p>
            {!!sel.attachments?.length && <div className="flex flex-wrap gap-2">{sel.attachments.map((a) => <a key={a.id} href={a.url} target="_blank" rel="noreferrer"><img src={a.url} alt="Attachment" className="h-20 w-20 object-cover border border-line" /></a>)}</div>}
            <div className="flex flex-col gap-2">
              {sel.replies.map((x) => (
                <div key={x.id} className={`border-l-2 pl-3 py-1 ${x.author.employeeId === sel.createdBy.employeeId ? 'border-line' : 'border-navy-600'}`}>
                  <div className="text-[12px] text-muted">{x.author.employeeId} {x.author.name} · {when(x.createdAt)}{x.status && <> · moved to <b>{RequestStatusLabel[x.status]}</b></>}</div>
                  {x.body && <div className="text-[14px] whitespace-pre-wrap">{x.body}</div>}
                </div>
              ))}
            </div>
            {(manage || sel.createdBy.id === me?.id) && (
              <div className="flex flex-col gap-2 border-t border-line pt-3">
                <textarea className="input min-h-[80px]" value={reply} onChange={(e) => setReply(e.target.value)} placeholder={manage ? 'Reply to the requester…' : 'Add a follow-up…'} />
                <div className="flex flex-wrap gap-2 justify-end">
                  {manage && sel.status !== 'IN_PROGRESS' && sel.status !== 'RESOLVED' && <button disabled={busy} onClick={() => send('IN_PROGRESS')} className="btn-ghost border border-line">Mark in progress</button>}
                  {manage && sel.status !== 'RESOLVED' && <button disabled={busy} onClick={() => send('RESOLVED')} className="btn-ghost border border-line text-ok">Resolve</button>}
                  {manage && sel.status === 'RESOLVED' && <button disabled={busy} onClick={() => send('IN_PROGRESS')} className="btn-ghost border border-line">Reopen</button>}
                  <button disabled={busy || !reply.trim()} onClick={() => send()} className="btn-primary h-10">Send reply</button>
                </div>
              </div>
            )}
          </aside>
        )}
      </div>
      <NewRequest open={creating} onClose={() => setCreating(false)} onSaved={(n) => { setNotice(`${n} sent to the Operations Manager, Finance Manager and Admin.`); load(); }} />
    </Shell>
  );
}

function NewRequest({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (number: string) => void }) {
  const [assets, setAssets] = useState<{ id: string; assetNumber: string; name: string }[]>([]);
  const [f, setF] = useState({ type: 'CONSUMABLES', priority: 'MEDIUM', details: '', assetId: '' });
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setError(null); setPhotos([]); setF({ type: 'CONSUMABLES', priority: 'MEDIUM', details: '', assetId: '' }); api<typeof assets>('/assets').then(setAssets).catch(() => {}); } }, [open]);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const r = await api<{ id: string; number: number }>('/requests', { method: 'POST', body: JSON.stringify({ ...f, assetId: f.assetId || undefined }) });
      for (const p of photos) await api('/attachments', { method: 'POST', body: JSON.stringify({ ownerType: 'Request', ownerId: r.id, kind: 'PHOTO', contentType: p.contentType, base64: p.base64 }) });
      onSaved(requestNumber(r.number)); onClose();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return (
    <Drawer open={open} onClose={onClose} onSubmit={save} eyebrow="Requests" title="New request" intro="Delivered to the Operations Manager, Finance Manager and Admin. You will see their replies here."
      footer={<><button type="button" onClick={onClose} className="btn-ghost">Cancel</button><button disabled={busy} className="btn-primary h-10">{busy ? 'Sending…' : 'Send request'}</button></>}>
      <Field label="Request type" required><select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{RequestTypes.map((t) => <option key={t} value={t}>{RequestTypeLabel[t]}</option>)}</select></Field>
      <Field label="Priority" required><div className="flex">{RequestPriorities.map((p) => <button type="button" key={p} onClick={() => setF({ ...f, priority: p })} className={`flex-1 py-2 text-[13px] font-semibold border border-line ${f.priority === p ? (p === 'URGENT' ? 'bg-crit text-white border-crit' : 'bg-navy-800 text-white border-navy-800') : 'bg-surface'}`}>{RequestPriorityLabel[p]}</button>)}</div></Field>
      <Field label="Machine" hint="optional"><select className="input" value={f.assetId} onChange={(e) => setF({ ...f, assetId: e.target.value })}><option value="">My assigned machine</option>{assets.map((a) => <option key={a.id} value={a.id}>{a.assetNumber} — {a.name}</option>)}</select></Field>
      <Field label="Request details" required><textarea className="input min-h-[120px]" required minLength={3} value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} placeholder="What is needed, how many, by when" /></Field>
      <Field label="Photos" hint="optional, e.g. a damaged part"><input type="file" accept="image/jpeg,image/png" multiple onChange={async (e) => { const r = await readPhotoFiles(e.target.files); setPhotos((p) => [...p, ...r.photos]); if (r.errors.length) setError(r.errors.join('; ')); }} /></Field>
      {!!photos.length && <div className="flex flex-wrap gap-2">{photos.map((p) => <img key={p.key} src={p.dataUrl} alt={p.name} className="h-16 w-16 object-cover border border-line" />)}</div>}
      <ErrorText>{error}</ErrorText>
    </Drawer>
  );
}
