'use client';
import { useEffect, useState } from 'react';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/api';
import { ErrorText, Tabs } from '@/components/kit';

type Entry = { id: string; entity: string; entityId: string; action: string; diff: unknown; createdAt: string; deviceId: string | null; actor: { employeeId: string; name: string } | null; subject: { employeeId: string; name: string } | null };
type Login = { id: string; employeeId: string; deviceId: string; success: boolean; ip: string | null; createdAt: string };
const ACTION_TONE = (a: string) => (/BLOCK|LOCKED|REJECT|DEACTIVAT|DELETE/.test(a) ? 'text-crit' : /RESET|ROLE|UNLOCK|STATUS|UNBLOCK/.test(a) ? 'text-hazard' : 'text-ink');
const pretty = (a: string) => a.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
/** Short readable summary of an entry's details (reason, from → to, …) instead of raw JSON. */
function details(e: Entry) {
  const d = e.diff as Record<string, unknown> | null;
  if (!d || typeof d !== 'object') return '';
  const parts: string[] = [];
  if (d.from && d.to) parts.push(`${d.from} → ${d.to}`);
  if (d.reason) parts.push(String(d.reason));
  if (d.onBehalfOf) parts.push(`for ${d.onBehalfOf}`);
  if (d.failedLogins) parts.push(`${d.failedLogins} failed attempts`);
  if (!parts.length) parts.push(Object.keys(d).slice(0, 5).join(', '));
  return parts.join(' · ');
}

/** Audit trail (client spec §10.7, §10.8): who did what, when — and every sign-in attempt. */
export default function AuditPage() {
  const [tab, setTab] = useState<'activity' | 'logins'>('activity');
  const [f, setF] = useState({ entity: '', action: '', actor: '', from: '', to: '' });
  const [failedOnly, setFailedOnly] = useState(false);
  const [rows, setRows] = useState<Entry[]>([]);
  const [logins, setLogins] = useState<Login[]>([]);
  const [error, setError] = useState<string | null>(null);
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  useEffect(() => { if (tab === 'activity') api<Entry[]>(`/audit${qs ? `?${qs}` : ''}`).then(setRows).catch((e) => setError(e.message)); }, [tab, qs]);
  useEffect(() => { if (tab === 'logins') api<Login[]>(`/audit/logins?${f.actor ? `employeeId=${f.actor}&` : ''}${failedOnly ? 'failed=1' : ''}`).then(setLogins).catch((e) => setError(e.message)); }, [tab, f.actor, failedOnly]);

  return (
    <Shell title="Audit log">
      <div className="border-b border-line -mt-2"><Tabs tabs={[{ key: 'activity', label: 'Activity' }, { key: 'logins', label: 'Sign-in attempts' }]} value={tab} onChange={setTab} /></div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[12px] font-medium">Employee ID<input className="input w-36 font-mono uppercase" value={f.actor} onChange={(e) => setF({ ...f, actor: e.target.value.toUpperCase() })} placeholder="ADM001" /></label>
        {tab === 'activity' ? <>
          <label className="flex flex-col gap-1 text-[12px] font-medium">Record<select className="input w-auto" value={f.entity} onChange={(e) => setF({ ...f, entity: e.target.value })}><option value="">Everything</option>{['User', 'Auth', 'ShiftReport', 'DailyReading', 'JobCard', 'Asset', 'Deployment', 'DaysWorked', 'Payment', 'Request', 'SystemSetting', 'Role'].map((x) => <option key={x}>{x}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-[12px] font-medium">Action<input className="input w-36" value={f.action} onChange={(e) => setF({ ...f, action: e.target.value })} placeholder="e.g. block" /></label>
          <label className="flex flex-col gap-1 text-[12px] font-medium">From<input type="date" className="input w-auto" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
          <label className="flex flex-col gap-1 text-[12px] font-medium">To<input type="date" className="input w-auto" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
        </> : <label className="flex items-center gap-2 text-[13px] pb-2"><input type="checkbox" checked={failedOnly} onChange={(e) => setFailedOnly(e.target.checked)} /> Failed only</label>}
      </div>
      <ErrorText>{error}</ErrorText>
      {tab === 'activity' ? (
        <section className="card overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr className="text-left eyebrow border-b border-line">{['When', 'Who', 'Action', 'Record', 'Details'].map((h) => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="border-b border-line last:border-0 align-top">
                  <td className="px-4 py-2.5 tnum whitespace-nowrap text-muted">{new Date(e.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{e.actor ? <><span className="font-mono font-semibold">{e.actor.employeeId}</span> <span className="text-muted">{e.actor.name}</span></> : <span className="text-muted">system</span>}</td>
                  <td className={`px-4 py-2.5 font-semibold whitespace-nowrap ${ACTION_TONE(e.action)}`}>{pretty(e.action)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{e.entity}{e.subject ? <span className="text-muted"> · {e.subject.employeeId}</span> : null}</td>
                  <td className="px-4 py-2.5 text-muted max-w-[420px] break-words">{details(e)}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={5} className="px-5 py-10 text-center text-muted">Nothing matches.</td></tr>}
            </tbody>
          </table>
        </section>
      ) : (
        <section className="card overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr className="text-left eyebrow border-b border-line">{['When', 'Employee ID', 'Result', 'Device', 'IP'].map((h) => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}</tr></thead>
            <tbody>
              {logins.map((l) => (
                <tr key={l.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5 tnum whitespace-nowrap text-muted">{new Date(l.createdAt).toLocaleString()}</td><td className="px-4 py-2.5 font-mono font-semibold">{l.employeeId}</td>
                  <td className={`px-4 py-2.5 font-semibold ${l.success ? 'text-ok' : 'text-crit'}`}>{l.success ? 'Signed in' : 'Failed'}</td><td className="px-4 py-2.5 font-mono text-[12px] text-muted">{l.deviceId}</td><td className="px-4 py-2.5 font-mono text-[12px] text-muted">{l.ip ?? '—'}</td>
                </tr>
              ))}
              {!logins.length && <tr><td colSpan={5} className="px-5 py-10 text-center text-muted">No sign-in attempts.</td></tr>}
            </tbody>
          </table>
        </section>
      )}
    </Shell>
  );
}
