import type { Role } from '@drillex/shared';
import { DEFAULT_OPERATIONS_SETTINGS, OperationsSettingsSchema, ROLES_REQUIRING_2FA, type OperationsSettings } from '@drillex/shared';
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
