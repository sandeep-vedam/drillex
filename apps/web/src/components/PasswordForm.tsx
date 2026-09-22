'use client';
import { useState } from 'react';
import { PasswordInput } from './PasswordInput';
import { api } from '@/lib/api';

export function PasswordForm({ onDone, forced }: { onDone: () => void; forced?: boolean }) {
  const [cur, setCur] = useState(''); const [nw, setNw] = useState(''); const [rep, setRep] = useState('');
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const strength = [nw.length >= 8, /[A-Z]/.test(nw), /[0-9]/.test(nw), /[^A-Za-z0-9]/.test(nw)].filter(Boolean).length;
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    if (nw !== rep) { setError('New passwords do not match.'); return; }
    setBusy(true);
    try {
      await api('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: cur, newPassword: nw }) });
      const u = JSON.parse(localStorage.getItem('user') ?? '{}'); u.mustChangePassword = false; localStorage.setItem('user', JSON.stringify(u));
      onDone();
    } catch (err) { setError((err as Error).message === 'Unauthorized' ? 'Current password is incorrect.' : (err as Error).message); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4 max-w-[420px]">
      <PasswordInput label={forced ? 'Temporary password' : 'Current password'} required value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />
      <PasswordInput label="New password" required minLength={8} value={nw} onChange={(e) => setNw(e.target.value)} autoComplete="new-password" >
        <div className="flex gap-1 mt-1">{[0, 1, 2, 3].map((i) => <span key={i} className={`h-1 flex-1 ${i < strength ? (strength < 3 ? 'bg-hazard' : 'bg-ok') : 'bg-line'}`} />)}</div>
        <span className="text-[12px] text-muted font-normal">At least 8 characters; mix upper-case, numbers and symbols for a stronger password.</span></PasswordInput>
      <PasswordInput label="Repeat new password" required value={rep} onChange={(e) => setRep(e.target.value)} autoComplete="new-password" />
      {error && <p role="alert" className="text-[13px] text-crit border-l-2 border-crit pl-3">{error}</p>}
      <button disabled={busy} className="btn-primary h-11 self-start px-6">{busy ? 'Saving…' : forced ? 'Set password and continue' : 'Update password'}</button>
    </form>
  );
}
