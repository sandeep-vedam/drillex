'use client';
import { useEffect, useState } from 'react';
import { Shell } from '@/components/Shell';
import { I } from '@/components/Icons';
import { api, getUser } from '@/lib/api';

type U = { id: string; employeeId: string; name: string; role: string; status: string; totpEnabled: boolean; mustChangePassword: boolean; site?: { name: string } | null };
const ROLES = ['OPERATOR', 'TECHNICIAN', 'SUPERVISOR', 'MANAGER', 'ADMIN'];
const roleTone: Record<string, string> = { ADMIN: 'bg-crit/10 text-crit', MANAGER: 'bg-navy-100 text-navy-800', SUPERVISOR: 'bg-hazard/10 text-hazard', TECHNICIAN: 'bg-steel/10 text-steel', OPERATOR: 'bg-ok/10 text-ok' };

export default function UsersPage() {
  const [users, setUsers] = useState<U[]>([]);
  const [q, setQ] = useState('');
  const [toast, setToast] = useState<{ title: string; body: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ employeeId: '', name: '', role: 'OPERATOR', password: '', siteId: '' });
  const [sites, setSites] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const me = getUser();
  const load = () => api<U[]>('/users').then(setUsers).catch((e) => setError(e.message));
  useEffect(() => { load(); api<{ id: string; name: string }[]>('/sites').then((s) => { setSites(s); setForm((f) => ({ ...f, siteId: f.siteId || s[0]?.id || '' })); }).catch(() => {}); }, []);

  async function reset(u: U) {
    if (!confirm(`Reset password for ${u.employeeId} (${u.name})? Their sessions will be signed out.`)) return;
    try { const r = await api<{ temporaryPassword: string }>(`/users/${u.id}/reset-password`, { method: 'POST' }); setToast({ title: `Temporary password for ${u.employeeId}`, body: r.temporaryPassword }); load(); } catch (e) { setError((e as Error).message); }
  }
  async function toggle(u: U) {
    try { await api(`/users/${u.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' }) }); load(); } catch (e) { setError((e as Error).message); }
  }
  async function create(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    try { await api('/users', { method: 'POST', body: JSON.stringify({ ...form, employeeId: form.employeeId.toUpperCase() }) }); setToast({ title: `${form.employeeId.toUpperCase()} created`, body: `Temporary password: ${form.password} — they must change it on first sign-in.` }); setCreating(false); setForm({ employeeId: '', name: '', role: 'OPERATOR', password: '', siteId: sites[0]?.id ?? '' }); load(); } catch (err) { setError((err as Error).message); }
  }
  const rows = users.filter((u) => `${u.employeeId} ${u.name} ${u.role}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <Shell title="User management" actions={<button onClick={() => setCreating(true)} className="btn-primary h-9 text-[13px]"><I.Plus /> New user</button>}>
      {toast && (
        <div className="card border-l-4 border-l-ok p-4 flex items-start gap-4">
          <div className="flex-1"><div className="font-semibold">{toast.title}</div><div className="mt-1 font-mono text-[15px] bg-canvas border border-line inline-block px-2 py-1 select-all">{toast.body}</div><div className="text-[12px] text-muted mt-1">Share this once, out of band. It is not shown again.</div></div>
          <button onClick={() => setToast(null)} className="btn-ghost">Dismiss</button>
        </div>
      )}
      {error && <p className="text-crit text-sm">{error}</p>}
      <div className="flex items-center gap-3">
        <label className="relative flex-1 max-w-md"><I.Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input className="input pl-10" placeholder="Search employee ID, name, role…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <div className="ml-auto text-[13px] text-muted tnum">{rows.length} users</div>
      </div>
      <section className="card overflow-x-auto">
        <table className="w-full text-[14px]">
          <thead><tr className="text-left eyebrow border-b border-line">{['Employee', 'Name', 'Role', 'Site', '2FA', 'Status', ''].map((h, i) => <th key={i} className="px-5 py-2.5 font-semibold">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-b border-line last:border-0 hover:bg-navy-100/40">
                <td className="px-5 py-3 font-mono text-[13px] font-medium text-navy-800">{u.employeeId}{u.id === me?.id && <span className="ml-2 text-[10px] text-muted">(you)</span>}</td>
                <td className="px-5 py-3 font-medium">{u.name}{u.mustChangePassword && <span className="ml-2 text-[11px] text-hazard">must change password</span>}</td>
                <td className="px-5 py-3"><span className={`px-2 py-0.5 text-[11px] font-bold tracking-wider ${roleTone[u.role]}`}>{u.role}</span></td>
                <td className="px-5 py-3 text-muted">{u.site?.name ?? '—'}</td>
                <td className="px-5 py-3 text-[12px]">{['MANAGER', 'ADMIN'].includes(u.role) ? (u.totpEnabled ? <span className="text-ok font-semibold">Enabled</span> : <span className="text-hazard font-semibold">Pending enrolment</span>) : <span className="text-muted">n/a</span>}</td>
                <td className="px-5 py-3"><span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold ${u.status === 'ACTIVE' ? 'text-ok' : 'text-crit'}`}><span className={`h-1.5 w-1.5 ${u.status === 'ACTIVE' ? 'bg-ok' : 'bg-crit'}`} />{u.status === 'ACTIVE' ? 'Active' : 'Disabled'}</span></td>
                <td className="px-5 py-3 text-right whitespace-nowrap">
                  <button onClick={() => reset(u)} className="btn-ghost text-[12px]">Reset password</button>
                  {u.id !== me?.id && <button onClick={() => toggle(u)} className={`btn-ghost text-[12px] ${u.status === 'ACTIVE' ? 'text-crit' : 'text-ok'}`}>{u.status === 'ACTIVE' ? 'Disable' : 'Enable'}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {creating && (
        <div className="fixed inset-0 z-20 flex justify-end bg-navy-900/40 backdrop-blur-[2px]" onClick={() => setCreating(false)}>
          <form onSubmit={create} onClick={(e) => e.stopPropagation()} className="h-full w-full max-w-[460px] bg-surface shadow-card flex flex-col">
            <header className="px-6 py-5 border-b border-line"><div className="eyebrow">User management</div><h2 className="font-display font-semibold text-[26px] text-navy-800">New user</h2><p className="text-[13px] text-muted">They’ll be asked to change the temporary password on first sign-in. Managers and admins will also enrol in 2FA.</p></header>
            <div className="p-6 flex flex-col gap-4 flex-1">
              <label className="flex flex-col gap-1.5 text-[13px] font-medium">Employee ID<input className="input font-mono uppercase" required value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} placeholder="OPR002" /></label>
              <label className="flex flex-col gap-1.5 text-[13px] font-medium">Full name<input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-1.5 text-[13px] font-medium">Role<select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></label>
                <label className="flex flex-col gap-1.5 text-[13px] font-medium">Site<select className="input" value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })}>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
              </div>
              <label className="flex flex-col gap-1.5 text-[13px] font-medium">Temporary password <span className="text-muted font-normal">min. 8 characters</span><input className="input font-mono" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
              {error && <p className="text-[13px] text-crit border-l-2 border-crit pl-3">{error}</p>}
            </div>
            <footer className="px-6 py-4 border-t border-line flex justify-end gap-2"><button type="button" onClick={() => setCreating(false)} className="btn-ghost">Cancel</button><button className="btn-primary h-10">Create user</button></footer>
          </form>
        </div>
      )}
    </Shell>
  );
}
