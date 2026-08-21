import type { ReactNode } from 'react';
export function StatTile({ label, value, hint, tone = 'default', icon }: { label: string; value: ReactNode; hint?: string; tone?: 'default' | 'ok' | 'warn' | 'crit'; icon?: ReactNode }) {
  const stripe = { default: 'bg-navy-600', ok: 'bg-ok', warn: 'bg-hazard', crit: 'bg-crit' }[tone];
  return (
    <div className="card relative overflow-hidden p-5">
      <div className={`absolute left-0 top-0 h-full w-1 ${stripe}`} />
      <div className="flex items-start justify-between">
        <div className="eyebrow">{label}</div>
        {icon && <div className="text-muted">{icon}</div>}
      </div>
      <div className="mt-3 font-display text-[40px] font-semibold leading-none tnum text-ink">{value}</div>
      {hint && <div className="mt-2 text-[13px] text-muted">{hint}</div>}
    </div>
  );
}
