'use client';
import { useEffect, useMemo, useState } from 'react';
import { Shell } from '@/components/Shell';
import { StatusChip } from '@/components/StatusChip';
import { I } from '@/components/Icons';
import { api, getUser, uuid } from '@/lib/api';
import { SignaturePad } from '@/components/SignaturePad';
import { useRoleMatrix } from '@/lib/permissions';
import { can } from '@drillex/shared';

type Part = { id: string; partNo: string; name: string; qtyOnHand: number; unitCost?: string };
type JC = { id: string; jobNo: string; date: string; jobType: string; reportedFault?: string; workPerformed: string; hourMeter?: string; labourHours?: string; technicianIds: string[]; toolsUsed?: string; conditionBefore?: number; conditionAfter?: number; testResult?: string; nextAction?: string; status: string; approvedAt?: string; createdAt: string; asset: { assetNumber: string; name: string }; parts: { id: string; quantity: number; part: { partNo: string; name: string; unitCost?: string } }[]; technicians?: { employeeId: string; name: string }[]; attachments?: { id: string; kind: string; url: string }[] };
type Opt = { id: string; name: string; employeeId?: string; assetNumber?: string };
const TYPES = [['SCHEDULED_SERVICE', 'Scheduled service'], ['BREAKDOWN_REPAIR', 'Breakdown repair'], ['MODIFICATION', 'Modification'], ['INSPECTION', 'Inspection']];
const STATUSES = [['OPEN', 'Open'], ['IN_PROGRESS', 'In progress'], ['AWAITING_PARTS', 'Awaiting parts'], ['COMPLETED', 'Completed']];
const label = (arr: string[][], k?: string) => arr.find((x) => x[0] === k)?.[1] ?? k ?? '—';
const Stars = ({ n }: { n?: number }) => n ? <span className={`font-mono text-[12px] ${n <= 2 ? 'text-crit' : n === 3 ? 'text-hazard' : 'text-ok'}`}>{'★'.repeat(n)}{'☆'.repeat(5 - n)}</span> : <span className="text-muted">—</span>;

export default function JobCardsPage() {
  const [rows, setRows] = useState<JC[]>([]);
  const [tab, setTab] = useState('ALL');
  const [sel, setSel] = useState<JC | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false); const [signature, setSignature] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { setSigning(false); setSignature(null); }, [sel?.id]);
  const me = getUser();
  const matrix = useRoleMatrix();
  const load = () => api<JC[]>('/job-cards').then(setRows).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  useEffect(() => { if (sel) api<JC>(`/job-cards/${sel.id}`).then((d) => setSel((s) => (s && s.id === d.id ? { ...s, ...d } : s))).catch(() => {}); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [sel?.id, sel?.status, sel?.approvedAt]);
  const list = useMemo(() => rows.filter((r) => tab === 'ALL' ? true : tab === 'APPROVAL' ? r.status === 'COMPLETED' && !r.approvedAt : r.status === tab), [rows, tab]);
  const cost = (jc: JC) => jc.parts.reduce((n, p) => n + p.quantity * Number(p.part.unitCost ?? 0), 0);
  async function approve(jc: JC) { try { await api(`/job-cards/${jc.id}/approve`, { method: 'POST' }); await load(); setSel((s) => (s ? { ...s, approvedAt: new Date().toISOString() } : s)); } catch (e) { setError((e as Error).message); } }
  async function setStatus(jc: JC, status: string) {
    // Completion needs the technician's signature first (SRS §7.6), so that choice opens the sign-off panel instead.
    if (status === 'COMPLETED') { setSigning(true); return; }
    try { await api(`/job-cards/${jc.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); await load(); setSel((s) => (s ? { ...s, status } : s)); } catch (e) { setError((e as Error).message); }
  }
  async function complete(jc: JC) {
    if (!signature) return;
    setBusy(true); setError(null);
    try {
      await completeWithSignature(jc.id, signature);
      await load(); setSel((s) => (s ? { ...s, status: 'COMPLETED' } : s)); setSigning(false); setSignature(null);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const canApprove = !!matrix && !!can(matrix, me?.role, 'job_card:approve');

  return (
    <Shell title="Repair records" actions={<button onClick={() => setDrawer(true)} className="btn-primary h-9 text-[13px]"><I.Plus /> New job card</button>}>
      <JobCardDrawer open={drawer} onClose={() => setDrawer(false)} onCreated={load} />
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex border border-line bg-surface">{[['ALL', 'All'], ['OPEN', 'Open'], ['IN_PROGRESS', 'In progress'], ['AWAITING_PARTS', 'Awaiting parts'], ['APPROVAL', 'To approve'], ['COMPLETED', 'Completed']].map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`px-3 py-2 text-[12px] font-semibold tracking-wide transition ${tab === k ? 'bg-navy-800 text-white' : 'text-muted hover:text-ink'}`}>{l} <span className="tnum opacity-70">{k === 'ALL' ? rows.length : k === 'APPROVAL' ? rows.filter((r) => r.status === 'COMPLETED' && !r.approvedAt).length : rows.filter((r) => r.status === k).length}</span></button>)}</div>
        <div className="ml-auto text-[13px] text-muted tnum">{list.length} job cards</div>
      </div>
      {error && <p className="text-crit text-sm">{error}</p>}
      <div className={`grid gap-6 ${sel ? 'xl:grid-cols-[minmax(0,1fr)_460px]' : ''}`}>
        <section className="card overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead><tr className="text-left eyebrow border-b border-line">{['Job #', 'Date', 'Asset', 'Type', 'Work', 'Labour', 'Parts', 'Status'].map((h) => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}</tr></thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} onClick={() => setSel(r)} className={`border-b border-line last:border-0 cursor-pointer transition ${sel?.id === r.id ? 'bg-navy-100/70' : 'hover:bg-navy-100/40'}`}>
                  <td className="px-4 py-3 font-mono text-[13px] font-medium text-navy-800 whitespace-nowrap">{r.jobNo}</td>
                  <td className="px-4 py-3 tnum whitespace-nowrap">{new Date(r.date).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}</td>
                  <td className="px-4 py-3"><span className="font-mono text-[13px]">{r.asset.assetNumber}</span><span className="text-muted ml-2">{r.asset.name}</span></td>
                  <td className="px-4 py-3 text-[12px] whitespace-nowrap"><span className={`px-1.5 py-0.5 font-bold tracking-wider ${r.jobType === 'BREAKDOWN_REPAIR' ? 'bg-crit/10 text-crit' : 'bg-navy-100 text-navy-800'}`}>{label(TYPES, r.jobType)}</span></td>
                  <td className="px-4 py-3 max-w-[320px] truncate">{r.workPerformed}</td>
                  <td className="px-4 py-3 tnum text-muted">{r.labourHours ? `${Number(r.labourHours)} h` : '—'}</td>
                  <td className="px-4 py-3 tnum text-muted whitespace-nowrap">{r.parts.length ? `${r.parts.length} · $${cost(r).toFixed(0)}` : '—'}</td>
                  <td className="px-4 py-3"><StatusChip status={r.status === 'COMPLETED' && r.approvedAt ? 'APPROVED' : r.status} /></td>
                </tr>
              ))}
              {!list.length && <tr><td colSpan={8} className="px-5 py-12 text-center text-muted">No job cards.</td></tr>}
            </tbody>
          </table>
        </section>
        {sel && (
          <aside className="card self-start sticky top-24">
            <header className="p-5 border-b border-line flex items-start justify-between"><div><div className="eyebrow">{label(TYPES, sel.jobType)}</div><div className="font-mono text-[22px] font-semibold text-navy-800">{sel.jobNo}</div><div className="text-[14px]"><span className="font-mono">{sel.asset.assetNumber}</span> {sel.asset.name} · {new Date(sel.date).toLocaleDateString()}</div>{sel.technicians && <div className="text-[12px] text-muted">{sel.technicians.map((t) => `${t.employeeId} ${t.name}`).join(', ') || 'No technician recorded'}</div>}</div><div className="flex flex-col items-end gap-2"><StatusChip status={sel.status === 'COMPLETED' && sel.approvedAt ? 'APPROVED' : sel.status} /><button onClick={() => setSel(null)} className="btn-ghost text-[12px]">Close</button></div></header>
            <div className="p-5 flex flex-col gap-4 text-[13px]">
              {sel.reportedFault && <div><div className="eyebrow mb-1">Reported fault</div><div>{sel.reportedFault}</div></div>}
              <div><div className="eyebrow mb-1">Work performed</div><div className="whitespace-pre-wrap">{sel.workPerformed}</div></div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1">{([['Hour meter', sel.hourMeter ? `${Number(sel.hourMeter)} h` : '—'], ['Labour', sel.labourHours ? `${Number(sel.labourHours)} h` : '—'], ['Tools', sel.toolsUsed ?? '—'], ['Test after work', label([['PASSED', 'Passed'], ['FAILED', 'Failed'], ['PENDING', 'Pending']], sel.testResult)]] as [string, string][]).map(([k, v]) => <div key={k} className="flex justify-between border-b border-line py-1"><dt className="text-muted">{k}</dt><dd className={`font-medium text-right ${v === 'Failed' ? 'text-crit' : ''}`}>{v}</dd></div>)}<div className="flex justify-between border-b border-line py-1"><dt className="text-muted">Condition before → after</dt><dd><Stars n={sel.conditionBefore} /> → <Stars n={sel.conditionAfter} /></dd></div></dl>
              <div><div className="eyebrow mb-1">Parts used</div>{sel.parts.length ? <table className="w-full"><tbody>{sel.parts.map((p) => <tr key={p.id} className="border-b border-line"><td className="py-1 font-mono text-[12px]">{p.part.partNo}</td><td className="py-1">{p.part.name}</td><td className="py-1 text-right tnum">×{p.quantity}</td><td className="py-1 text-right tnum text-muted">${(p.quantity * Number(p.part.unitCost ?? 0)).toFixed(2)}</td></tr>)}<tr><td colSpan={3} className="py-1 text-right font-semibold">Parts cost</td><td className="py-1 text-right tnum font-semibold">${cost(sel).toFixed(2)}</td></tr></tbody></table> : <div className="text-muted">None.</div>}</div>
              {sel.nextAction && <div className="border-l-2 border-hazard pl-3"><div className="eyebrow mb-0.5">Next action required</div>{sel.nextAction}</div>}
              {!!sel.attachments?.length && <div><div className="eyebrow mb-1">Photos & sign-off</div><div className="flex flex-wrap gap-2">{sel.attachments.map((a) => <a key={a.id} href={a.url} target="_blank" rel="noreferrer"><img src={a.url} alt={a.kind} className={`border border-line ${a.kind === 'SIGNATURE' ? 'h-14 bg-white' : 'h-20 w-20 object-cover'}`} /></a>)}</div></div>}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-line">
                {signing && sel.status !== 'COMPLETED' && (
                  <div className="w-full flex flex-col gap-2 border border-line p-3 bg-canvas">
                    <SignaturePad key={sel.id} onChange={setSignature} />
                    <div className="flex gap-2"><button type="button" onClick={() => { setSigning(false); setSignature(null); }} className="btn-ghost h-10">Cancel</button><button type="button" disabled={!signature || busy} onClick={() => complete(sel)} className="btn-primary h-10 flex-1"><I.Check /> {busy ? 'Saving…' : 'Sign & mark completed'}</button></div>
                  </div>
                )}
                {!signing && !sel.approvedAt && sel.status !== 'COMPLETED' && <select className="input h-10 w-auto text-[13px]" value={sel.status} onChange={(e) => setStatus(sel, e.target.value)}>{STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}
                {canApprove && sel.status === 'COMPLETED' && !sel.approvedAt && <button onClick={() => approve(sel)} className="btn-primary h-10 flex-1"><I.Check /> Approve job card</button>}
                {sel.approvedAt && <div className="text-ok font-semibold">Approved {new Date(sel.approvedAt).toLocaleString()}</div>}
              </div>
            </div>
          </aside>
        )}
      </div>
    </Shell>
  );
}

/** Uploads the signature against the card, then marks it completed — the API checks the signature is on file. */
async function completeWithSignature(jobCardId: string, dataUrl: string) {
  const sigId = uuid();
  await api('/attachments', { method: 'POST', body: JSON.stringify({ id: sigId, ownerType: 'JobCard', ownerId: jobCardId, kind: 'SIGNATURE', contentType: 'image/png', base64: dataUrl.replace(/^data:image\/png;base64,/, '') }) });
  await api(`/job-cards/${jobCardId}`, { method: 'PATCH', body: JSON.stringify({ status: 'COMPLETED', techSignatureAttachmentId: sigId }) });
}

function JobCardDrawer({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [assets, setAssets] = useState<Opt[]>([]); const [techs, setTechs] = useState<Opt[]>([]); const [parts, setParts] = useState<Part[]>([]);
  const [f, setF] = useState({ assetId: '', date: new Date().toISOString().slice(0, 10), jobType: 'BREAKDOWN_REPAIR', reportedFault: '', workPerformed: '', hourMeter: '', labourHours: '', technicianIds: [] as string[], toolsUsed: '', conditionBefore: '', conditionAfter: '', testResult: '', nextAction: '', status: 'OPEN', parts: [] as { partId: string; quantity: number }[] });
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  useEffect(() => { if (!open) return; setSignature(null); api<Opt[]>('/assets').then((a) => { setAssets(a); setF((x) => ({ ...x, assetId: x.assetId || a[0]?.id || '' })); }).catch(() => {}); api<Opt[]>('/job-cards/technicians').then(setTechs).catch(() => {}); api<Part[]>('/parts').then(setParts).catch(() => {}); }, [open]);
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const n = (v: string) => (v === '' ? undefined : Number(v));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const completing = f.status === 'COMPLETED';
    if (completing && !signature) { setError('The technician must sign before the job card can be saved as completed.'); return; }
    setBusy(true); setError(null);
    try {
      // A completed card is saved as in progress first, so the signature has a card to attach to, then completed.
      const jc = await api<{ id: string }>('/job-cards', { method: 'POST', body: JSON.stringify({ ...f, status: completing ? 'IN_PROGRESS' : f.status, hourMeter: n(f.hourMeter), labourHours: n(f.labourHours), conditionBefore: n(f.conditionBefore), conditionAfter: n(f.conditionAfter), testResult: f.testResult || undefined, reportedFault: f.reportedFault || undefined, toolsUsed: f.toolsUsed || undefined, nextAction: f.nextAction || undefined }) });
      if (completing && signature) {
        try { await completeWithSignature(jc.id, signature); }
        // The card exists now, so close rather than let a retry create a second one; it can be completed from its panel.
        catch (err) { onCreated(); onClose(); window.alert(`The job card was saved as in progress, but could not be marked completed: ${(err as Error).message}\n\nOpen it from the list to sign and complete it.`); return; }
      }
      onCreated(); onClose();
    }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-navy-900/40 backdrop-blur-[2px]" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="h-full w-full max-w-[560px] bg-surface shadow-card flex flex-col">
        <header className="px-6 py-5 border-b border-line"><div className="eyebrow">Mechanical team</div><h2 className="font-display font-semibold text-[26px] text-navy-800">New job card</h2><p className="text-[13px] text-muted">Number is assigned automatically (JC-YYYY-####). Opening a job sets the machine to Under Maintenance; parts used are deducted from inventory.</p></header>
        <div className="p-6 flex flex-col gap-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-4">
            <L label="Asset"><select className="input font-mono" value={f.assetId} onChange={(e) => set('assetId', e.target.value)}>{assets.map((a) => <option key={a.id} value={a.id}>{a.assetNumber} — {a.name}</option>)}</select></L>
            <L label="Date work performed"><input className="input" type="date" value={f.date} onChange={(e) => set('date', e.target.value)} required /></L>
          </div>
          <L label="Job type"><div className="grid grid-cols-4 gap-1">{TYPES.map(([k, l]) => <button type="button" key={k} onClick={() => set('jobType', k)} className={`px-2 py-2 text-[12px] font-semibold border ${f.jobType === k ? 'bg-navy-800 text-white border-navy-800' : 'border-line hover:border-navy-600'}`}>{l}</button>)}</div></L>
          <L label="Reported fault / work requested"><textarea className="input min-h-[60px]" value={f.reportedFault} onChange={(e) => set('reportedFault', e.target.value)} /></L>
          <L label="Work performed (required)"><textarea className="input min-h-[90px]" required minLength={5} value={f.workPerformed} onChange={(e) => set('workPerformed', e.target.value)} /></L>
          <div className="grid grid-cols-3 gap-4">
            <L label="Hour meter"><input className="input tnum" type="number" min={0} value={f.hourMeter} onChange={(e) => set('hourMeter', e.target.value)} /></L>
            <L label="Labour hours"><input className="input tnum" type="number" min={0} step="0.25" value={f.labourHours} onChange={(e) => set('labourHours', e.target.value)} /></L>
            <L label="Status"><select className="input" value={f.status} onChange={(e) => set('status', e.target.value)}>{STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></L>
            <L label="Condition before (1–5)"><input className="input tnum" type="number" min={1} max={5} value={f.conditionBefore} onChange={(e) => set('conditionBefore', e.target.value)} /></L>
            <L label="Condition after (1–5)"><input className="input tnum" type="number" min={1} max={5} value={f.conditionAfter} onChange={(e) => set('conditionAfter', e.target.value)} /></L>
            <L label="Test after work"><select className="input" value={f.testResult} onChange={(e) => set('testResult', e.target.value)}><option value="">—</option><option value="PASSED">Passed</option><option value="FAILED">Failed</option><option value="PENDING">Pending</option></select></L>
          </div>
          <L label="Technicians"><div className="border border-line max-h-32 overflow-y-auto divide-y divide-line">{techs.map((t) => { const on = f.technicianIds.includes(t.id); return <label key={t.id} className={`flex items-center gap-3 px-3 py-2 text-[14px] cursor-pointer ${on ? 'bg-navy-100/60' : 'hover:bg-canvas'}`}><input type="checkbox" checked={on} onChange={() => set('technicianIds', on ? f.technicianIds.filter((x) => x !== t.id) : [...f.technicianIds, t.id])} /><span className="font-mono text-[13px]">{t.employeeId}</span><span className="text-muted">{t.name}</span></label>; })}</div></L>
          <L label="Parts replaced / used"><div className="border border-line divide-y divide-line">{f.parts.map((p, i) => { const part = parts.find((x) => x.id === p.partId); return <div key={i} className="flex items-center gap-2 px-3 py-2"><select className="input h-9 flex-1 text-[13px]" value={p.partId} onChange={(e) => set('parts', f.parts.map((x, j) => (j === i ? { ...x, partId: e.target.value } : x)))}>{parts.map((x) => <option key={x.id} value={x.id}>{x.partNo} — {x.name} ({x.qtyOnHand} in stock)</option>)}</select><input className="input h-9 w-20 tnum" type="number" min={1} value={p.quantity} onChange={(e) => set('parts', f.parts.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) } : x)))} />{part && p.quantity > part.qtyOnHand && <span className="text-[11px] text-hazard font-semibold">exceeds stock</span>}<button type="button" onClick={() => set('parts', f.parts.filter((_, j) => j !== i))} className="text-crit text-[12px] font-semibold">Remove</button></div>; })}<button type="button" onClick={() => set('parts', [...f.parts, { partId: parts[0]?.id ?? '', quantity: 1 }])} className="w-full px-3 py-2 text-[13px] text-navy-600 hover:bg-canvas text-left">+ Add part row</button></div></L>
          <L label="Tools used"><input className="input" value={f.toolsUsed} onChange={(e) => set('toolsUsed', e.target.value)} /></L>
          <L label="Next action required"><textarea className="input min-h-[50px]" value={f.nextAction} onChange={(e) => set('nextAction', e.target.value)} /></L>
          {f.status === 'COMPLETED' && <SignaturePad onChange={setSignature} />}
          {error && <p className="text-[13px] text-crit border-l-2 border-crit pl-3">{error}</p>}
        </div>
        <footer className="px-6 py-4 border-t border-line flex justify-end gap-2"><button type="button" onClick={onClose} className="btn-ghost">Cancel</button><button disabled={busy} className="btn-primary h-10"><I.Plus /> {busy ? 'Saving…' : 'Create job card'}</button></footer>
      </form>
    </div>
  );
}
function L({ label, children }: { label: string; children: React.ReactNode }) { return <label className="flex flex-col gap-1.5 text-[13px] font-medium">{label}{children}</label>; }
