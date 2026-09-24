'use client';
import { useEffect, useState } from 'react';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/api';

type D = { id: string; deviceId: string; platform?: string; approved: boolean; lastSeen: string; pushToken?: string; user: { employeeId: string; name: string; role: string } };
export default function DevicesPage() {
  const [rows, setRows] = useState<D[]>([]); const [error, setError] = useState<string | null>(null);
  const load = () => api<D[]>('/devices').then(setRows).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  async function set(d: D, approved: boolean) { if (!approved && !confirm(`Revoke ${d.user.employeeId}'s device ${d.deviceId}? Their sessions on it are signed out.`)) return; await api(`/devices/${d.id}`, { method: 'PATCH', body: JSON.stringify({ approved }) }); load(); }
  return (
    <Shell title="Phones">
      <p className="text-[14px] text-muted max-w-[72ch]">Every sign-in registers the device. With <span className="font-mono">DEVICE_REGISTRATION_REQUIRED=true</span> on the server, only approved devices can sign in (SRS §9.3). Revoking a device signs it out remotely.</p>
      {error && <p className="text-crit text-sm">{error}</p>}
      <section className="card overflow-x-auto"><table className="w-full text-[14px]">
        <thead><tr className="text-left eyebrow border-b border-line">{['Employee', 'Device ID', 'Platform', 'Push', 'Last seen', 'Status', ''].map((h, i) => <th key={i} className="px-4 py-2.5 font-semibold">{h}</th>)}</tr></thead>
        <tbody>{rows.map((d) => <tr key={d.id} className="border-b border-line last:border-0"><td className="px-4 py-3"><span className="font-mono text-[13px] font-medium">{d.user.employeeId}</span> <span className="text-muted">{d.user.name}</span></td><td className="px-4 py-3 font-mono text-[12px] text-muted">{d.deviceId}</td><td className="px-4 py-3 text-muted">{d.platform ?? '—'}</td><td className="px-4 py-3 text-[12px]">{d.pushToken ? <span className="text-ok font-semibold">registered</span> : <span className="text-muted">none</span>}</td><td className="px-4 py-3 tnum text-muted">{new Date(d.lastSeen).toLocaleString()}</td><td className="px-4 py-3"><span className={`text-[12px] font-semibold ${d.approved ? 'text-ok' : 'text-crit'}`}>{d.approved ? 'Approved' : 'Blocked'}</span></td><td className="px-4 py-3 text-right">{d.approved ? <button onClick={() => set(d, false)} className="btn-ghost text-[12px] text-crit">Revoke</button> : <button onClick={() => set(d, true)} className="btn-primary h-8 text-[12px]">Approve</button>}</td></tr>)}{!rows.length && <tr><td colSpan={7} className="px-5 py-10 text-center text-muted">No devices yet.</td></tr>}</tbody>
      </table></section>
    </Shell>
  );
}
