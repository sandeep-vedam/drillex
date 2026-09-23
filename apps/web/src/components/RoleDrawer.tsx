'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Permissions, type Permission } from '@drillex/shared';
import { I } from './Icons';

type Grant = { permission: string; scope: string };
export type EditableRole = { id: string; key: string; name: string; isSystem: boolean; permissions: Grant[] };
type Scope = 'self' | 'site' | 'all';
const SCOPES: Scope[] = ['self', 'site', 'all'];

const GROUP_LABEL: Record<string, string> = {
  user: 'User management', asset: 'Assets', shift_report: 'Shift reports', daily_reading: 'Daily readings',
  maintenance: 'Maintenance', job_card: 'Job cards', parts: 'Parts', report: 'Reports', role: 'Roles',
  notification: 'Notifications', audit: 'Audit',
};
const groups = Permissions.reduce<{ label: string; perms: Permission[] }[]>((acc, p) => {
  const label = GROUP_LABEL[p.split(':')[0]] ?? 'Other';
  const g = acc.find((x) => x.label === label);
  if (g) g.perms.push(p); else acc.push({ label, perms: [p] });
  return acc;
}, []);

const slugPreview = (name: string) => name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || '—';

export function RoleDrawer({ open, onClose, onSaved, role }: { open: boolean; onClose: () => void; onSaved: () => void; role?: EditableRole | null }) {
  const [name, setName] = useState('');
  const [grants, setGrants] = useState<Partial<Record<Permission, Scope>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setName(role?.name ?? '');
    const next: Partial<Record<Permission, Scope>> = {};
    for (const g of role?.permissions ?? []) next[g.permission as Permission] = g.scope as Scope;
    setGrants(next);
  }, [open, role]);

  function toggle(p: Permission) {
    setGrants((g) => { const next = { ...g }; if (next[p]) delete next[p]; else next[p] = 'site'; return next; });
  }
  function setScope(p: Permission, scope: Scope) {
    setGrants((g) => ({ ...g, [p]: scope }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    const permissions = (Object.entries(grants) as [Permission, Scope][]).map(([permission, scope]) => ({ permission, scope }));
    try {
      if (role) await api(`/roles/${role.id}`, { method: 'PATCH', body: JSON.stringify({ name, permissions }) });
      else await api('/roles', { method: 'POST', body: JSON.stringify({ name, permissions }) });
      onSaved(); onClose();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-navy-900/40 backdrop-blur-[2px]" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="h-full w-full max-w-[560px] bg-surface shadow-card flex flex-col">
        <header className="px-6 py-5 border-b border-line flex items-start justify-between">
          <div>
            <div className="eyebrow">Roles &amp; permissions</div>
            <h2 className="font-display font-semibold text-[26px] text-navy-800">{role ? `Edit ${role.name}` : 'New role'}</h2>
            <p className="text-[13px] text-muted">Key: <span className="font-mono text-ink">{role ? role.key : slugPreview(name)}</span>{!role && <span> — assigned automatically, never changes</span>}</p>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost" aria-label="Close">✕</button>
        </header>
        <div className="p-6 flex flex-col gap-5 overflow-y-auto flex-1">
          <label className="flex flex-col gap-1.5 text-[13px] font-medium">Role name<input className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Site Coordinator" /></label>
          <div className="flex flex-col gap-4">
            {groups.map((g) => (
              <div key={g.label}>
                <div className="eyebrow mb-1.5">{g.label}</div>
                <div className="border border-line divide-y divide-line">
                  {g.perms.map((p) => {
                    const scope = grants[p];
                    return (
                      <div key={p} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                        <label className="flex items-center gap-2.5 flex-1 cursor-pointer">
                          <input type="checkbox" checked={!!scope} onChange={() => toggle(p)} />
                          <span className="font-mono">{p}</span>
                        </label>
                        {scope && (
                          <select className="input !py-1 !px-2 w-auto text-[12px]" value={scope} onChange={(e) => setScope(p, e.target.value as Scope)}>
                            {SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {error && <p role="alert" className="text-[13px] text-crit border-l-2 border-crit pl-3">{error}</p>}
        </div>
        <footer className="px-6 py-4 border-t border-line flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button disabled={busy || !name.trim()} className="btn-primary h-10"><I.Plus /> {busy ? 'Saving…' : role ? 'Save changes' : 'Create role'}</button>
        </footer>
      </form>
    </div>
  );
}
