'use client';
import { useEffect, useState } from 'react';
import { Shell } from '@/components/Shell';
import { I } from '@/components/Icons';
import { api } from '@/lib/api';
import { RoleDrawer, type EditableRole } from '@/components/RoleDrawer';

export default function RolesPage() {
  type Row = EditableRole & { userCount: number };
  const [roles, setRoles] = useState<Row[]>([]);
  const [drawer, setDrawer] = useState<'closed' | 'new' | Row>('closed');
  const [error, setError] = useState<string | null>(null);
  const load = () => api<Row[]>('/roles').then(setRoles).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function remove(r: Row) {
    if (!confirm(`Delete the "${r.name}" role? This cannot be undone.`)) return;
    try { await api(`/roles/${r.id}`, { method: 'DELETE' }); load(); } catch (e) { setError((e as Error).message); }
  }

  return (
    <Shell title="Roles & permissions" actions={<button onClick={() => setDrawer('new')} className="btn-primary h-9 text-[13px]"><I.Plus /> New role</button>}>
      {error && <p className="text-crit text-sm">{error}</p>}
      <section className="card overflow-x-auto">
        <table className="w-full text-[14px]">
          <thead><tr className="text-left eyebrow border-b border-line">{['Role', 'Key', 'Permissions', 'Users', ''].map((h) => <th key={h} className="px-5 py-2.5 font-semibold">{h}</th>)}</tr></thead>
          <tbody>
            {roles.map((r) => {
              const blockedReason = r.isSystem ? 'Built-in roles cannot be deleted' : r.userCount > 0 ? `${r.userCount} user(s) still have this role` : null;
              return (
                <tr key={r.id} className="border-b border-line last:border-0 hover:bg-navy-100/40">
                  <td className="px-5 py-3 font-medium">{r.name}{r.isSystem && <span className="ml-2 text-[10px] text-muted uppercase tracking-wide">built-in</span>}</td>
                  <td className="px-5 py-3 font-mono text-[12px] text-muted">{r.key}</td>
                  <td className="px-5 py-3 tnum text-muted">{r.permissions.length}</td>
                  <td className="px-5 py-3 tnum text-muted">{r.userCount}</td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    <button onClick={() => setDrawer(r)} className="btn-ghost text-[12px]">Edit</button>
                    <button onClick={() => remove(r)} disabled={!!blockedReason} title={blockedReason ?? undefined} className="btn-ghost text-[12px] text-crit disabled:opacity-40 disabled:cursor-not-allowed">Delete</button>
                  </td>
                </tr>
              );
            })}
            {!roles.length && <tr><td colSpan={5} className="px-5 py-12 text-center text-muted">No roles yet.</td></tr>}
          </tbody>
        </table>
      </section>
      <RoleDrawer open={drawer !== 'closed'} onClose={() => setDrawer('closed')} onSaved={load} role={drawer === 'closed' || drawer === 'new' ? null : drawer} />
    </Shell>
  );
}
