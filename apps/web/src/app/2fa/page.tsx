'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { api, deviceId } from '@/lib/api';
import { Wordmark } from '@/components/Brand';

export default function TwoFactorSetup() {
  const r = useRouter();
  const [creds, setCreds] = useState<{ employeeId: string; password: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem('pending2fa');
    if (!raw) { r.replace('/login'); return; }
    const c = JSON.parse(raw); setCreds(c);
    api<{ otpauth: string; secret: string }>('/auth/2fa/setup', { method: 'POST', body: JSON.stringify(c) })
      .then(async (res) => { setSecret(res.secret); setQr(await QRCode.toDataURL(res.otpauth, { margin: 1, width: 220, color: { dark: '#0B1B30', light: '#FFFFFF' } })); })
      .catch((e) => setError(e.message));
  }, [r]);

  async function confirm(e: React.FormEvent) {
    e.preventDefault(); if (!creds) return; setBusy(true); setError(null);
    try {
      const res = await api<{ accessToken: string; refreshToken: string; user: unknown }>('/auth/2fa/enable', { method: 'POST', body: JSON.stringify({ ...creds, totp: code, deviceId: deviceId() }) });
      localStorage.setItem('accessToken', res.accessToken); localStorage.setItem('refreshToken', res.refreshToken); localStorage.setItem('user', JSON.stringify(res.user));
      sessionStorage.removeItem('pending2fa'); r.push('/dashboard');
    } catch (err) { setError((err as Error).message === 'Unauthorized' ? 'That code didn’t match. Check the time on your phone and try again.' : (err as Error).message); } finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen grid place-items-center p-8 bg-canvas">
      <div className="w-full max-w-[820px] card grid md:grid-cols-[1fr_1.1fr]">
        <section className="blueprint text-white p-8 flex flex-col justify-between">
          <Wordmark light />
          <div><div className="font-display text-[11px] tracking-[.3em] text-hazard mb-3">SECURITY · STEP 1 OF 1</div><h1 className="font-display font-bold text-[40px] leading-none text-balance">Two-factor authentication</h1><p className="mt-4 text-white/65 text-[14px] leading-relaxed">Manager and Administrator accounts must use a second factor. Scan the code with Google Authenticator, Microsoft Authenticator or 1Password, then enter the 6-digit code.</p></div>
          <div className="text-[11px] text-white/40 tracking-wider">SRS §2.2 · 2FA REQUIRED FOR MANAGER &amp; ADMIN</div>
        </section>
        <form onSubmit={confirm} className="p-8 flex flex-col gap-5">
          <div className="flex gap-6 items-start">
            <div className="h-[220px] w-[220px] border border-line bg-white grid place-items-center shrink-0">{qr ? <img src={qr} alt="Scan in your authenticator app" width={220} height={220} /> : <span className="text-muted text-sm">{error ? '—' : 'Generating…'}</span>}</div>
            <div className="text-[13px] text-muted leading-relaxed"><div className="eyebrow mb-1">Can’t scan?</div>Enter this key manually:<div className="font-mono text-[12px] text-ink mt-1 break-all select-all bg-canvas border border-line p-2">{secret || '…'}</div><div className="mt-3">Account: <span className="font-mono text-ink">{creds?.employeeId}</span></div></div>
          </div>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium">6-digit code<input className="input font-mono text-[22px] tracking-[.5em] text-center" inputMode="numeric" autoFocus maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" /></label>
          {error && <p role="alert" className="text-[13px] text-crit border-l-2 border-crit pl-3">{error}</p>}
          <button disabled={busy || code.length !== 6} className="btn-primary h-12">{busy ? 'Verifying…' : 'Enable 2FA and sign in'}</button>
          <button type="button" onClick={() => { sessionStorage.removeItem('pending2fa'); r.push('/login'); }} className="text-[13px] text-muted hover:text-ink self-start">← Back to sign in</button>
        </form>
      </div>
    </main>
  );
}
