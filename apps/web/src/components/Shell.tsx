'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Wordmark } from './Brand';
import { I } from './Icons';
import { api, getUser, signOut, type SessionUser } from '@/lib/api';
import { useRoleMatrix } from '@/lib/permissions';
import { can, type Permission, type PermissionMatrix } from '@drillex/shared';

// SRS FR-9.1.1: one permission matrix applied identically across API, web and mobile. Each entry names the
// permission its page needs, so the menu can never offer less (or more) than the API will actually allow.
const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: I.Dashboard, perm: null },
  { href: '/assets', label: 'All machines', icon: I.Asset, perm: 'asset:read' },
  { href: '/shift-reports', label: 'Approve production', icon: I.Drill, perm: 'shift_report:read' },
  { href: '/readings', label: 'Machine checks', icon: I.Gauge, perm: 'daily_reading:read' },
  { href: '/maintenance', label: 'Servicing', icon: I.Wrench, perm: 'maintenance:read' },
  { href: '/job-cards', label: 'Repair records', icon: I.Card, perm: 'job_card:read' },
  { href: '/parts', label: 'Parts store', icon: I.Box, perm: 'parts:read' },
  { href: '/chemicals', label: 'Chemicals', icon: I.Box, perm: 'parts:read' },
  { href: '/reports', label: 'Reports', icon: I.Report, perm: 'report:read' },
] as const;
const ADMIN = [
  { href: '/sync-conflicts', label: 'Duplicate entries', icon: I.Sync, perm: 'shift_report:approve' },
  { href: '/users', label: 'People', icon: I.Users, perm: 'user:manage' },
  { href: '/roles', label: 'What people can do', icon: I.Shield, perm: 'role:manage' },
  { href: '/devices', label: 'Phones', icon: I.Settings, perm: 'user:manage' },
  { href: '/settings', label: 'Settings', icon: I.Settings, perm: null },
] as const;
const visible = (matrix: PermissionMatrix | null, role: string | undefined) => (n: { perm: Permission | null }) =>
  n.perm === null || (!!role && !!matrix && !!can(matrix, role, n.perm));

export function Shell({ children, title, actions }: { children: ReactNode; title: string; actions?: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [unread, setUnread] = useState(0);
  const matrix = useRoleMatrix();
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => { setNavOpen(false); }, [path]);
  useEffect(() => { const f = () => api<{ count: number }>('/notifications/unread-count').then((r) => setUnread(r.count)).catch(() => {}); f(); const t = setInterval(f, 30_000); window.addEventListener('notifications:changed', f); return () => { clearInterval(t); window.removeEventListener('notifications:changed', f); }; }, []);
  useEffect(() => { const u = getUser(); if (!u) router.replace('/login'); else if (u.mustChangePassword) router.replace('/change-password'); else setUser(u); }, [router]);

  const Item = ({ href, label, icon: Icon }: { href: string; label: string; icon: typeof I.Dashboard }) => {
    const active = path.startsWith(href);
    return (
      <Link href={href} onClick={() => setNavOpen(false)} className={`group flex items-center gap-3 px-4 py-3 text-[14px] transition border-l-2 ${active ? 'border-hazard bg-white/[.06] text-white' : 'border-transparent text-white/65 hover:text-white hover:bg-white/[.04]'}`}>
        <Icon className={active ? 'text-hazard' : 'text-white/50 group-hover:text-white/80'} /> {label}
      </Link>
    );
  };

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      {/* Below lg the sidebar is a drawer: at 390px a fixed 248px rail left almost nothing for content. */}
      {navOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-30 bg-navy-900/50 lg:hidden"
        />
      )}
      <aside
        className={`bg-navy-900 text-white flex flex-col w-[248px] z-40 fixed inset-y-0 left-0 transition-transform lg:static lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen ${navOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="px-5 py-5 border-b border-white/10"><Wordmark light /></div>
        <nav className="py-3 flex-1 overflow-y-auto">
          <div className="px-4 pb-2 eyebrow !text-white/35">Everyday jobs</div>
          {NAV.filter(visible(matrix, user?.role)).map((n) => <Item key={n.href} {...n} />)}
          <div className="px-4 pt-5 pb-2 eyebrow !text-white/35">Setting things up</div>
          {ADMIN.filter(visible(matrix, user?.role)).map((n) => <Item key={n.href} {...n} />)}
        </nav>
        <div className="border-t border-white/10 p-4 flex items-center gap-3">
          <div className="h-9 w-9 grid place-items-center bg-hazard text-navy-900 font-display font-bold text-[15px]">{user?.employeeId?.slice(0, 2) ?? '··'}</div>
          <div className="min-w-0 flex-1 leading-tight"><div className="text-[13px] font-semibold truncate">{user?.employeeId ?? '—'}</div><div className="text-[11px] text-white/50 tracking-wide">{user?.role ?? ''}</div></div>
          <button onClick={signOut} className="text-white/50 hover:text-white" aria-label="Sign out"><I.Logout /></button>
        </div>
      </aside>
      <div className="flex flex-col min-w-0">
        <header className="sticky top-0 z-20 bg-canvas/85 backdrop-blur border-b border-line px-4 sm:px-8 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              aria-label="Open menu"
              className="lg:hidden h-10 w-10 -ml-2 grid place-items-center text-navy-800"
            >
              <span className="flex flex-col gap-[5px]" aria-hidden>
                <span className="block h-[2px] w-5 bg-current" />
                <span className="block h-[2px] w-5 bg-current" />
                <span className="block h-[2px] w-5 bg-current" />
              </span>
            </button>
            <h1 className="font-display text-[20px] sm:text-[26px] font-semibold text-navy-800 tracking-wide truncate">{title}</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden md:inline-flex items-center gap-1.5 text-[12px] text-muted px-2.5 py-1 border border-line bg-surface"><span className="h-1.5 w-1.5 rounded-full bg-ok" />Live · synced</span>
            <Link href="/notifications" className="btn-ghost relative" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}><I.Bell />{unread > 0 && <span className="absolute -top-0.5 right-0 min-w-[18px] h-[18px] px-1 grid place-items-center bg-hazard text-white text-[10px] font-bold tnum">{unread > 99 ? '99+' : unread}</span>}</Link>
            {actions}
          </div>
        </header>
        <main className="p-4 sm:p-8 flex flex-col gap-6">{children}</main>
      </div>
    </div>
  );
}
