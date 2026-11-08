import { z } from 'zod';
import {
  AssetCategories, AssetStatuses, Shifts, FluidLevels, AirFilterConditions,
  BatteryConditions, ChemicalUnits, CheckLevels, WearConditions, BitConditions, BrakeFluidLevels,
  TrackConditions, TyreConditions, OkFaulty, CRITICAL_ANSWERS,
} from './enums';
import { Permissions } from './rbac';

export const LoginSchema = z.object({
  employeeId: z.string().trim().toUpperCase().pipe(z.string().min(1)),
  /** A password, a 4-digit PIN, or a 6-digit temporary PIN (client spec §10.6). The server checks which applies. */
  password: z.string().min(4),
  deviceId: z.string().min(1),
  totp: z.string().length(6).optional(),
});
export type LoginInput = z.infer<typeof LoginSchema>;

/** PIN or password; whether the new one must be a 4-digit PIN or an 8+ character password depends on the role (server-checked). */
export const ChangePasswordSchema = z.object({ currentPassword: z.string().min(4), newPassword: z.string().min(4) }).refine((v) => v.currentPassword !== v.newPassword, { message: 'The new one must be different', path: ['newPassword'] });


export const AssignRoleSchema = z.object({ role: z.string().min(1) });

export const RolePermissionGrantSchema = z.object({ permission: z.enum(Permissions), scope: z.enum(['self', 'site', 'all']) });

export const RoleCreateSchema = z.object({
  name: z.string().min(1),
  permissions: z.array(RolePermissionGrantSchema).default([]),
});
export type RoleCreateInput = z.infer<typeof RoleCreateSchema>;

export const RoleUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  permissions: z.array(RolePermissionGrantSchema).optional(),
});
export type RoleUpdateInput = z.infer<typeof RoleUpdateSchema>;

export const AssetSchema = z.object({
  name: z.string().min(1),
  category: z.enum(AssetCategories),
  make: z.string().min(1),
  model: z.string().min(1),
  serialNumber: z.string().min(1),
  yearOfManufacture: z.number().int().min(1950).max(2100),
  commissionedAt: z.coerce.date(),
  siteId: z.string().uuid(),
  status: z.enum(AssetStatuses).default('ACTIVE'),
  operatorIds: z.array(z.string().uuid()).min(1),
  notes: z.string().optional(),
});

/** Category is omitted on purpose: the asset number is derived from it and is immutable (SRS 3.1). */
export const AssetUpdateSchema = AssetSchema.omit({ category: true }).partial();
export type AssetUpdateInput = z.infer<typeof AssetUpdateSchema>;

/**
 * One polymer / chemical line on a shift report. The driller types the name freely (client spec §4A); a
 * name that matches the chemical master list is linked to it server-side so cost and usage reports still
 * group it. `chemicalId` alone is what older app versions send.
 */
export const ChemicalEntrySchema = z
  .object({
    chemicalId: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(120).optional(),
    quantity: z.number().nonnegative(),
    unit: z.enum(ChemicalUnits),
    purpose: z.string().optional(),
    stockOnHand: z.number().nonnegative().optional(),
  })
  .refine((c) => !!c.chemicalId || !!c.name, { message: 'Enter the chemical name', path: ['name'] });

/** Supervisor entering on behalf of an operator (client spec §9.3): who for, and why — the reason is mandatory. */
const onBehalfFields = {
  operatorId: z.string().uuid().optional(),
  supervisorReason: z.string().trim().max(500).optional(),
};
const needsReason = (r: { operatorId?: string; supervisorReason?: string }) => !r.operatorId || (r.supervisorReason ?? '').trim().length >= 3;
const reasonIssue = { message: 'Give a reason for the supervisor entry', path: ['supervisorReason'] };

export const ShiftReportSchema = z
  .object({
    id: z.string().uuid().optional(), // client-generated for offline
    assetId: z.string().uuid(),
    date: z.coerce.date(),
    shift: z.enum(Shifts),
    siteId: z.string().uuid(),
    holeRef: z.string().min(1),
    startDepth: z.number().nonnegative(),
    endDepth: z.number().nonnegative(),
    holesCompleted: z.number().int().nonnegative(),
    holeDiameterMm: z.number().positive(),
    rockType: z.string().min(1),
    /** Computed from metres ÷ engine hours when the hour meters are given; older app versions typed it in. */
    penetrationRate: z.number().nonnegative().optional(),
    /** Engine hour meter (client spec §4A / §9.2). Optional here only so reports queued by older app versions still sync. */
    startHourMeter: z.number().nonnegative().optional(),
    endHourMeter: z.number().nonnegative().optional(),
    bitNumber: z.string().trim().max(40).optional(),
    bitSize: z.string().trim().max(20).optional(),
    remarks: z.string().max(4000).optional(),
    downtimeHours: z.number().nonnegative().default(0),
    downtimeReason: z.string().optional(),
    chemicals: z.array(ChemicalEntrySchema).default([]),
    signatureAttachmentId: z.string().uuid().optional(),
    ...onBehalfFields,
  })
  .refine((r) => r.endDepth >= r.startDepth, { message: 'End depth must be ≥ start depth', path: ['endDepth'] })
  .refine((r) => (r.startHourMeter == null) === (r.endHourMeter == null), { message: 'Enter both the start and end hour meter', path: ['endHourMeter'] })
  .refine((r) => r.startHourMeter == null || r.endHourMeter == null || r.endHourMeter >= r.startHourMeter, { message: 'End meter must be ≥ start meter', path: ['endHourMeter'] })
  .refine(needsReason, reasonIssue);
export type ShiftReportInput = z.infer<typeof ShiftReportSchema>;

/** SRS §4.3: total meters is never operator-supplied */
export const totalMetersDrilled = (start: number, end: number) => Math.max(0, end - start);
/** Engine hours this shift = end meter − start meter, to one decimal like the meter itself. */
export const engineHours = (start: number, end: number) => Math.round(Math.max(0, end - start) * 10) / 10;
/** Penetration rate (m/h) = metres drilled ÷ engine hours; 0 when the engine did not run. */
export const penetrationRate = (meters: number, hours: number) => (hours > 0 ? Math.round((meters / hours) * 100) / 100 : 0);

/** Fields every daily form shares: who, which machine, the issue toggles that raise alerts, rating, photos and signature. */
const dailyBase = {
  id: z.string().uuid().optional(),
  assetId: z.string().uuid(),
  date: z.coerce.date(),
  warningLights: z.boolean(),
  warningLightsNote: z.string().optional(),
  unusualNoises: z.boolean(),
  unusualNoisesNote: z.string().optional(),
  leaks: z.boolean(),
  leaksNote: z.string().optional(),
  conditionRating: z.number().int().min(1).max(5),
  signatureAttachmentId: z.string().uuid().optional(),
  ...onBehalfFields,
};

/** Drilling rig daily condition check (client spec §4A, tab 3). */
export const RigCheckSchema = z.object({
  ...dailyBase,
  formType: z.literal('RIG'),
  engineOil: z.enum(CheckLevels),
  hydraulicOil: z.enum(CheckLevels),
  coolant: z.enum(CheckLevels),
  gearOil: z.enum(CheckLevels),
  flushPump: z.enum(CheckLevels),
  rodCondition: z.enum(WearConditions),
  bitCondition: z.enum(BitConditions),
  faults: z.string().max(4000).optional(),
});

/** Plant machine daily readings for excavators, graders, trucks etc. (client spec §4B, tab 2). */
export const PlantReadingSchema = z.object({
  ...dailyBase,
  formType: z.literal('PLANT'),
  startReading: z.number().nonnegative(),
  endReading: z.number().nonnegative(),
  coolant: z.enum(CheckLevels),
  engineOil: z.enum(CheckLevels),
  gearOil: z.enum(CheckLevels),
  hydraulicOil: z.enum(CheckLevels),
  brakeFluid: z.enum(BrakeFluidLevels),
  fuelLevel: z.enum(CheckLevels),
  trackCondition: z.enum(TrackConditions),
  tyreCondition: z.enum(TyreConditions),
  attachmentCondition: z.enum(WearConditions),
  lights: z.enum(OkFaulty),
  brakes: z.enum(OkFaulty),
  faults: z.string().max(4000).optional(),
  fuelAdded: z.number().nonnegative().optional(),
});

/** The original single daily reading, still accepted so readings queued offline by older app versions sync. */
export const LegacyDailyReadingSchema = z.object({
  ...dailyBase,
  formType: z.literal('LEGACY'),
  hourMeter: z.number().nonnegative(),
  fuelStart: z.number().nonnegative(),
  fuelEnd: z.number().nonnegative(),
  engineOil: z.enum(FluidLevels),
  hydraulicOil: z.enum(FluidLevels),
  coolant: z.enum(FluidLevels),
  airFilter: z.enum(AirFilterConditions),
  tyrePressures: z.record(z.string(), z.number().nonnegative()).default({}),
  battery: z.enum(BatteryConditions),
  preStartChecklistDone: z.boolean(),
  notes: z.string().optional(),
});

/**
 * Any of the three daily forms. A payload without `formType` is the original form (older app versions),
 * so it is tagged LEGACY before validation rather than rejected.
 */
export const DailyReadingSchema = z
  .preprocess(
    (v) => (v && typeof v === 'object' && !('formType' in v) ? { ...v, formType: 'LEGACY' } : v),
    z.discriminatedUnion('formType', [RigCheckSchema, PlantReadingSchema, LegacyDailyReadingSchema]),
  )
  .superRefine((r, ctx) => {
    if (r.formType === 'PLANT' && r.endReading < r.startReading) ctx.addIssue({ code: 'custom', message: 'End reading must be ≥ start reading', path: ['endReading'] });
    if (!needsReason(r)) ctx.addIssue({ code: 'custom', ...reasonIssue });
  });
export type DailyReadingInput = z.infer<typeof DailyReadingSchema>;
export type RigCheckInput = z.infer<typeof RigCheckSchema>;
export type PlantReadingInput = z.infer<typeof PlantReadingSchema>;

export const fuelConsumed = (start: number, end: number) => Math.max(0, start - end);
/** Hours (or distance) this shift on a plant machine = end reading − start reading. */
export const machineUsage = (start: number, end: number) => Math.round(Math.max(0, end - start) * 10) / 10;

/** Condition rating at or below which a reading raises a maintenance review, unless an admin configures another (SRS §5.3). */
export const DEFAULT_ALERT_THRESHOLD = 2;

/** Labels for the rig / plant check items, in form order — shared by the forms, alerts and review screens. */
export const CHECK_LABELS: Record<string, string> = {
  engineOil: 'Engine oil', hydraulicOil: 'Hydraulic oil', coolant: 'Coolant', gearOil: 'Gear oil',
  flushPump: 'Water / flush pump', rodCondition: 'Rods', bitCondition: 'Bit',
  brakeFluid: 'Brake fluid', fuelLevel: 'Fuel level', trackCondition: 'Tracks', tyreCondition: 'Tyres',
  attachmentCondition: 'Bucket / blade / attachment', lights: 'Lights & indicators', brakes: 'Brakes',
};

/** The check items answered Critical / Damaged / Faulty / Flat, as labels. */
export function criticalChecks(r: Record<string, unknown>): string[] {
  return Object.keys(CHECK_LABELS).filter((k) => typeof r[k] === 'string' && CRITICAL_ANSWERS.includes(r[k] as string)).map((k) => CHECK_LABELS[k]);
}

type AlertInput = { warningLights?: boolean; unusualNoises?: boolean; leaks?: boolean; conditionRating: number } & Record<string, unknown>;

/** SRS §5.3 escalation rules, plus any rig / plant check answered Critical, Damaged, Faulty or Flat. */
export function readingAlerts(r: AlertInput, threshold = DEFAULT_ALERT_THRESHOLD) {
  const alerts: string[] = [];
  if (r.warningLights) alerts.push('WARNING_LIGHTS');
  if (r.leaks) alerts.push('LEAKS');
  if (r.unusualNoises) alerts.push('UNUSUAL_NOISES');
  if (criticalChecks(r).length) alerts.push('CRITICAL_CHECK');
  if (r.conditionRating <= threshold) alerts.push('MAINTENANCE_REVIEW');
  return alerts;
}
