import { describe, it, expect } from 'vitest';
import { ShiftReportSchema, DailyReadingSchema, readingAlerts, fuelConsumed, can, totalMetersDrilled } from './index';

const validShift = {
  assetId: '00000000-0000-0000-0000-000000000001', date: '2026-08-21', shift: 'DAY',
  siteId: '00000000-0000-0000-0000-000000000002', holeRef: 'H1', startDepth: 10, endDepth: 25,
  holesCompleted: 1, holeDiameterMm: 102, rockType: 'Granite', penetrationRate: 1,
};

const validReading = {
  assetId: '00000000-0000-0000-0000-000000000001', date: '2026-08-21', hourMeter: 100,
  fuelStart: 50, fuelEnd: 30, engineOil: 'OK', hydraulicOil: 'OK', coolant: 'OK', airFilter: 'OK',
  battery: 'OK', warningLights: false, unusualNoises: false, leaks: false,
  preStartChecklistDone: true, conditionRating: 4,
};

describe('ShiftReportSchema', () => {
  it('accepts a valid payload', () => expect(ShiftReportSchema.safeParse(validShift).success).toBe(true));
  it('rejects end depth < start depth', () => {
    const r = ShiftReportSchema.safeParse({ ...validShift, startDepth: 10, endDepth: 5 });
    expect(r.success).toBe(false);
  });
  it('accepts end depth == start depth (zero-progress shift)', () => {
    expect(ShiftReportSchema.safeParse({ ...validShift, startDepth: 10, endDepth: 10 }).success).toBe(true);
  });
  it('rejects a negative start depth', () => {
    expect(ShiftReportSchema.safeParse({ ...validShift, startDepth: -1 }).success).toBe(false);
  });
  it('rejects a non-positive hole diameter', () => {
    expect(ShiftReportSchema.safeParse({ ...validShift, holeDiameterMm: 0 }).success).toBe(false);
  });
  it('defaults downtimeHours and chemicals when omitted', () => {
    const r = ShiftReportSchema.safeParse(validShift);
    expect(r.success && r.data.downtimeHours).toBe(0);
    expect(r.success && r.data.chemicals).toEqual([]);
  });
});

describe('totalMetersDrilled', () => {
  it('computes end minus start', () => expect(totalMetersDrilled(10, 25)).toBe(15));
  it('clamps a negative delta to zero rather than going negative', () => expect(totalMetersDrilled(25, 10)).toBe(0));
  it('returns zero when start equals end', () => expect(totalMetersDrilled(10, 10)).toBe(0));
});

describe('DailyReadingSchema', () => {
  it('accepts a valid payload', () => expect(DailyReadingSchema.safeParse(validReading).success).toBe(true));
  it('rejects a condition rating above the 1-5 scale', () => {
    expect(DailyReadingSchema.safeParse({ ...validReading, conditionRating: 9 }).success).toBe(false);
  });
  it('rejects a condition rating below the 1-5 scale', () => {
    expect(DailyReadingSchema.safeParse({ ...validReading, conditionRating: 0 }).success).toBe(false);
  });
  it('rejects a negative fuel reading', () => {
    expect(DailyReadingSchema.safeParse({ ...validReading, fuelStart: -5 }).success).toBe(false);
  });
  it('defaults tyrePressures to an empty object when omitted', () => {
    const r = DailyReadingSchema.safeParse(validReading);
    expect(r.success && r.data.tyrePressures).toEqual({});
  });
});

describe('fuelConsumed', () => {
  it('computes start minus end', () => expect(fuelConsumed(50, 30)).toBe(20));
  it('clamps to zero when the tank reads fuller at end than at start', () => expect(fuelConsumed(30, 50)).toBe(0));
  it('returns zero when start equals end', () => expect(fuelConsumed(40, 40)).toBe(0));
});

describe('readingAlerts (SRS §5.3)', () => {
  const clean = { warningLights: false, leaks: false, unusualNoises: false, conditionRating: 4 };

  it('raises nothing for a clean reading', () => expect(readingAlerts(clean)).toEqual([]));
  it('raises WARNING_LIGHTS in isolation', () =>
    expect(readingAlerts({ ...clean, warningLights: true })).toEqual(['WARNING_LIGHTS']));
  it('raises LEAKS in isolation', () =>
    expect(readingAlerts({ ...clean, leaks: true })).toEqual(['LEAKS']));
  it('raises UNUSUAL_NOISES in isolation', () =>
    expect(readingAlerts({ ...clean, unusualNoises: true })).toEqual(['UNUSUAL_NOISES']));
  it('raises MAINTENANCE_REVIEW at the conditionRating<=2 threshold, not above it', () => {
    expect(readingAlerts({ ...clean, conditionRating: 2 })).toEqual(['MAINTENANCE_REVIEW']);
    expect(readingAlerts({ ...clean, conditionRating: 3 })).toEqual([]);
  });
  it('raises every alert together, in a fixed order, for a fully-flagged reading', () =>
    expect(readingAlerts({ warningLights: true, leaks: true, unusualNoises: true, conditionRating: 1 }))
      .toEqual(['WARNING_LIGHTS', 'LEAKS', 'UNUSUAL_NOISES', 'MAINTENANCE_REVIEW']));
  it('matches the documented example from the docstring/wireframes: lights + low rating, no leaks/noise', () =>
    expect(readingAlerts({ warningLights: true, leaks: false, unusualNoises: false, conditionRating: 2 }))
      .toEqual(['WARNING_LIGHTS', 'MAINTENANCE_REVIEW']));
});

describe('RBAC (packages/shared/src/rbac.ts)', () => {
  it('operator cannot approve a shift report; supervisor can, scoped to their site', () => {
    expect(can('OPERATOR', 'shift_report:approve')).toBeUndefined();
    expect(can('SUPERVISOR', 'shift_report:approve')).toBe('site');
  });
  it('manager and admin see all shift reports; operator only their own', () => {
    expect(can('MANAGER', 'shift_report:read')).toBe('all');
    expect(can('ADMIN', 'shift_report:read')).toBe('all');
    expect(can('OPERATOR', 'shift_report:read')).toBe('self');
  });
  it('only admin can manage users', () => {
    expect(can('ADMIN', 'user:manage')).toBe('all');
    expect(can('MANAGER', 'user:manage')).toBeUndefined();
    expect(can('SUPERVISOR', 'user:manage')).toBeUndefined();
  });
  it('admin cannot approve shift reports or job cards — approval stays with supervisor/manager', () => {
    expect(can('ADMIN', 'shift_report:approve')).toBeUndefined();
    expect(can('ADMIN', 'job_card:approve')).toBeUndefined();
  });
  it('technician can read and write parts, but cannot generate reports', () => {
    expect(can('TECHNICIAN', 'parts:write')).toBe('all');
    expect(can('TECHNICIAN', 'report:generate')).toBeUndefined();
  });
  it('unknown role/permission combinations return undefined rather than throwing', () => {
    expect(can('OPERATOR', 'audit:read')).toBeUndefined();
  });
});
