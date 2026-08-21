import { z } from 'zod';
import { ServiceTypes } from './enums';

export const MaintenanceScheduleSchema = z.object({
  assetId: z.string().uuid(),
  serviceType: z.enum(ServiceTypes),
  description: z.string().min(3),
  intervalHours: z.number().int().positive().optional(),
  intervalDays: z.number().int().positive().optional(),
  lastServiceAt: z.coerce.date().optional(),
  lastServiceHours: z.number().nonnegative().optional(),
  nextDueAt: z.coerce.date().optional(),
  nextDueHours: z.number().nonnegative().optional(),
  reminderLeadDays: z.number().int().min(0).max(60).default(3),
  technicianIds: z.array(z.string().uuid()).default([]),
  estDowntimeHours: z.number().nonnegative().optional(),
  notes: z.string().optional(),
  parts: z.array(z.object({ partId: z.string().uuid(), quantity: z.number().int().positive() })).default([]),
}).refine((s) => s.intervalHours || s.intervalDays || s.nextDueAt || s.nextDueHours, { message: 'Set an interval (hours/days) or an explicit due date/hours' });
export type MaintenanceScheduleInput = z.infer<typeof MaintenanceScheduleSchema>;

export const CompleteServiceSchema = z.object({ completedAt: z.coerce.date().optional(), hourMeter: z.number().nonnegative().optional(), notes: z.string().optional() });

/** Default intervals for the SRS service types (hours). */
export const ServiceTypeDefaults: Record<(typeof ServiceTypes)[number], { hours?: number; days?: number; label: string }> = {
  HR_250: { hours: 250, label: '250 hr service' }, HR_500: { hours: 500, label: '500 hr service' }, HR_1000: { hours: 1000, label: '1000 hr service' },
  ANNUAL: { days: 365, label: 'Annual service' }, CONDITION_BASED: { label: 'Condition-based' }, AD_HOC: { label: 'Ad-hoc' },
};

/** SRS §6.2 status: Upcoming / Due Now / Overdue given today's date, the machine's current hour meter and the lead time. */
export function scheduleStatus(s: { nextDueAt?: Date | null; nextDueHours?: number | null; reminderLeadDays: number }, now: Date, currentHours?: number | null): 'UPCOMING' | 'DUE_NOW' | 'OVERDUE' {
  const dayMs = 864e5;
  let st: 'UPCOMING' | 'DUE_NOW' | 'OVERDUE' = 'UPCOMING';
  if (s.nextDueAt) {
    const d = (s.nextDueAt.getTime() - now.getTime()) / dayMs;
    if (d < 0) st = 'OVERDUE'; else if (d <= s.reminderLeadDays) st = 'DUE_NOW';
  }
  if (s.nextDueHours != null && currentHours != null) {
    const h = s.nextDueHours - currentHours;
    // lead time in hours ≈ lead days × 10 operating hours/day
    if (h < 0) st = 'OVERDUE'; else if (h <= s.reminderLeadDays * 10 && st !== 'OVERDUE') st = 'DUE_NOW';
  }
  return st;
}

/** Roll a schedule forward after completion. */
export function nextCycle(s: { intervalHours?: number | null; intervalDays?: number | null }, completedAt: Date, hourMeter?: number | null) {
  return {
    nextDueAt: s.intervalDays ? new Date(completedAt.getTime() + s.intervalDays * 864e5) : null,
    nextDueHours: s.intervalHours && hourMeter != null ? hourMeter + s.intervalHours : null,
  };
}
