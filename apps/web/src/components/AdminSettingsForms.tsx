'use client';
import { useEffect, useState } from 'react';
import { DEFAULT_FINANCE_SETTINGS, type FinanceSettings } from '@drillex/shared';
import { api } from '@/lib/api';
import { ErrorText, Field } from './kit';

/** Which roles sign in with a 4-digit PIN rather than a password (client spec §10.6). */
export function PinRolesForm() {
  const [roles, setRoles] = useState<string[] | null>(null);
  const [all, setAll] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<{ roles: string[]; allRoles: string[] }>('/settings/pin-roles').then((r) => { setRoles(r.roles); setAll(r.allRoles); }).catch((e) => setError(e.message)); }, []);
  async function save() {
    setError(null); setSaved(false);
    try { await api('/settings/pin-roles', { method: 'PATCH', body: JSON.stringify({ roles }) }); setSaved(true); } catch (e) { setError((e as Error).message); }
  }
  if (!roles) return <ErrorText>{error}</ErrorText>;
  return (
    <div className="flex flex-col gap-4 max-w-[560px]">
      <div className="flex flex-wrap gap-2">
        {all.map((r) => <label key={r} className="flex items-center gap-2 text-[13px] font-medium border border-line px-3 py-2 cursor-pointer"><input type="checkbox" checked={roles.includes(r)} onChange={() => { setSaved(false); setRoles(roles.includes(r) ? roles.filter((x) => x !== r) : [...roles, r]); }} />{r}</label>)}
      </div>
      <p className="text-[12px] text-muted">Applies to new temporary credentials and the next PIN or password change. People keep their current credential until then.</p>
      <ErrorText>{error}</ErrorText>
      <div className="flex items-center gap-3"><button onClick={save} className="btn-primary h-10">Save</button>{saved && <span className="text-[13px] text-ok">Saved</span>}</div>
    </div>
  );
}

/** Currencies in use and the company details on follow-up messages (decided with the client: admin-configurable). */
export function FinanceSettingsForm() {
  const [s, setS] = useState<FinanceSettings | null>(null);
  const [currencies, setCurrencies] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<FinanceSettings>('/settings/finance').then((x) => { setS(x); setCurrencies(x.currencies.join(', ')); }).catch((e) => { setError(e.message); setS(DEFAULT_FINANCE_SETTINGS); }); }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setError(null); setSaved(false);
    if (!s) return;
    const list = currencies.split(/[\s,]+/).map((c) => c.trim().toUpperCase()).filter(Boolean);
    try { const r = await api<FinanceSettings>('/settings/finance', { method: 'PATCH', body: JSON.stringify({ ...s, currencies: list }) }); setS(r); setCurrencies(r.currencies.join(', ')); setSaved(true); } catch (err) { setError((err as Error).message); }
  }
  if (!s) return null;
  const list = currencies.split(/[\s,]+/).map((c) => c.trim().toUpperCase()).filter(Boolean);
  return (
    <form onSubmit={save} className="grid sm:grid-cols-2 gap-4 max-w-[720px]">
      <Field label="Currencies in use" hint="3-letter codes, comma separated"><input className="input font-mono uppercase" value={currencies} onChange={(e) => setCurrencies(e.target.value)} /></Field>
      <Field label="Default currency"><select className="input" value={s.defaultCurrency} onChange={(e) => setS({ ...s, defaultCurrency: e.target.value })}>{list.map((c) => <option key={c}>{c}</option>)}</select></Field>
      <Field label="Company name"><input className="input" value={s.companyName} onChange={(e) => setS({ ...s, companyName: e.target.value })} /></Field>
      <Field label="Contact number"><input className="input" value={s.companyPhone} onChange={(e) => setS({ ...s, companyPhone: e.target.value })} /></Field>
      <Field label="Email"><input type="email" className="input" value={s.companyEmail} onChange={(e) => setS({ ...s, companyEmail: e.target.value })} /></Field>
      <Field label="Website"><input className="input" value={s.website ?? ''} onChange={(e) => setS({ ...s, website: e.target.value })} /></Field>
      <div className="sm:col-span-2 flex items-center gap-3"><button className="btn-primary h-10">Save</button>{saved && <span className="text-[13px] text-ok">Saved</span>}</div>
      <div className="sm:col-span-2"><ErrorText>{error}</ErrorText></div>
    </form>
  );
}
