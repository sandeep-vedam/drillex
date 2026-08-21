'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Wordmark } from './Brand';
import { I } from './Icons';
import { getUser, signOut, type SessionUser } from '@/lib/api';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: I.Dashboard, roles: ['*'] },
  { href: '/assets', label: 'Asset register', icon: I.Asset, roles: ['ADMIN', 'MANAGER', 'SUPERVISOR'] },
  { href: '/shift-reports', label: 'Shift production', icon: I.Drill, roles: ['SUPERVISOR', 'MANAGER'] },
  { href: '/readings', label: 'Daily readings', icon: I.Gauge, roles: ['SUPERVISOR', 'MANAGER'] },
  { href: '/maintenance', label: 'Maintenance', icon: I.Wrench, roles: ['TECHNICIAN', 'SUPERVISOR', 'MANAGER'] },
  { href: '/job-cards', label: 'Job cards', icon: I.Card, roles: ['TECHNICIAN', 'SUPERVISOR', 'MANAGER'] },
  { href: '/parts', label: 'Parts inventory', icon: I.Box, roles: ['TECHNICIAN', 'MANAGER', 'ADMIN'] },
  { href: '/reports', label: 'Reports', icon: I.Report, roles: ['SUPERVISOR', 'MANAGER'] },
];
const ADMIN = [
  { href: '/users', label: 'User management', icon: I.Users, roles: ['ADMIN'] },
  { href: '/settings', label: 'Settings', icon: I.Settings, roles: ['*'] },
];
const visible = (role: string | undefined) => (n: { roles: string[] }) => n.roles.includes('*') || (role ? n.roles.includes(role) : false);

export function Shell({ children, title, actions }: { children: ReactNode; title: string; actions?: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  useEffect(() => { const u = getUser(); if (!u) router.replace('/login'); else if (u.mustChangePassword) router.replace('/change-password'); else setUser(u); }, [router]);

  const Item = ({ href, label, icon: Icon }: { href: string; label: string; icon: typeof I.Dashboard }) => {
    const active = path.startsWith(href);
    return (
      <Link href={href} className={`group flex items-center gap-3 px-4 py-2.5 text-[14px] transition border-l-2 ${active ? 'border-hazard bg-white/[.06] text-white' : 'border-transparent text-white/65 hover:text-white hover:bg-white/[.04]'}`}>
        <Icon className={active ? 'text-hazard' : 'text-white/50 group-hover:text-white/80'} /> {label}
      </Link>
    );
  };

  return (
    <div className="min-h-screen grid grid-cols-[248px_minmax(0,1fr)]">
      <aside className="bg-navy-900 text-white flex flex-col sticky top-0 h-screen">
        <div className="px-5 py-5 border-b border-white/10"><Wordmark light /></div>
        <nav className="py-3 flex-1 overflow-y-auto">
          <div className="px-4 pb-2 eyebrow !text-white/35">Operations</div>
          {NAV.filter(visible(user?.role)).map((n) => <Item key={n.href} {...n} />)}
          <div className="px-4 pt-5 pb-2 eyebrow !text-white/35">System</div>
          {ADMIN.filter(visible(user?.role)).map((n) => <Item key={n.href} {...n} />)}
        </nav>
        <div className="border-t border-white/10 p-4 flex items-center gap-3">
          <div className="h-9 w-9 grid place-items-center bg-hazard text-navy-900 font-display font-bold text-[15px]">{user?.employeeId?.slice(0, 2) ?? '··'}</div>
          <div className="min-w-0 flex-1 leading-tight"><div className="text-[13px] font-semibold truncate">{user?.employeeId ?? '—'}</div><div className="text-[11px] text-white/50 tracking-wide">{user?.role ?? ''}</div></div>
          <button onClick={signOut} className="text-white/50 hover:text-white" aria-label="Sign out"><I.Logout /></button>
        </div>
      </aside>
      <div className="flex flex-col min-w-0">
        <header className="sticky top-0 z-10 bg-canvas/85 backdrop-blur border-b border-line px-8 h-16 flex items-center justify-between">
          <h1 className="font-display text-[26px] font-semibold text-navy-800 tracking-wide">{title}</h1>
          <div className="flex items-center gap-2">
            <span className="hidden md:inline-flex items-center gap-1.5 text-[12px] text-muted px-2.5 py-1 border border-line bg-surface"><span className="h-1.5 w-1.5 rounded-full bg-ok" />Live · synced</span>
            <button className="btn-ghost" aria-label="Notifications"><I.Bell /></button>
            {actions}
          </div>
        </header>
        <main className="p-8 flex flex-col gap-6">{children}</main>
      </div>
    </div>
  );
}
