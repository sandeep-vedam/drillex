'use client';
import { useEffect, useState } from 'react';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/api';

type N = { id: string; type: string; title: string; body?: string; readAt?: string; createdAt: string };
const TONE: Record<string, string> = { machine_alert: 'bg-crit', maintenance_due: 'bg-hazard', low_stock: 'bg-hazard', approval_required: 'bg-warn', purchase_request: 'bg-navy-600' };
export default function NotificationsPage() {
  const [rows, setRows] = useState<N[]>([]);
  const load = () => api<N[]>('/notifications').then(setRows).catch(() => {});
  useEffect(() => { load(); }, []);
  async function readAll() { await api('/notifications/read-all', { method: 'POST' }); load(); window.dispatchEvent(new Event('notifications:changed')); }
  async function read(n: N) { if (n.readAt) return; await api(`/notifications/${n.id}/read`, { method: 'POST' }); load(); window.dispatchEvent(new Event('notifications:changed')); }
  const unread = rows.filter((r) => !r.readAt).length;
  return (
    <Shell title="Notifications" actions={unread ? <button onClick={readAll} className="btn-ghost border border-line h-9 text-[13px]">Mark all read ({unread})</button> : undefined}>
      <section className="card">
        <ul className="divide-y divide-line">
          {rows.map((n) => (
            <li key={n.id} onClick={() => read(n)} className={`px-5 py-3 flex items-start gap-3 cursor-pointer ${n.readAt ? 'opacity-60' : 'bg-navy-100/30'}`}>
              <span className={`mt-2 h-2 w-2 shrink-0 ${TONE[n.type] ?? 'bg-steel'}`} />
              <div className="flex-1 min-w-0"><div className={`text-[14px] ${n.readAt ? '' : 'font-semibold'}`}>{n.title}</div>{n.body && <div className="text-[13px] text-muted whitespace-pre-line">{n.body}</div>}<div className="text-[11px] text-muted mt-0.5 tracking-wide uppercase">{n.type.replace(/_/g, ' ')}</div></div>
              <time className="text-[12px] text-muted tnum whitespace-nowrap">{new Date(n.createdAt).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</time>
            </li>
          ))}
          {!rows.length && <li className="px-5 py-10 text-center text-muted">No notifications.</li>}
        </ul>
      </section>
    </Shell>
  );
}
