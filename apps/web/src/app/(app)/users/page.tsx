'use client';
import { useCallback, useEffect, useState } from 'react';
import { BLOCK_REASONS, roleDescription } from '@drillex/shared';
import { Shell } from '@/components/Shell';
import { I } from '@/components/Icons';
import { api, getUser } from '@/lib/api';
import { Drawer, ErrorText, Field, fmtDate, Modal, Notice } from '@/components/kit';

type U = {
  id: string; employeeId: string; name: string; role: string; status: 'ACTIVE' | 'DISABLED' | 'BLOCKED' | 'SUSPENDED'; statusReason: string | null; statusChangedAt: string | null; failedLogins: number;
  phone: string | null; siteId: string | null; site?: { name: string } | null; totpEnabled: boolean; mustChangePassword: boolean; tempCredentialExpiresAt: string | null;
  usesPin: boolean; lastLoginAt: string | null; machines: { id: string; assetNumber: string }[];
};
type Asset = { id: string; assetNumber: string; name: string };
const roleTone: Record<string, string> = { ADMIN: 'bg-crit/10 text-crit', MANAGER: 'bg-navy-100 text-navy-800', SUPERVISOR: 'bg-hazard/10 text-hazard', TECHNICIAN: 'bg-steel/10 text-steel', OPERATOR: 'bg-ok/10 text-ok', FINANCE: 'bg-navy-100 text-navy-800', PLANT_HIRE_SUPERVISOR: 'bg-hazard/10 text-hazard' };
const STATUS: Record<U['status'], { label: string; cls: string }> = {
  ACTIVE: { label: 'Active', cls: 'text-ok bg-ok' }, BLOCKED: { label: 'Blocked', cls: 'text-crit bg-crit' }, SUSPENDED: { label: 'Suspended', cls: 'text-hazard bg-hazard' }, DISABLED: { label: 'Deactivated', cls: 'text-muted bg-steel' },
};
const BASE = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? '/api/v1' : 'http://localhost:4000/api/v1');

/** User management (client spec §10.7). */
export default function UsersPage() {
  const me = getUser();
  const [users, setUsers] = useState<U[]>([]);
  const [roles, setRoles] = useState<{ key: string; name: string }[]>([]);
  const [roles2fa, setRoles2fa] = useState<string[]>([]);
  const [sites, setSites] = useState<{ id: string; name: string }[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<U['status'] | ''>('');
  const [editing, setEditing] = useState<U | 'new' | null>(null);
  const [blocking, setBlocking] = useState<U | null>(null);
  const [notice, setNotice] = useState<{ title: string; value?: string; note?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api<U[]>('/users').then(setUsers).catch((e) => setError(e.message)), []);
  useEffect(() => {
    load();
    api<{ id: string; name: string }[]>('/sites').then(setSites).catch(() => {});
    api<Asset[]>('/assets').then(setAssets).catch(() => {});
    api<{ key: string; name: string }[]>('/roles').then(setRoles).catch(() => {});
    api<{ roles: string[] }>('/settings/2fa-roles').then((r) => setRoles2fa(r.roles)).catch(() => {});
  }, [load]);

  const credentialNotice = (who: string, r: { temporaryPassword: string; usesPin: boolean; expiresAt: string }) =>
    setNotice({ title: `Temporary ${r.usesPin ? 'PIN' : 'password'} for ${who}`, value: r.temporaryPassword, note: `Give it to them in person or by phone. It works once, expires ${new Date(r.expiresAt).toLocaleString()}, and they must set their own ${r.usesPin ? '4-digit PIN' : 'password'} when they sign in. It is not shown again.` });

  async function reset(u: U) {
    if (!confirm(`Issue a new temporary ${u.usesPin ? 'PIN' : 'password'} for ${u.employeeId} (${u.name})? They will be signed out everywhere.`)) return;
    try { credentialNotice(u.employeeId, await api(`/users/${u.id}/reset-password`, { method: 'POST' })); load(); } catch (e) { setError((e as Error).message); }
  }
  async function setUserStatus(u: U, next: U['status'], reason?: string) {
    try { await api(`/users/${u.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: next, reason }) }); load(); setNotice({ title: `${u.employeeId} is now ${STATUS[next].label.toLowerCase()}` }); } catch (e) { setError((e as Error).message); }
  }
  async function changeRole(u: U, role: string) {
    if (role === u.role || !confirm(`Change ${u.employeeId}'s role to ${roles.find((r) => r.key === role)?.name ?? role}?`)) return;
    try { await api(`/users/${u.id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }); load(); } catch (e) { setError((e as Error).message); }
  }
  async function exportCsv() {
    const res = await fetch(`${BASE}/users/export.csv`, { headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` } });
    if (!res.ok) { setError('Could not export the user list'); return; }
    const url = URL.createObjectURL(await res.blob());
    Object.assign(document.createElement('a'), { href: url, download: `drillex-users-${new Date().toISOString().slice(0, 10)}.csv` }).click();
    URL.revokeObjectURL(url);
  }
  const rows = users.filter((u) => (!status || u.status === status) && `${u.employeeId} ${u.name} ${u.role} ${u.phone ?? ''} ${u.machines.map((m) => m.assetNumber).join(' ')}`.toLowerCase().includes(q.toLowerCase()));
  const count = (s: U['status']) => users.filter((u) => u.status === s).length;

  return (
    <Shell title="People" actions={<div className="flex gap-2"><button onClick={exportCsv} className="btn-ghost border border-line h-9 text-[13px]">Export CSV</button><button onClick={() => setEditing('new')} className="btn-primary h-9 text-[13px]"><I.Plus /> Add user</button></div>}>
      {notice && <Notice title={notice.title} value={notice.value} note={notice.note} onClose={() => setNotice(null)} />}
      <ErrorText>{error}</ErrorText>
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative flex-1 min-w-[220px] max-w-md"><I.Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input className="input pl-10" placeholder="Search ID, name, role, machine, phone…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <div className="flex flex-wrap gap-1">{(['', 'ACTIVE', 'BLOCKED', 'SUSPENDED', 'DISABLED'] as const).map((s) => <button key={s} onClick={() => setStatus(s)} className={`px-3 py-1.5 text-[12px] font-semibold border ${status === s ? 'bg-navy-800 text-white border-navy-800' : 'bg-surface border-line'}`}>{s ? STATUS[s].label : 'All'}{s && count(s) ? <span className="ml-1 tnum opacity-70">{count(s)}</span> : null}</button>)}</div>
        <div className="ml-auto text-[13px] text-muted tnum">{rows.length} people</div>
      </div>
      <section className="card overflow-x-auto">
        <table className="w-full text-[14px]">
          <thead><tr className="text-left eyebrow border-b border-line">{['Employee', 'Name', 'Role', 'Machines', 'Contact', 'Sign-in', 'Status', 'Last sign-in', ''].map((h, i) => <th key={i} className="px-4 py-2.5 font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-b border-line last:border-0 hover:bg-navy-100/40 align-top">
                <td className="px-4 py-3 font-mono text-[13px] font-medium text-navy-800 whitespace-nowrap">{u.employeeId}{u.id === me?.id && <span className="ml-2 text-[10px] text-muted">(you)</span>}</td>
                <td className="px-4 py-3 font-medium">{u.name}{u.mustChangePassword && <div className="text-[11px] text-hazard">{u.tempCredentialExpiresAt && new Date(u.tempCredentialExpiresAt) < new Date() ? 'temporary credential expired' : 'temporary credential issued'}</div>}</td>
                <td className="px-4 py-3">
                  {roles.length ? <select className={`text-[11px] font-bold tracking-wider border-0 px-2 py-0.5 ${roleTone[u.role] ?? 'bg-navy-100 text-navy-800'}`} value={u.role} onChange={(e) => changeRole(u, e.target.value)} disabled={u.id === me?.id}>{roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}</select>
                    : <span className={`px-2 py-0.5 text-[11px] font-bold tracking-wider ${roleTone[u.role] ?? 'bg-navy-100 text-navy-800'}`}>{u.role}</span>}
                </td>
                <td className="px-4 py-3 font-mono text-[12px]">{u.machines.map((m) => m.assetNumber).join(', ') || <span className="text-muted">—</span>}</td>
                <td className="px-4 py-3 text-[13px] whitespace-nowrap">{u.phone ?? <span className="text-muted">—</span>}</td>
                <td className="px-4 py-3 text-[12px] whitespace-nowrap">{u.usesPin ? 'PIN' : 'Password'}{roles2fa.includes(u.role) && <div className={u.totpEnabled ? 'text-ok' : 'text-hazard'}>{u.totpEnabled ? '2FA on' : '2FA pending'}</div>}</td>
                <td className="px-4 py-3"><span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold ${STATUS[u.status].cls.split(' ')[0]}`}><span className={`h-1.5 w-1.5 ${STATUS[u.status].cls.split(' ')[1]}`} />{STATUS[u.status].label}</span>{u.statusReason && <div className="text-[11px] text-muted max-w-[200px]">{u.statusReason}</div>}</td>
                <td className="px-4 py-3 text-[12px] text-muted whitespace-nowrap">{u.lastLoginAt ? fmtDate(u.lastLoginAt) : 'never'}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => setEditing(u)} className="btn-ghost text-[12px]">Edit</button>
                  <button onClick={() => reset(u)} className="btn-ghost text-[12px]">Reset {u.usesPin ? 'PIN' : 'password'}</button>
                  {u.id !== me?.id && (u.status === 'ACTIVE'
                    ? <button onClick={() => setBlocking(u)} className="btn-ghost text-[12px] text-crit">Block</button>
                    : <button onClick={() => setUserStatus(u, 'ACTIVE')} className="btn-ghost text-[12px] text-ok">{u.status === 'SUSPENDED' ? 'Unlock' : u.status === 'BLOCKED' ? 'Unblock' : 'Reactivate'}</button>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <UserDrawer open={editing !== null} user={editing === 'new' ? null : editing} roles={roles} sites={sites} assets={assets} onClose={() => setEditing(null)}
        onCreated={(r) => { credentialNotice(r.employeeId, r); load(); }} onSaved={() => { setNotice({ title: 'Changes saved' }); load(); }} />
      <BlockDialog user={blocking} onClose={() => setBlocking(null)} onBlock={(u, reason) => { setBlocking(null); setUserStatus(u, 'BLOCKED', reason); }} />
    </Shell>
  );
}

function BlockDialog({ user, onClose, onBlock }: { user: U | null; onClose: () => void; onBlock: (u: U, reason: string) => void }) {
  const [reason, setReason] = useState(BLOCK_REASONS[0]);
  const [other, setOther] = useState('');
  useEffect(() => { setReason(BLOCK_REASONS[0]); setOther(''); }, [user]);
  const final = reason === 'Other' ? other.trim() : reason;
  return (
    <Modal open={!!user} onClose={onClose} title={user ? `Block ${user.employeeId} — ${user.name}` : ''}
      footer={<><button onClick={onClose} className="btn-ghost">Cancel</button><button disabled={final.length < 3} onClick={() => user && onBlock(user, final)} className="btn-primary h-10 !bg-crit">Block account now</button></>}>
      <p className="text-[14px]">They are signed out on every device immediately and cannot sign in again. Everything they submitted stays on record for audit.</p>
      <div className="flex flex-wrap gap-2">{BLOCK_REASONS.map((r) => <button key={r} type="button" onClick={() => setReason(r)} className={`px-3 py-1.5 text-[13px] font-semibold border ${reason === r ? 'bg-navy-800 text-white border-navy-800' : 'bg-surface border-line'}`}>{r}</button>)}</div>
      {reason === 'Other' && <input className="input" autoFocus value={other} onChange={(e) => setOther(e.target.value)} placeholder="Reason" />}
    </Modal>
  );
}

function UserDrawer({ open, user, roles, sites, assets, onClose, onCreated, onSaved }: {
  open: boolean; user: U | null; roles: { key: string; name: string }[]; sites: { id: string; name: string }[]; assets: Asset[];
  onClose: () => void; onCreated: (r: { employeeId: string; temporaryPassword: string; usesPin: boolean; expiresAt: string }) => void; onSaved: () => void;
}) {
  const [f, setF] = useState({ employeeId: '', name: '', role: 'OPERATOR', siteId: '', phone: '', assetIds: [] as string[] });
  const [machineQ, setMachineQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setError(null); setMachineQ('');
    setF(user ? { employeeId: user.employeeId, name: user.name, role: user.role, siteId: user.siteId ?? '', phone: user.phone ?? '', assetIds: user.machines.map((m) => m.id) } : { employeeId: '', name: '', role: 'OPERATOR', siteId: sites[0]?.id ?? '', phone: '', assetIds: [] });
  }, [open, user, sites]);
  // Suggest the next ID for the role (client spec §10.6); the admin may overwrite it.
  useEffect(() => { if (open && !user) api<{ employeeId: string | null }>(`/users/next-id?role=${f.role}`).then((r) => setF((x) => ({ ...x, employeeId: r.employeeId ?? '' }))).catch(() => {}); }, [open, user, f.role]);
  const toggle = (id: string) => setF((x) => ({ ...x, assetIds: x.assetIds.includes(id) ? x.assetIds.filter((a) => a !== id) : [...x.assetIds, id] }));

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      if (user) {
        await api(`/users/${user.id}`, { method: 'PATCH', body: JSON.stringify({ name: f.name, phone: f.phone || null, siteId: f.siteId || null, assetIds: f.assetIds }) });
        onSaved();
      } else {
        onCreated(await api('/users', { method: 'POST', body: JSON.stringify({ employeeId: f.employeeId || undefined, name: f.name, role: f.role, siteId: f.siteId || undefined, phone: f.phone || undefined, assetIds: f.assetIds }) }));
      }
      onClose();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  const shown = assets.filter((a) => `${a.assetNumber} ${a.name}`.toLowerCase().includes(machineQ.toLowerCase()));
  return (
    <Drawer open={open} onClose={onClose} onSubmit={save} eyebrow="User management" title={user ? `Edit ${user.employeeId}` : 'Add user'}
      intro={user ? 'Change the role from the list itself, so it is audited as a role change.' : 'A temporary PIN (field roles) or password (office roles) is generated and shown once. It expires in 24 hours.'}
      footer={<><button type="button" onClick={onClose} className="btn-ghost">Cancel</button><button disabled={busy} className="btn-primary h-10">{busy ? 'Saving…' : user ? 'Save changes' : 'Add user'}</button></>}>
      {!user && (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Role" required><select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}</select></Field>
          <Field label="Employee ID" required hint="suggested"><input className="input font-mono uppercase" value={f.employeeId} onChange={(e) => setF({ ...f, employeeId: e.target.value.toUpperCase() })} placeholder="OPR004" /></Field>
          {roleDescription(f.role) && <p className="col-span-2 text-[12px] text-muted -mt-2">{roleDescription(f.role)}</p>}
        </div>
      )}
      <Field label="Full name" required><input className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Contact number"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+260 …" /></Field>
        <Field label="Site / client"><select className="input" value={f.siteId} onChange={(e) => setF({ ...f, siteId: e.target.value })}><option value="">—</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      </div>
      <Field label="Assigned machines" hint={`${f.assetIds.length} selected`}>
        <input className="input" placeholder="Filter machines…" value={machineQ} onChange={(e) => setMachineQ(e.target.value)} />
        <div className="border border-line max-h-[220px] overflow-y-auto divide-y divide-line">
          {shown.map((a) => <label key={a.id} className="flex items-center gap-2 px-3 py-2 text-[13px] font-normal cursor-pointer hover:bg-navy-100/40"><input type="checkbox" checked={f.assetIds.includes(a.id)} onChange={() => toggle(a.id)} /><span className="font-mono font-semibold">{a.assetNumber}</span><span className="text-muted">{a.name}</span></label>)}
          {!shown.length && <div className="px-3 py-3 text-[13px] text-muted">No machines.</div>}
        </div>
      </Field>
      <ErrorText>{error}</ErrorText>
    </Drawer>
  );
}
