'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

const ALL_ROLES = ['OPERATOR', 'TECHNICIAN', 'SUPERVISOR', 'MANAGER', 'ADMIN'];

export function TwoFaRolesForm() {
  const [roles, setRoles] = useState<string[] | null>(null);
  const [saved, setSaved] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ roles: string[] }>('/settings/2fa-roles').then((r) => { setRoles(r.roles); setSaved(r.roles); }).catch((e) => setError((e as Error).message));
  }, []);

  function toggle(role: string) {
    if (!roles) return;
    setRoles(roles.includes(role) ? roles.filter((r) => r !== role) : [...roles, role]);
  }

  async function save() {
    if (!roles) return;
    setBusy(true); setError(null);
    try {
      const r = await api<{ roles: string[] }>('/settings/2fa-roles', { method: 'PATCH', body: JSON.stringify({ roles }) });
      setRoles(r.roles); setSaved(r.roles);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  if (error) return <p className="text-[13px] text-crit border-l-2 border-crit pl-3">{error}</p>;
  if (!roles) return <p className="text-[13px] text-muted">Loading…</p>;

  const dirty = JSON.stringify([...roles].sort()) !== JSON.stringify([...(saved ?? [])].sort());

  return (
    <div className="flex flex-col gap-4 max-w-[480px]">
      <div className="flex flex-wrap gap-3">
        {ALL_ROLES.map((role) => (
          <label key={role} className="flex items-center gap-2 text-[13px] font-medium border border-line rounded px-3 py-2 cursor-pointer">
            <input type="checkbox" checked={roles.includes(role)} onChange={() => toggle(role)} />
            {role}
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button disabled={busy || !dirty} onClick={save} className="btn-primary h-10 px-6 self-start disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
        {!dirty && saved && <span className="text-[12px] text-muted">Up to date.</span>}
      </div>
      {roles.length === 0 && <p className="text-[12px] text-hazard">No role currently requires 2FA — anyone can sign in with just a password.</p>}
    </div>
  );
}
