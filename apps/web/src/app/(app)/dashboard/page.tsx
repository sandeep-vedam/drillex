'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRoleMatrix } from '@/lib/permissions';
import { can } from '@drillex/shared';
import { Shell } from '@/components/Shell';
import { StatTile } from '@/components/StatTile';
import { StatusChip } from '@/components/StatusChip';
import { I } from '@/components/Icons';
import { api, getUser } from '@/lib/api';

type Summary = { assets: { total: number; active: number; underMaintenance: number; idle: number; decommissioned: number }; readingsToday: number; pendingApprovals: number; openAlerts: number; overdueMaintenance: number; recentActivity: { employeeId: string; success: boolean; deviceId: string; createdAt: string }[]; alerts: { id: string; severity: string; message: string; createdAt: string; asset: { assetNumber: string; name: string } }[] };
type Asset = { id: string; assetNumber: string; name: string; category: string; status: string; make: string; model: string };

export default function Dashboard() {
  const [s, setS] = useState<Summary | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [today, setToday] = useState('');
  const matrix = useRoleMatrix();
  const me = getUser();
  const allow = (p: Parameters<typeof can>[2]) => !!me?.role && !!matrix && !!can(matrix, me.role, p);
  useEffect(() => {
    setToday(new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }));
    api<Summary>('/dashboard/summary').then(setS).catch((e) => setError(e.message));
    api<Asset[]>('/assets').then(setAssets).catch(() => {});
  }, []);

  return (
    <Shell title="Dashboard" actions={<Link href="/assets" className="btn-primary h-9 text-[13px]"><I.Plus /> New asset</Link>}>
      <div className="flex items-baseline justify-between"><div className="eyebrow">{today}</div>{error && <span className="text-crit text-sm">{error}</span>}</div>

      {/* The one thing that needs doing, stated as a sentence — the same panel the mobile home screen leads with. */}
      {(() => {
        const pending = s?.pendingApprovals ?? 0;
        const overdue = s?.overdueMaintenance ?? 0;
        const job =
          allow('shift_report:approve') && pending > 0
            ? { title: `${pending} production report${pending > 1 ? 's' : ''} waiting for you`, body: 'Check the figures, then approve or send back.', href: '/shift-reports', cta: 'Review them', tone: 'border-hazard' }
          : allow('maintenance:read') && overdue > 0
            ? { title: `${overdue} service${overdue > 1 ? 's are' : ' is'} overdue`, body: 'These machines are past their service point.', href: '/maintenance', cta: 'See servicing', tone: 'border-crit' }
          : { title: 'Nothing is waiting for you', body: 'Everything is up to date right now.', href: null, cta: null, tone: 'border-ok' };
        return (
          <section className={`card border-l-[3px] ${job.tone} px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4 justify-between`}>
            <div>
              <h2 className="font-display font-semibold text-[20px] text-ink leading-tight">{job.title}</h2>
              <p className="text-muted text-[14px] mt-1">{job.body}</p>
            </div>
            {job.href && <Link href={job.href} className="btn-primary h-11 px-6 shrink-0">{job.cta}</Link>}
          </section>
        );
      })()}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatTile label="Fleet" value={s?.assets.total ?? '—'} hint={s ? `${s.assets.active} active · ${s.assets.underMaintenance} in workshop · ${s.assets.idle} idle` : undefined} icon={<I.Asset />} />
        <StatTile label="Readings today" value={s?.readingsToday ?? '—'} hint={s ? (() => { const n = Math.max(0, s.assets.active - s.readingsToday); return n === 0 ? 'All active machines have reported' : `${n} machine${n === 1 ? '' : 's'} still to report`; })() : undefined} tone={s && s.readingsToday < s.assets.active ? 'warn' : 'ok'} icon={<I.Gauge />} />
        <StatTile label="Awaiting approval" value={s?.pendingApprovals ?? '—'} hint="Shift reports pending supervisor sign-off" tone={s?.pendingApprovals ? 'warn' : 'default'} icon={<I.Check />} />
        <StatTile label="Open alerts" value={s?.openAlerts ?? '—'} hint={s ? `${s.overdueMaintenance} overdue maintenance item(s)` : undefined} tone={s?.openAlerts || s?.overdueMaintenance ? 'crit' : 'ok'} icon={<I.Alert />} />
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-6">
        <section className="card">
          <header className="flex items-center justify-between px-5 py-4 border-b border-line"><h2 className="font-display font-semibold text-[20px] text-navy-800">Fleet status</h2><Link href="/assets" className="text-[13px] text-navy-600 hover:underline">Open register →</Link></header>
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead><tr className="text-left eyebrow border-b border-line">{['Asset', 'Name', 'Make / model', 'Category', 'Status'].map((h) => <th key={h} className="px-5 py-2.5 font-semibold">{h}</th>)}</tr></thead>
              <tbody>
                {assets.map((a) => (
                  <tr key={a.id} className="border-b border-line last:border-0 hover:bg-navy-100/40 transition">
                    <td className="px-5 py-3 font-mono text-[13px] font-medium text-navy-800">{a.assetNumber}</td>
                    <td className="px-5 py-3 font-medium">{a.name}</td>
                    <td className="px-5 py-3 text-muted">{a.make} {a.model}</td>
                    <td className="px-5 py-3 text-muted capitalize">{a.category.toLowerCase()}</td>
                    <td className="px-5 py-3"><StatusChip status={a.status} /></td>
                  </tr>
                ))}
                {!assets.length && <tr><td colSpan={5} className="px-5 py-10 text-center text-muted">No assets in your scope yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
        <div className="flex flex-col gap-6">
        <section className="card">
          <header className="flex items-center justify-between px-5 py-4 border-b border-line"><h2 className="font-display font-semibold text-[20px] text-navy-800">Machine alerts</h2><Link href="/readings" className="text-[13px] text-navy-600 hover:underline">Readings →</Link></header>
          <ul className="divide-y divide-line">
            {(s?.alerts ?? []).map((a) => (
              <li key={a.id} className="px-5 py-3 flex items-start gap-3 text-[13px]">
                <span className={`mt-1.5 h-2 w-2 shrink-0 ${a.severity === 'HIGH' ? 'bg-crit' : 'bg-hazard'}`} />
                <div className="flex-1 min-w-0"><span className="font-mono font-medium">{a.asset.assetNumber}</span> <span className="text-muted">{a.asset.name}</span><div className="font-medium">{a.message}</div></div>
                <time className="text-muted tnum whitespace-nowrap">{new Date(a.createdAt).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}</time>
              </li>
            ))}
            {s && !s.alerts.length && <li className="px-5 py-6 text-center text-muted text-sm">No open alerts — fleet is clear.</li>}
          </ul>
        </section>
        <section className="card">
          <header className="px-5 py-4 border-b border-line"><h2 className="font-display font-semibold text-[20px] text-navy-800">Recent activity</h2></header>
          <ul className="divide-y divide-line">
            {(s?.recentActivity ?? []).map((e, i) => (
              <li key={i} className="px-5 py-3 flex items-center gap-3 text-[13px]">
                <span className={`h-2 w-2 ${e.success ? 'bg-ok' : 'bg-crit'}`} />
                <span className="font-mono font-medium">{e.employeeId}</span>
                <span className="text-muted flex-1 truncate">{e.success ? 'signed in' : 'failed sign-in'} · {e.deviceId}</span>
                <time className="text-muted tnum">{new Date(e.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
              </li>
            ))}
            {!s && <li className="px-5 py-10 text-center text-muted text-sm">Loading…</li>}
          </ul>
        </section>
        </div>
      </div>
    </Shell>
  );
}
