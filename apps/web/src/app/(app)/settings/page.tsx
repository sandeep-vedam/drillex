'use client';
import { useState } from 'react';
import { Shell } from '@/components/Shell';
import { PasswordForm } from '@/components/PasswordForm';
import { TwoFaRolesForm } from '@/components/TwoFaRolesForm';
import { OperationsForm } from '@/components/OperationsForm';
import { getUser } from '@/lib/api';
import { useRoleMatrix } from '@/lib/permissions';
import { can } from '@drillex/shared';
export default function SettingsPage() {
  const u = getUser(); const [done, setDone] = useState(false);
  const matrix = useRoleMatrix();
  const canManageUsers = !!matrix && !!can(matrix, u?.role, 'user:manage');
  return (
    <Shell title="Settings">
      <div className="grid lg:grid-cols-[320px_minmax(0,1fr)] gap-6">
        <section className="card p-5 self-start"><div className="eyebrow">Profile</div><div className="mt-2 font-mono text-[22px] font-semibold text-navy-800">{u?.employeeId}</div><div className="text-[13px] text-muted tracking-wide">{u?.role}</div><p className="mt-4 text-[13px] text-muted">Profile details are managed by your administrator.</p></section>
        <section className="card p-6"><h2 className="font-display font-semibold text-[22px] text-navy-800 mb-1">Change password</h2><p className="text-[13px] text-muted mb-5">Minimum 8 characters (SRS §2.2). You stay signed in on this device.</p>{done ? <p className="text-ok font-medium">Password updated.</p> : <PasswordForm onDone={() => setDone(true)} />}</section>
        {canManageUsers && (
          <section className="card p-6 lg:col-span-2"><h2 className="font-display font-semibold text-[22px] text-navy-800 mb-1">Security</h2><p className="text-[13px] text-muted mb-5">Choose which roles must enrol in two-factor authentication to sign in. Unchecked roles sign in with just employee ID + password.</p><TwoFaRolesForm /></section>
        )}
        {canManageUsers && (
          <section className="card p-6 lg:col-span-2"><h2 className="font-display font-semibold text-[22px] text-navy-800 mb-1">Operations</h2><p className="text-[13px] text-muted mb-5">When machine checks raise an alert, and whether finished repairs need sign-off.</p><OperationsForm /></section>
        )}
      </div>
    </Shell>
  );
}
