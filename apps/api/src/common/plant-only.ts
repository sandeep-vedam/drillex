import { Prisma } from '@prisma/client';
import { can } from '@drillex/shared';
import { AuthUser } from '../auth/decorators';
import { RolesService } from '../roles/roles.service';

/**
 * A Plant Hire Supervisor works with plant machines only and must not see drilling rigs or their forms (client spec
 * §11.3). Same rule as FinanceService.access().plantOnly: plant hire entry without finance access.
 */
export async function plantOnlyAssetWhere(roles: RolesService, u: AuthUser): Promise<Prisma.AssetWhereInput> {
  const m = await roles.getMatrix();
  return can(m, u.role, 'plant_hire:write') && !can(m, u.role, 'finance:read') ? { category: { not: 'DRILLING' } } : {};
}
