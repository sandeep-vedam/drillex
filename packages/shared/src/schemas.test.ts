import { describe, it, expect } from 'vitest';
import { ShiftReportSchema, readingAlerts, can, totalMetersDrilled } from './index';

describe('shared rules', () => {
  it('rejects end depth < start depth', () => {
    const r = ShiftReportSchema.safeParse({
      assetId: '00000000-0000-0000-0000-000000000001', date: '2026-08-21', shift: 'DAY',
      siteId: '00000000-0000-0000-0000-000000000002', holeRef: 'H1', startDepth: 10, endDepth: 5,
      holesCompleted: 1, holeDiameterMm: 102, rockType: 'Granite', penetrationRate: 1,
    });
    expect(r.success).toBe(false);
  });
  it('computes total meters', () => expect(totalMetersDrilled(10, 25)).toBe(15));
  it('raises alerts per SRS 5.3', () =>
    expect(readingAlerts({ warningLights: true, leaks: false, unusualNoises: false, conditionRating: 2 }))
      .toEqual(['WARNING_LIGHTS', 'MAINTENANCE_REVIEW']));
  it('RBAC: operator cannot approve, supervisor can (site scope)', () => {
    expect(can('OPERATOR', 'shift_report:approve')).toBeUndefined();
    expect(can('SUPERVISOR', 'shift_report:approve')).toBe('site');
  });
});
