import { OPEN_JOB_STATUSES } from '@drillex/shared';
import type { Prisma } from '@prisma/client';

/**
 * Job cards that still hold a machine in the workshop. With approval required (SRS §7.6), a completed card is only
 * done once a supervisor approves it, so completed-but-unapproved cards count as open too.
 */
export function openJobCardWhere(approvalRequired: boolean): Prisma.JobCardWhereInput {
  const inProgress: Prisma.JobCardWhereInput = { status: { in: [...OPEN_JOB_STATUSES] } };
  return { deletedAt: null, ...(approvalRequired ? { OR: [inProgress, { status: 'COMPLETED', approvedAt: null }] } : inProgress) };
}

/** Asset is Under Maintenance while any job card is open (SRS §3.4); back to Active when none are. Decommissioned assets are left alone. */
export async function syncAssetStatus(tx: Prisma.TransactionClient, assetId: string, approvalRequired: boolean) {
  const open = await tx.jobCard.count({ where: { assetId, ...openJobCardWhere(approvalRequired) } });
  const asset = await tx.asset.findUnique({ where: { id: assetId } });
  if (!asset || asset.status === 'DECOMMISSIONED') return;
  if (open && asset.status !== 'UNDER_MAINTENANCE') await tx.asset.update({ where: { id: assetId }, data: { status: 'UNDER_MAINTENANCE' } });
  if (!open && asset.status === 'UNDER_MAINTENANCE') await tx.asset.update({ where: { id: assetId }, data: { status: 'ACTIVE' } });
}
