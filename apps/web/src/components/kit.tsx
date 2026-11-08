'use client';
import type { ReactNode } from 'react';

/** Labelled form field. */
export function Field({ label, hint, required, children, className = '' }: { label: string; hint?: string; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1.5 text-[13px] font-medium ${className}`}>
      <span>{label}{required && <span className="text-crit"> *</span>}{hint && <span className="text-muted font-normal"> — {hint}</span>}</span>
      {children}
    </label>
  );
}

/** Right-hand slide-over used for every add / edit form; full width on a phone. */
export function Drawer({ open, onClose, eyebrow, title, intro, children, footer, onSubmit, wide }: {
  open: boolean; onClose: () => void; eyebrow: string; title: string; intro?: ReactNode; children: ReactNode; footer: ReactNode; onSubmit: (e: React.FormEvent) => void; wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-navy-900/40 backdrop-blur-[2px]" onClick={onClose}>
      <form onSubmit={onSubmit} onClick={(e) => e.stopPropagation()} className={`h-full w-full ${wide ? 'max-w-[620px]' : 'max-w-[480px]'} bg-surface shadow-card flex flex-col`}>
        <header className="px-6 py-5 border-b border-line"><div className="eyebrow">{eyebrow}</div><h2 className="font-display font-semibold text-[26px] text-navy-800">{title}</h2>{intro && <div className="text-[13px] text-muted mt-1">{intro}</div>}</header>
        <div className="p-6 flex flex-col gap-4 flex-1 overflow-y-auto">{children}</div>
        <footer className="px-6 py-4 border-t border-line flex justify-end gap-2">{footer}</footer>
      </form>
    </div>
  );
}

/** Centred dialog. */
export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy-900/50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="card w-full max-w-[600px] max-h-[90vh] flex flex-col">
        <header className="px-5 py-4 border-b border-line flex items-center justify-between gap-3"><h3 className="font-display font-semibold text-[20px] text-navy-800">{title}</h3><button type="button" onClick={onClose} className="btn-ghost" aria-label="Close">✕</button></header>
        <div className="p-5 overflow-y-auto flex flex-col gap-3">{children}</div>
        {footer && <footer className="px-5 py-3 border-t border-line flex flex-wrap justify-end gap-2">{footer}</footer>}
      </div>
    </div>
  );
}

/** Horizontal tabs; scrolls sideways on a phone rather than wrapping. */
export function Tabs<T extends string>({ tabs, value, onChange, dark }: { tabs: { key: T; label: string; count?: number }[]; value: T; onChange: (t: T) => void; dark?: boolean }) {
  return (
    <div className="flex overflow-x-auto -mb-px" role="tablist">
      {tabs.map((t) => {
        const on = t.key === value;
        const cls = dark
          ? on ? 'border-gold text-white' : 'border-transparent text-white/60 hover:text-white'
          : on ? 'border-navy-800 text-navy-800' : 'border-transparent text-muted hover:text-ink';
        return (
          <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => onChange(t.key)} className={`px-4 py-3 text-[14px] font-semibold whitespace-nowrap border-b-2 transition ${cls}`}>
            {t.label}{t.count ? <span className={`ml-1.5 px-1.5 text-[11px] tnum ${dark ? 'bg-white/15' : 'bg-hazard text-white'}`}>{t.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/** Success / info banner with an optional copyable value (temporary PINs, etc.). */
export function Notice({ title, value, note, onClose, tone = 'ok' }: { title: string; value?: string; note?: string; onClose: () => void; tone?: 'ok' | 'warn' }) {
  return (
    <div className={`card border-l-4 ${tone === 'ok' ? 'border-l-ok' : 'border-l-hazard'} p-4 flex items-start gap-4`}>
      <div className="flex-1 min-w-0"><div className="font-semibold">{title}</div>{value && <div className="mt-1 font-mono text-[17px] bg-canvas border border-line inline-block px-2 py-1 select-all">{value}</div>}{note && <div className="text-[12px] text-muted mt-1">{note}</div>}</div>
      <button type="button" onClick={onClose} className="btn-ghost">Dismiss</button>
    </div>
  );
}

export const ErrorText = ({ children }: { children: ReactNode }) => (children ? <p className="text-[13px] text-crit border-l-2 border-crit pl-3">{children}</p> : null);
export const fmtDate = (d?: string | Date | null) => (d ? new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const today = () => new Date().toISOString().slice(0, 10);
