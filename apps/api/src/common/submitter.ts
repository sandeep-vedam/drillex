import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { can, Permission } from '@drillex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RolesService } from '../roles/roles.service';
import { AuthUser } from '../auth/decorators';

export type Submitter = {
  /** The operator the record belongs to (stored as userId). */
  userId: string;
  operatorEmployeeId: string;
  /** Set only when a supervisor entered it on the operator's behalf (client spec §9.3). */
  enteredById: string | null;
  supervisorReason: string | null;
};

/**
 * Decides whose record a new shift report / daily form is, and whether the caller may file it.
 *
 * - Filing for yourself needs `createPermission`; at `self` scope only for a machine you are assigned to.
 * - Filing for someone else (`operatorId` set) needs `submission:on_behalf`; the operator must be assigned to
 *   the machine, the machine must be on your site unless the grant is `all`, and a reason is mandatory.
 *
 * Checked here against the live role matrix rather than relying on the route guard's scope, so the offline
 * sync endpoint — which has no per-kind route guard — enforces exactly the same rules as the REST routes.
 */
export async function resolveSubmitter(
  prisma: PrismaService, roles: RolesService, u: AuthUser,
  asset: { id: string; siteId: string; assetNumber: string },
  input: { operatorId?: string; supervisorReason?: string },
  createPermission: Permission,
): Promise<Submitter> {
  const matrix = await roles.getMatrix();

  if (input.operatorId && input.operatorId !== u.id) {
    const scope = can(matrix, u.role, 'submission:on_behalf');
    if (!scope || scope === 'self') throw new ForbiddenException('You cannot enter reports on behalf of operators');
    if (scope === 'site' && asset.siteId !== u.siteId) throw new ForbiddenException(`${asset.assetNumber} is not on your site`);
    const reason = input.supervisorReason?.trim();
    if (!reason || reason.length < 3) throw new BadRequestException('A reason for the supervisor entry is required');
    const link = await prisma.assetOperator.findFirst({ where: { assetId: asset.id, userId: input.operatorId, validTo: null }, include: { user: { select: { employeeId: true } } } });
    if (!link) throw new BadRequestException(`That operator is not assigned to ${asset.assetNumber}`);
    return { userId: input.operatorId, operatorEmployeeId: link.user.employeeId, enteredById: u.id, supervisorReason: reason };
  }

  const scope = can(matrix, u.role, createPermission);
  if (!scope) throw new ForbiddenException(`Missing permission ${createPermission}`);
  if (scope === 'self' && !(await prisma.assetOperator.findFirst({ where: { assetId: asset.id, userId: u.id, validTo: null } })))
    throw new ForbiddenException('You are not an assigned operator of this machine');
  if (scope === 'site' && asset.siteId !== u.siteId) throw new ForbiddenException(`${asset.assetNumber} is not on your site`);
  return { userId: u.id, operatorEmployeeId: u.employeeId, enteredById: null, supervisorReason: null };
}

/** Whether the caller may change a record that belongs to another operator (a supervisor correcting it). */
export async function mayActForOperator(roles: RolesService, u: AuthUser, assetSiteId: string) {
  const scope = can(await roles.getMatrix(), u.role, 'submission:on_behalf');
  return scope === 'all' || (scope === 'site' && assetSiteId === u.siteId);
}
