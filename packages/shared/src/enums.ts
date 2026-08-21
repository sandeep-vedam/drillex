export const Roles = ['OPERATOR', 'TECHNICIAN', 'SUPERVISOR', 'MANAGER', 'ADMIN'] as const;
export type Role = (typeof Roles)[number];

export const AssetCategories = ['DRILLING', 'HAULAGE', 'COMPRESSOR', 'ANCILLARY', 'OTHER'] as const;
export type AssetCategory = (typeof AssetCategories)[number];

export const AssetStatuses = ['ACTIVE', 'UNDER_MAINTENANCE', 'IDLE', 'DECOMMISSIONED'] as const;
export type AssetStatus = (typeof AssetStatuses)[number];

export const Shifts = ['DAY', 'NIGHT'] as const;
export type Shift = (typeof Shifts)[number];

export const SubmissionStatuses = ['SUBMITTED', 'APPROVED', 'UNLOCKED'] as const;
export type SubmissionStatus = (typeof SubmissionStatuses)[number];

export const FluidLevels = ['OK', 'LOW', 'ADD', 'CHANGE_REQUIRED'] as const;
export const AirFilterConditions = ['OK', 'BLOCKED', 'CHANGED'] as const;
export const BatteryConditions = ['OK', 'WEAK', 'FLAT'] as const;
export const ChemicalUnits = ['LITRES', 'KG', 'BAGS'] as const;

export const ServiceTypes = ['HR_250', 'HR_500', 'HR_1000', 'ANNUAL', 'CONDITION_BASED', 'AD_HOC'] as const;
export const ScheduleStatuses = ['UPCOMING', 'DUE_NOW', 'OVERDUE', 'COMPLETED'] as const;

export const JobTypes = ['SCHEDULED_SERVICE', 'BREAKDOWN_REPAIR', 'MODIFICATION', 'INSPECTION'] as const;
export const JobStatuses = ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'AWAITING_PARTS'] as const;
export const TestResults = ['PASSED', 'FAILED', 'PENDING'] as const;

/** Asset number prefixes per category, e.g. DRL-001 */
export const AssetPrefix: Record<AssetCategory, string> = {
  DRILLING: 'DRL', HAULAGE: 'HAU', COMPRESSOR: 'CMP', ANCILLARY: 'ANC', OTHER: 'EQP',
};
