import { z } from 'zod';
import {
  AssetCategories, AssetStatuses, Shifts, FluidLevels, AirFilterConditions,
  BatteryConditions, ChemicalUnits, Roles,
} from './enums';

export const LoginSchema = z.object({
  employeeId: z.string().min(1),
  password: z.string().min(8),
  deviceId: z.string().min(1),
  totp: z.string().length(6).optional(),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const ChangePasswordSchema = z.object({ currentPassword: z.string().min(8), newPassword: z.string().min(8) }).refine((v) => v.currentPassword !== v.newPassword, { message: 'New password must differ', path: ['newPassword'] });

export const CreateUserSchema = z.object({
  employeeId: z.string().min(1),
  name: z.string().min(1),
  role: z.enum(Roles),
  siteId: z.string().uuid().optional(),
  password: z.string().min(8),
});

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

export const ChemicalEntrySchema = z.object({
  chemicalId: z.string().uuid(),
  quantity: z.number().nonnegative(),
  unit: z.enum(ChemicalUnits),
  purpose: z.string().optional(),
  stockOnHand: z.number().nonnegative().optional(),
});

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
    penetrationRate: z.number().nonnegative(),
    downtimeHours: z.number().nonnegative().default(0),
    downtimeReason: z.string().optional(),
    chemicals: z.array(ChemicalEntrySchema).default([]),
    signatureAttachmentId: z.string().uuid().optional(),
  })
  .refine((r) => r.endDepth >= r.startDepth, { message: 'End depth must be ≥ start depth', path: ['endDepth'] });
export type ShiftReportInput = z.infer<typeof ShiftReportSchema>;

/** SRS §4.3: total meters is never operator-supplied */
export const totalMetersDrilled = (start: number, end: number) => Math.max(0, end - start);

export const DailyReadingSchema = z.object({
  id: z.string().uuid().optional(),
  assetId: z.string().uuid(),
  date: z.coerce.date(),
  hourMeter: z.number().nonnegative(),
  fuelStart: z.number().nonnegative(),
  fuelEnd: z.number().nonnegative(),
  engineOil: z.enum(FluidLevels),
  hydraulicOil: z.enum(FluidLevels),
  coolant: z.enum(FluidLevels),
  airFilter: z.enum(AirFilterConditions),
  tyrePressures: z.record(z.string(), z.number().nonnegative()).default({}),
  battery: z.enum(BatteryConditions),
  warningLights: z.boolean(),
  warningLightsNote: z.string().optional(),
  unusualNoises: z.boolean(),
  unusualNoisesNote: z.string().optional(),
  leaks: z.boolean(),
  leaksNote: z.string().optional(),
  preStartChecklistDone: z.boolean(),
  conditionRating: z.number().int().min(1).max(5),
  notes: z.string().optional(),
  signatureAttachmentId: z.string().uuid().optional(),
});
export type DailyReadingInput = z.infer<typeof DailyReadingSchema>;

export const fuelConsumed = (start: number, end: number) => Math.max(0, start - end);

/** SRS §5.3 escalation rules */
export function readingAlerts(r: Pick<DailyReadingInput, 'warningLights' | 'unusualNoises' | 'leaks' | 'conditionRating'>) {
  const alerts: string[] = [];
  if (r.warningLights) alerts.push('WARNING_LIGHTS');
  if (r.leaks) alerts.push('LEAKS');
  if (r.unusualNoises) alerts.push('UNUSUAL_NOISES');
  if (r.conditionRating <= 2) alerts.push('MAINTENANCE_REVIEW');
  return alerts;
}
