import type { Role } from '@drillex/shared';
import { DEFAULT_FINANCE_SETTINGS, DEFAULT_OPERATIONS_SETTINGS, DEFAULT_PIN_ROLES, FinanceSettingsSchema, OperationsSettingsSchema, PinRolesSettingSchema, ROLES_REQUIRING_2FA, type FinanceSettings, type OperationsSettings } from '@drillex/shared';
import { PrismaService } from '../prisma/prisma.service';

export const ROLES_2FA_KEY = 'roles_requiring_2fa';

/** Reads the admin-configured set of roles that require 2FA at login, falling back to the shared default. */
export async function getRoles2faRequired(prisma: PrismaService): Promise<Role[]> {
  const row = await prisma.systemSetting.findUnique({ where: { key: ROLES_2FA_KEY } });
  if (!row) return ROLES_REQUIRING_2FA;
  return row.value as Role[];
}

export const OPS_KEY = 'operations';

/** Admin-configured operational policy (alert threshold, job-card approval), with the SRS defaults for anything unset. */
export async function getOperationsSettings(prisma: PrismaService): Promise<OperationsSettings> {
  const row = await prisma.systemSetting.findUnique({ where: { key: OPS_KEY } });
  const parsed = OperationsSettingsSchema.partial().safeParse(row?.value ?? {});
  return { ...DEFAULT_OPERATIONS_SETTINGS, ...(parsed.success ? parsed.data : {}) };
}

export const PIN_ROLES_KEY = 'pin_login_roles';

/** Roles that sign in with a 4-digit PIN instead of a password (client spec §10.6), admin-configurable. */
export async function getPinRoles(prisma: PrismaService): Promise<string[]> {
  const row = await prisma.systemSetting.findUnique({ where: { key: PIN_ROLES_KEY } });
  const parsed = PinRolesSettingSchema.safeParse({ roles: row?.value });
  return parsed.success ? parsed.data.roles : DEFAULT_PIN_ROLES;
}

export const FINANCE_KEY = 'finance';

/** Currencies in use and the company details printed on follow-up messages, admin-configurable. */
export async function getFinanceSettings(prisma: PrismaService): Promise<FinanceSettings> {
  const row = await prisma.systemSetting.findUnique({ where: { key: FINANCE_KEY } });
  const merged = { ...DEFAULT_FINANCE_SETTINGS, ...((row?.value as object) ?? {}) };
  const parsed = FinanceSettingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_FINANCE_SETTINGS;
}
