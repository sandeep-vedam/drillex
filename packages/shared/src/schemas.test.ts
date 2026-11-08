import { describe, it, expect } from 'vitest';
import { ShiftReportSchema, DailyReadingSchema, readingAlerts, criticalChecks, engineHours, penetrationRate, fuelConsumed, can, totalMetersDrilled, type PermissionMatrix } from './index';

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
    expect(r.success && r.data.formType === 'LEGACY' && r.data.tyrePressures).toEqual({});
  });
  it('tags a payload without formType as the original (LEGACY) form', () => {
    const r = DailyReadingSchema.safeParse(validReading);
    expect(r.success && r.data.formType).toBe('LEGACY');
  });
});

const base = { assetId: '00000000-0000-4000-8000-000000000001', date: '2026-11-08', warningLights: false, unusualNoises: false, leaks: false, conditionRating: 4 };
const rig = { ...base, formType: 'RIG', engineOil: 'OK', hydraulicOil: 'OK', coolant: 'LOW', gearOil: 'OK', flushPump: 'OK', rodCondition: 'GOOD', bitCondition: 'FAIR' };
const plant = { ...base, formType: 'PLANT', startReading: 1200, endReading: 1208.5, coolant: 'OK', engineOil: 'OK', gearOil: 'OK', hydraulicOil: 'OK', brakeFluid: 'NA', fuelLevel: 'OK', trackCondition: 'GOOD', tyreCondition: 'NA', attachmentCondition: 'GOOD', lights: 'OK', brakes: 'OK' };

describe('Rig check and plant readings (client spec §4A / §4B)', () => {
  it('accepts a valid rig check', () => expect(DailyReadingSchema.safeParse(rig).success).toBe(true));
  it('accepts a valid plant reading', () => expect(DailyReadingSchema.safeParse(plant).success).toBe(true));
  it('rejects an answer from the wrong list (rods cannot be "Worn")', () =>
    expect(DailyReadingSchema.safeParse({ ...rig, rodCondition: 'WORN' }).success).toBe(false));
  it('rejects a plant end reading below the start reading', () =>
    expect(DailyReadingSchema.safeParse({ ...plant, endReading: 1100 }).success).toBe(false));
  it('requires a reason when a supervisor enters for an operator', () => {
    const behalf = { ...rig, operatorId: '00000000-0000-4000-8000-000000000002' };
    expect(DailyReadingSchema.safeParse(behalf).success).toBe(false);
    expect(DailyReadingSchema.safeParse({ ...behalf, supervisorReason: 'Operator off sick' }).success).toBe(true);
  });
  it('raises CRITICAL_CHECK for a critical, damaged, faulty or flat answer', () => {
    expect(readingAlerts(rig as never)).toEqual([]);
    expect(readingAlerts({ ...rig, flushPump: 'CRITICAL' } as never)).toEqual(['CRITICAL_CHECK']);
    expect(readingAlerts({ ...plant, brakes: 'FAULTY' } as never)).toEqual(['CRITICAL_CHECK']);
    expect(criticalChecks({ ...plant, tyreCondition: 'FLAT', lights: 'FAULTY' })).toEqual(['Tyres', 'Lights & indicators']);
  });
});

describe('engine hours and penetration rate (client spec §4A)', () => {
  it('computes engine hours as end − start, to one decimal', () => expect(engineHours(1520.2, 1528.7)).toBe(8.5));
  it('computes penetration as metres ÷ engine hours', () => expect(penetrationRate(42, 8)).toBe(5.25));
  it('returns 0 m/h when the engine did not run', () => expect(penetrationRate(10, 0)).toBe(0));
  it('requires both hour meters or neither', () => {
    expect(ShiftReportSchema.safeParse({ ...validShift, startHourMeter: 100 }).success).toBe(false);
    expect(ShiftReportSchema.safeParse({ ...validShift, startHourMeter: 100, endHourMeter: 99 }).success).toBe(false);
    expect(ShiftReportSchema.safeParse({ ...validShift, startHourMeter: 100, endHourMeter: 108 }).success).toBe(true);
  });
  it('accepts a free-text chemical name without a master-list id', () =>
    expect(ShiftReportSchema.safeParse({ ...validShift, chemicals: [{ name: 'CAP 21', quantity: 2, unit: 'DRUMS' }] }).success).toBe(true));
  it('rejects a chemical line with neither a name nor an id', () =>
    expect(ShiftReportSchema.safeParse({ ...validShift, chemicals: [{ quantity: 2, unit: 'KG' }] }).success).toBe(false));
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

// `can()` is now a pure lookup over a matrix supplied by the caller (fetched from the database in
// production — see apps/api/src/roles) rather than a hardcoded object, so these tests exercise the
// lookup semantics against a small fixture shaped like the default seed grants.
const SEED_MATRIX: PermissionMatrix = {
  OPERATOR: { 'shift_report:read': 'self' },
  TECHNICIAN: { 'parts:write': 'all' },
  SUPERVISOR: { 'shift_report:approve': 'site' },
  MANAGER: { 'shift_report:read': 'all' },
  ADMIN: { 'shift_report:read': 'all', 'user:manage': 'all' },
};

describe('RBAC (packages/shared/src/rbac.ts)', () => {
  it('operator cannot approve a shift report; supervisor can, scoped to their site', () => {
    expect(can(SEED_MATRIX, 'OPERATOR', 'shift_report:approve')).toBeUndefined();
    expect(can(SEED_MATRIX, 'SUPERVISOR', 'shift_report:approve')).toBe('site');
  });
  it('manager and admin see all shift reports; operator only their own', () => {
    expect(can(SEED_MATRIX, 'MANAGER', 'shift_report:read')).toBe('all');
    expect(can(SEED_MATRIX, 'ADMIN', 'shift_report:read')).toBe('all');
    expect(can(SEED_MATRIX, 'OPERATOR', 'shift_report:read')).toBe('self');
  });
  it('only admin can manage users', () => {
    expect(can(SEED_MATRIX, 'ADMIN', 'user:manage')).toBe('all');
    expect(can(SEED_MATRIX, 'MANAGER', 'user:manage')).toBeUndefined();
    expect(can(SEED_MATRIX, 'SUPERVISOR', 'user:manage')).toBeUndefined();
  });
  it('admin cannot approve shift reports or job cards — approval stays with supervisor/manager', () => {
    expect(can(SEED_MATRIX, 'ADMIN', 'shift_report:approve')).toBeUndefined();
    expect(can(SEED_MATRIX, 'ADMIN', 'job_card:approve')).toBeUndefined();
  });
  it('technician can read and write parts, but cannot generate reports', () => {
    expect(can(SEED_MATRIX, 'TECHNICIAN', 'parts:write')).toBe('all');
    expect(can(SEED_MATRIX, 'TECHNICIAN', 'report:generate')).toBeUndefined();
  });
  it('unknown role/permission combinations return undefined rather than throwing', () => {
    expect(can(SEED_MATRIX, 'OPERATOR', 'audit:read')).toBeUndefined();
  });
  it('a role missing from the matrix entirely (e.g. deleted) returns undefined, not a throw', () => {
    expect(can(SEED_MATRIX, 'GHOST_ROLE', 'asset:read')).toBeUndefined();
    expect(can(SEED_MATRIX, undefined, 'asset:read')).toBeUndefined();
  });
});
