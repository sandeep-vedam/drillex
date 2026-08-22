import type { Role } from '@drillex/shared';
import { ROLES_REQUIRING_2FA } from '@drillex/shared';
import { PrismaService } from '../prisma/prisma.service';

export const ROLES_2FA_KEY = 'roles_requiring_2fa';

/** Reads the admin-configured set of roles that require 2FA at login, falling back to the shared default. */
export async function getRoles2faRequired(prisma: PrismaService): Promise<Role[]> {
  const row = await prisma.systemSetting.findUnique({ where: { key: ROLES_2FA_KEY } });
  if (!row) return ROLES_REQUIRING_2FA;
  return row.value as Role[];
}
