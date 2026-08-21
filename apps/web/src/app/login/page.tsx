'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, deviceId } from '@/lib/api';
import { Wordmark } from '@/components/Brand';

export default function LoginPage() {
  const r = useRouter();
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const res = await api<{ accessToken?: string; refreshToken?: string; user?: unknown; requires2faSetup?: boolean }>('/auth/login', {
        method: 'POST', body: JSON.stringify({ employeeId: employeeId.trim().toUpperCase(), password, deviceId: deviceId(), totp: totp || undefined }) });
      if (res.requires2faSetup) { sessionStorage.setItem('pending2fa', JSON.stringify({ employeeId: employeeId.trim().toUpperCase(), password })); r.push('/2fa'); return; }
      localStorage.setItem('accessToken', res.accessToken!); localStorage.setItem('refreshToken', res.refreshToken!); localStorage.setItem('user', JSON.stringify(res.user));
      r.push((res.user as { mustChangePassword?: boolean })?.mustChangePassword ? '/change-password' : '/dashboard');
    } catch (err) { setError((err as Error).message === 'Unauthorized' ? 'Employee ID or password is incorrect.' : (err as Error).message); } finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen grid lg:grid-cols-[1.1fr_1fr]">
      <section className="blueprint relative hidden lg:flex flex-col justify-between p-12 text-white overflow-hidden">
        <Wordmark light />
        <div className="relative">
          <div className="font-display text-[11px] tracking-[.3em] text-hazard mb-4">FIELD OPERATIONS · MAINTENANCE · REPORTING</div>
          <h2 className="font-display font-bold text-[64px] leading-[.95] max-w-[12ch] text-balance">Every rig, every shift, one record.</h2>
          <p className="mt-6 max-w-[44ch] text-white/65 text-[16px] leading-relaxed">Shift production, daily machine readings, maintenance schedules and job cards — captured on site, synced to one ledger, approved by your supervisors.</p>
          <dl className="mt-10 grid grid-cols-3 gap-6 max-w-md">
            {[['Offline-first', 'works without signal'], ['Audit trail', 'every edit logged'], ['RBAC', 'role-secured at API']].map(([k, v]) => (
              <div key={k} className="border-t border-white/20 pt-3"><dt className="font-display font-semibold text-[17px]">{k}</dt><dd className="text-[12px] text-white/55">{v}</dd></div>
            ))}
          </dl>
        </div>
        <div className="text-[11px] text-white/40 tracking-wider">CONFIDENTIAL · INTERNAL USE ONLY</div>
        <div aria-hidden className="absolute -right-24 -bottom-24 h-[420px] w-[420px] rounded-full border-[28px] border-hazard/20" />
        <div aria-hidden className="absolute right-10 bottom-10 h-[160px] w-[160px] rounded-full border-[14px] border-hazard/40" />
      </section>
      <section className="grid place-items-center p-8 bg-canvas">
        <form onSubmit={submit} className="w-full max-w-[400px] flex flex-col gap-5">
          <div className="lg:hidden mb-2"><Wordmark /></div>
          <div><div className="eyebrow">Sign in</div><h1 className="font-display font-semibold text-[36px] text-navy-800 leading-tight">Welcome back</h1><p className="text-muted text-[14px]">Use your Employee ID and personal password. No shared logins.</p></div>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium">Employee ID<input className="input font-mono uppercase tracking-wider" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required autoComplete="username" placeholder="OPR001" /></label>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium">Password<input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="current-password" placeholder="••••••••" /></label>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium"><span>2FA code <span className="text-muted font-normal">— managers &amp; admins</span></span><input className="input font-mono tracking-[.4em]" inputMode="numeric" maxLength={6} value={totp} onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))} placeholder="000000" /></label>
          {error && <p role="alert" className="text-[13px] text-crit border-l-2 border-crit pl-3">{error}</p>}
          <button disabled={busy} className="btn-primary h-12 text-[15px]">{busy ? 'Signing in…' : 'Sign in'}</button>
          <p className="text-[12px] text-muted">Forgot your password? Ask your supervisor or administrator to reset it.</p>
        </form>
      </section>
    </main>
  );
}
