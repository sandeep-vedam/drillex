/** The five built-in system roles seeded on first migration. Custom roles created via the admin UI
 *  are not members of this list — use `Role` (a plain string, resolved against the database) for those. */
export const Roles = ['OPERATOR', 'TECHNICIAN', 'SUPERVISOR', 'MANAGER', 'ADMIN', 'FINANCE', 'PLANT_HIRE_SUPERVISOR'] as const;
export type Role = string;

/** Employee ID prefix per built-in role (client spec §10.6): {PREFIX}{3-digit sequence}, e.g. OPR001, PSV001. */
export const EmployeeIdPrefix: Record<string, string> = {
  OPERATOR: 'OPR', TECHNICIAN: 'TEC', SUPERVISOR: 'SUP', MANAGER: 'MGR', ADMIN: 'ADM', FINANCE: 'FIN', PLANT_HIRE_SUPERVISOR: 'PSV',
};

export const UserStatuses = ['ACTIVE', 'DISABLED', 'BLOCKED', 'SUSPENDED'] as const;
export type UserStatus = (typeof UserStatuses)[number];


export const AssetCategories = ['DRILLING', 'EXCAVATOR', 'GRADER', 'TRUCK', 'HAULAGE', 'COMPRESSOR', 'ANCILLARY', 'OTHER'] as const;
export type AssetCategory = (typeof AssetCategories)[number];

export const AssetStatuses = ['ACTIVE', 'UNDER_MAINTENANCE', 'IDLE', 'DECOMMISSIONED'] as const;
export type AssetStatus = (typeof AssetStatuses)[number];

export const Shifts = ['DAY', 'NIGHT'] as const;
export type Shift = (typeof Shifts)[number];

export const SubmissionStatuses = ['SUBMITTED', 'APPROVED', 'UNLOCKED'] as const;
export type SubmissionStatus = (typeof SubmissionStatuses)[number];

/** ADD / CHANGE_REQUIRED belong to the original daily reading; the rig and plant checks use OK / LOW / CRITICAL. */
export const FluidLevels = ['OK', 'LOW', 'ADD', 'CHANGE_REQUIRED', 'CRITICAL'] as const;
export const AirFilterConditions = ['OK', 'BLOCKED', 'CHANGED'] as const;
export const BatteryConditions = ['OK', 'WEAK', 'FLAT'] as const;
export const ChemicalUnits = ['LITRES', 'KG', 'G', 'ML', 'BAGS', 'DRUMS'] as const;
export type ChemicalUnit = (typeof ChemicalUnits)[number];
export const ChemicalUnitLabel: Record<ChemicalUnit, string> = { LITRES: 'L', KG: 'kg', G: 'g', ML: 'mL', BAGS: 'bags', DRUMS: 'drums' };

/**
 * Which daily form a machine gets (client spec §4A/§4B, §9.5): drilling rigs fill in the rig condition
 * check, every other machine the plant machine readings. LEGACY marks readings captured on the original
 * single form, before the split, so they still display with the fields they were recorded with.
 */
export const DailyFormTypes = ['LEGACY', 'RIG', 'PLANT'] as const;
export type DailyFormType = (typeof DailyFormTypes)[number];
export const dailyFormFor = (category: string): 'RIG' | 'PLANT' => (category === 'DRILLING' ? 'RIG' : 'PLANT');

/** Answers on the rig and plant checks. Stored as plain strings; these lists are the validation. */
export const CheckLevels = ['OK', 'LOW', 'CRITICAL'] as const;
export const WearConditions = ['GOOD', 'FAIR', 'DAMAGED'] as const;
export const BitConditions = ['GOOD', 'FAIR', 'WORN'] as const;
export const BrakeFluidLevels = ['OK', 'LOW', 'NA'] as const;
export const TrackConditions = ['GOOD', 'FAIR', 'DAMAGED', 'NA'] as const;
export const TyreConditions = ['GOOD', 'FAIR', 'WORN', 'FLAT', 'NA'] as const;
export const OkFaulty = ['OK', 'FAULTY'] as const;
/** Answers that need attention: CRITICAL_ANSWERS raise a machine alert; both are highlighted on review. */
export const CRITICAL_ANSWERS: readonly string[] = ['CRITICAL', 'DAMAGED', 'FAULTY', 'FLAT'];
export const WARN_ANSWERS: readonly string[] = ['LOW', 'FAIR', 'WORN'];

/**
 * Wireline core bit sizes with their nominal hole diameter, so picking a size fills in the hole diameter
 * (spec §4A asks for PQ/HQ/NQ, §9.2 for millimetres — this gives both). "Other" leaves the diameter to type.
 */
export const BitSizes = ['AQ', 'BQ', 'NQ', 'HQ', 'PQ'] as const;
export const BitSizeHoleMm: Record<(typeof BitSizes)[number], number> = { AQ: 48, BQ: 60, NQ: 75.7, HQ: 96, PQ: 122.6 };

export const ServiceTypes = ['HR_250', 'HR_500', 'HR_1000', 'ANNUAL', 'CONDITION_BASED', 'AD_HOC'] as const;
export const ScheduleStatuses = ['UPCOMING', 'DUE_NOW', 'OVERDUE', 'COMPLETED'] as const;

export const JobTypes = ['SCHEDULED_SERVICE', 'BREAKDOWN_REPAIR', 'MODIFICATION', 'INSPECTION'] as const;
export const JobStatuses = ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'AWAITING_PARTS'] as const;
export const TestResults = ['PASSED', 'FAILED', 'PENDING'] as const;

/** Asset number prefixes per category, e.g. DRL-001 */
export const AssetPrefix: Record<AssetCategory, string> = {
  DRILLING: 'DRL', EXCAVATOR: 'EXC', GRADER: 'GRD', TRUCK: 'TRK', HAULAGE: 'HAU', COMPRESSOR: 'CMP', ANCILLARY: 'ANC', OTHER: 'EQP',
};
