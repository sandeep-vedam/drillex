'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { StatusChip } from '@/components/StatusChip';
import { I } from '@/components/Icons';
import { api, getUser } from '@/lib/api';
import { AssetDrawer } from '@/components/AssetDrawer';

type Asset = { id: string; assetNumber: string; name: string; category: string; status: string; make: string; model: string; serialNumber: string; yearOfManufacture: number; commissionedAt: string; siteId?: string; notes?: string | null; operators: { userId: string }[] };
type JobCard = { id: string; jobNo: string; date: string; jobType: string; status: string; approvedAt?: string; workPerformed: string; hourMeter?: string; parts?: { id: string }[] };
type Reading = { id: string; date: string; hourMeter: string; fuelConsumed: string; conditionRating: number; warningLights: boolean; leaks: boolean; unusualNoises: boolean; user: { employeeId: string } };
type Sched = { id: string; serviceType: string; description: string; nextDueAt?: string; nextDueHours?: string; status: string; hoursRemaining?: number | null };
type Shift = { id: string; date: string; shift: string; holeRef: string; totalMeters: string; status: string; user: { employeeId: string } };

// Under maintenance is left out: the job-card flow owns it, and the API rejects setting it by hand.
const STATUS_ACTIONS: [string, string][] = [['ACTIVE', 'Activate'], ['IDLE', 'Set idle'], ['DECOMMISSIONED', 'Decommission']];
const MAX_ROWS = 25;
const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const JOB_TYPE: Record<string, string> = { SCHEDULED_SERVICE: 'Scheduled service', BREAKDOWN_REPAIR: 'Breakdown repair', MODIFICATION: 'Modification', INSPECTION: 'Inspection' };
const SERVICE_TYPE: Record<string, string> = { HR_250: '250 hr', HR_500: '500 hr', HR_1000: '1000 hr', ANNUAL: 'Annual', CONDITION_BASED: 'Condition-based', AD_HOC: 'Ad-hoc' };

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [jobCards, setJobCards] = useState<JobCard[]>([]);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [scheds, setScheds] = useState<Sched[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [tab, setTab] = useState('jobs');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const canWrite = ['ADMIN', 'MANAGER', 'SUPERVISOR'].includes(getUser()?.role ?? '');

  // History lists tolerate a 403 so a role that can see the register but not one of the modules still gets the rest of the page.
  const load = useCallback(async () => {
    try { setAsset(await api<Asset>(`/assets/${id}`)); } catch (e) { setLoadError((e as Error).message); return; }
    const [jc, dr, ms, sr] = await Promise.all([
      api<JobCard[]>(`/job-cards?assetId=${id}`).catch(() => [] as JobCard[]),
      api<Reading[]>(`/daily-readings?assetId=${id}`).catch(() => [] as Reading[]),
      api<Sched[]>(`/maintenance/schedules?assetId=${id}`).catch(() => [] as Sched[]),
      api<Shift[]>(`/shift-reports?assetId=${id}`).catch(() => [] as Shift[]),
    ]);
    setJobCards(jc); setReadings(dr); setScheds(ms); setShifts(sr);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function act(run: () => Promise<unknown>, after?: () => void) {
    setBusy(true); setErr(null);
    try { await run(); after ? after() : await load(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  const setStatus = (status: string, label: string) => {
    if (!asset || !confirm(`${label} ${asset.assetNumber} — ${asset.name}?`)) return;
    act(() => api(`/assets/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }));
  };
  const remove = () => {
    if (!asset || !confirm(`Delete ${asset.assetNumber} — ${asset.name}?\n\nIt leaves the register. Job cards, readings and reports already recorded against it are kept.`)) return;
    act(() => api(`/assets/${id}`, { method: 'DELETE' }), () => router.push('/assets'));
  };

  if (loadError) return <Shell title="Asset"><div className="card p-8 text-center"><p className="text-[15px] font-medium">{loadError}</p><Link href="/assets" className="btn-ghost mt-4 inline-flex">← Back to the register</Link></div></Shell>;
  if (!asset) return <Shell title="Asset"><div className="card p-8 text-center text-muted">Loading…</div></Shell>;

  const nextService = scheds.filter((s) => s.status !== 'COMPLETED' && s.nextDueAt).sort((a, b) => (a.nextDueAt! < b.nextDueAt! ? -1 : 1))[0];
  const TABS: [string, string, number][] = [['jobs', 'Job cards', jobCards.length], ['readings', 'Daily readings', readings.length], ['maintenance', 'Maintenance', scheds.length], ['shifts', 'Shift production', shifts.length]];

  return (
    <Shell title={`${asset.assetNumber} · ${asset.name}`} actions={<Link href="/assets" className="btn-ghost text-[13px]">← Register</Link>}>
      <AssetDrawer open={drawer} asset={asset} onClose={() => setDrawer(false)} onSaved={load} />
      <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)] items-start">
        <aside className="card p-5 self-start flex flex-col gap-5">
          <div className="flex items-start justify-between">
            <div><div className="eyebrow">Asset profile</div><div className="font-mono text-[22px] font-semibold text-navy-800">{asset.assetNumber}</div><div className="text-[15px]">{asset.name}</div></div>
            <StatusChip status={asset.status} />
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
            {[['Category', asset.category], ['Make / model', `${asset.make} ${asset.model}`], ['Serial', asset.serialNumber], ['Year', String(asset.yearOfManufacture)], ['Commissioned', fmtDate(asset.commissionedAt)], ['Operators', String(asset.operators?.length ?? 0)]].map(([k, v]) => (
              <div key={k}><dt className="eyebrow !text-[10px]">{k}</dt><dd className="mt-0.5 font-medium">{v}</dd></div>
            ))}
          </dl>
          {asset.notes && <div><div className="eyebrow !text-[10px]">Notes</div><p className="mt-1 text-[13px] text-muted whitespace-pre-wrap">{asset.notes}</p></div>}
          <div className="grid grid-cols-3 gap-2 text-center">
            {[['Readings', String(readings.length)], ['Job cards', String(jobCards.length)], ['Next service', nextService ? fmtDate(nextService.nextDueAt) : '—']].map(([k, v]) => (
              <div key={k} className="border border-line p-2"><div className="font-display text-[15px] font-semibold tnum leading-tight">{v}</div><div className="text-[11px] text-muted">{k}</div></div>
            ))}
          </div>
          {canWrite && (
            <div className="border-t border-line pt-4">
              <div className="eyebrow mb-2">Manage</div>
              <div className="flex flex-wrap gap-2">
                <button disabled={busy} onClick={() => setDrawer(true)} className="btn-primary h-9 text-[13px]"><I.Wrench /> Edit details</button>
                {STATUS_ACTIONS.filter(([s]) => s !== asset.status).map(([s, label]) => (
                  <button key={s} disabled={busy} onClick={() => setStatus(s, label)} className="btn-ghost text-[13px]">{label}</button>
                ))}
                <button disabled={busy} onClick={remove} className="btn-ghost text-[13px] text-crit">Delete</button>
              </div>
              {err && <p role="alert" className="mt-3 text-[13px] text-crit border-l-2 border-crit pl-3">{err}</p>}
            </div>
          )}
        </aside>

        <section className="flex flex-col gap-3 min-w-0">
          <div className="flex flex-wrap border border-line bg-surface self-start">
            {TABS.map(([k, label, n]) => (
              <button key={k} onClick={() => setTab(k)} className={`px-3 py-2 text-[12px] font-semibold tracking-wide transition ${tab === k ? 'bg-navy-800 text-white' : 'text-muted hover:text-ink'}`}>{label} <span className="tnum opacity-70">{n}</span></button>
            ))}
          </div>
          <div className="card overflow-x-auto">
            {tab === 'jobs' && (
              <Table head={['Job no', 'Date', 'Type', 'Work performed', 'Parts', 'Status']} rows={jobCards.slice(0, MAX_ROWS).map((r) => [
                <span key="n" className="font-mono text-[13px] font-medium text-navy-800">{r.jobNo}</span>, fmtDate(r.date), JOB_TYPE[r.jobType] ?? r.jobType,
                <span key="w" className="block max-w-[320px] truncate text-muted">{r.workPerformed}</span>,
                <span key="p" className="tnum text-muted">{r.parts?.length ?? 0}</span>,
                <StatusChip key="s" status={r.status === 'COMPLETED' && r.approvedAt ? 'APPROVED' : r.status} />,
              ])} empty="No job cards for this asset." total={jobCards.length} />
            )}
            {tab === 'readings' && (
              <Table head={['Date', 'Hour meter', 'Fuel used', 'Condition', 'Flags', 'By']} rows={readings.slice(0, MAX_ROWS).map((r) => [
                fmtDate(r.date), <span key="h" className="tnum">{r.hourMeter}</span>, <span key="f" className="tnum">{r.fuelConsumed}</span>,
                <span key="c" className={`font-mono text-[12px] ${r.conditionRating <= 2 ? 'text-crit' : r.conditionRating === 3 ? 'text-hazard' : 'text-ok'}`}>{'★'.repeat(r.conditionRating)}{'☆'.repeat(5 - r.conditionRating)}</span>,
                <span key="fl" className="text-[12px] text-crit font-semibold">{[r.warningLights && 'Warning lights', r.leaks && 'Leaks', r.unusualNoises && 'Noises'].filter(Boolean).join(' · ') || <span className="text-muted font-normal">—</span>}</span>,
                <span key="u" className="font-mono text-[12px] text-muted">{r.user?.employeeId}</span>,
              ])} empty="No daily readings for this asset." total={readings.length} />
            )}
            {tab === 'maintenance' && (
              <Table head={['Service', 'Description', 'Next due', 'Hours left', 'Status']} rows={scheds.slice(0, MAX_ROWS).map((r) => [
                SERVICE_TYPE[r.serviceType] ?? r.serviceType, <span key="d" className="block max-w-[320px] truncate text-muted">{r.description}</span>,
                fmtDate(r.nextDueAt), <span key="h" className="tnum text-muted">{r.hoursRemaining != null ? Math.round(r.hoursRemaining) : '—'}</span>,
                <StatusChip key="s" status={r.status} />,
              ])} empty="No maintenance schedules for this asset." total={scheds.length} />
            )}
            {tab === 'shifts' && (
              <Table head={['Date', 'Shift', 'Hole', 'Meters', 'By', 'Status']} rows={shifts.slice(0, MAX_ROWS).map((r) => [
                fmtDate(r.date), r.shift === 'DAY' ? 'Day' : 'Night', <span key="h" className="font-mono text-[13px]">{r.holeRef}</span>,
                <span key="m" className="tnum font-medium">{r.totalMeters}</span>, <span key="u" className="font-mono text-[12px] text-muted">{r.user?.employeeId}</span>,
                <StatusChip key="s" status={r.status} />,
              ])} empty="No shift reports for this asset." total={shifts.length} />
            )}
          </div>
        </section>
      </div>
    </Shell>
  );
}

function Table({ head, rows, empty, total }: { head: string[]; rows: React.ReactNode[][]; empty: string; total: number }) {
  return (
    <>
      <table className="w-full text-[14px]">
        <thead><tr className="text-left eyebrow border-b border-line">{head.map((h) => <th key={h} className="px-5 py-2.5 font-semibold">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((cells, i) => <tr key={i} className="border-b border-line last:border-0">{cells.map((c, j) => <td key={j} className="px-5 py-3">{c}</td>)}</tr>)}
          {!rows.length && <tr><td colSpan={head.length} className="px-5 py-12 text-center text-muted">{empty}</td></tr>}
        </tbody>
      </table>
      {total > rows.length && <p className="px-5 py-3 text-[12px] text-muted border-t border-line">Showing the {rows.length} most recent of {total}.</p>}
    </>
  );
}
