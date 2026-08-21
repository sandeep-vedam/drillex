const map: Record<string, { label: string; cls: string; dot: string }> = {
  ACTIVE: { label: 'Active', cls: 'bg-ok/10 text-ok', dot: 'bg-ok' },
  UNDER_MAINTENANCE: { label: 'Under maintenance', cls: 'bg-hazard/10 text-hazard', dot: 'bg-hazard' },
  IDLE: { label: 'Idle', cls: 'bg-steel/10 text-steel', dot: 'bg-steel' },
  DECOMMISSIONED: { label: 'Decommissioned', cls: 'bg-crit/10 text-crit', dot: 'bg-crit' },
  SUBMITTED: { label: 'Awaiting approval', cls: 'bg-warn/10 text-warn', dot: 'bg-warn' },
  APPROVED: { label: 'Approved', cls: 'bg-ok/10 text-ok', dot: 'bg-ok' },
  OVERDUE: { label: 'Overdue', cls: 'bg-crit/10 text-crit', dot: 'bg-crit' },
  DUE_NOW: { label: 'Due now', cls: 'bg-hazard/10 text-hazard', dot: 'bg-hazard' },
  UPCOMING: { label: 'Upcoming', cls: 'bg-navy-100 text-navy-800', dot: 'bg-navy-600' },
  COMPLETED: { label: 'Completed', cls: 'bg-ok/10 text-ok', dot: 'bg-ok' },
  OPEN: { label: 'Open', cls: 'bg-navy-100 text-navy-800', dot: 'bg-navy-600' },
  IN_PROGRESS: { label: 'In progress', cls: 'bg-hazard/10 text-hazard', dot: 'bg-hazard' },
  AWAITING_PARTS: { label: 'Awaiting parts', cls: 'bg-warn/10 text-warn', dot: 'bg-warn' },
  UNLOCKED: { label: 'Unlocked', cls: 'bg-hazard/10 text-hazard', dot: 'bg-hazard' },
};
export function StatusChip({ status }: { status: string }) {
  const m = map[status] ?? { label: status, cls: 'bg-steel/10 text-steel', dot: 'bg-steel' };
  return <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[12px] font-semibold tracking-wide ${m.cls}`}><span className={`h-1.5 w-1.5 ${m.dot}`} />{m.label}</span>;
}
