export type ReportKpi = { label: string; value: string | number; hint?: string };
export type ReportSection = { title: string; columns: string[]; rows: (string | number | null)[][]; note?: string };
export type ReportDoc = { type: ReportType; title: string; subtitle: string; periodStart: Date; periodEnd: Date; generatedAt: Date; kpis: ReportKpi[]; sections: ReportSection[] };
export const REPORT_TYPES = ['DRILLING_PRODUCTION', 'MACHINE_UTILISATION', 'MAINTENANCE_SUMMARY', 'JOB_CARD_HISTORY', 'CHEMICAL_USAGE', 'ASSET_HEALTH', 'EMPLOYEE_ACTIVITY'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];
export const REPORT_META: Record<ReportType, { title: string; roles: string[] }> = {
  DRILLING_PRODUCTION: { title: 'Drilling Production Report', roles: ['SUPERVISOR', 'MANAGER', 'ADMIN'] },
  MACHINE_UTILISATION: { title: 'Machine Utilisation Report', roles: ['SUPERVISOR', 'MANAGER', 'ADMIN'] },
  MAINTENANCE_SUMMARY: { title: 'Maintenance Summary Report', roles: ['SUPERVISOR', 'MANAGER', 'TECHNICIAN', 'ADMIN'] },
  JOB_CARD_HISTORY: { title: 'Job Card History Report', roles: ['SUPERVISOR', 'MANAGER', 'TECHNICIAN', 'ADMIN'] },
  CHEMICAL_USAGE: { title: 'Chemical Usage Report', roles: ['MANAGER', 'ADMIN'] },
  ASSET_HEALTH: { title: 'Asset Health Report', roles: ['SUPERVISOR', 'MANAGER', 'ADMIN'] },
  EMPLOYEE_ACTIVITY: { title: 'Employee Activity Report', roles: ['MANAGER', 'ADMIN'] },
};
