import { Prisma } from '@prisma/client';

/**
 * Next number in a prefixed sequence such as JC-2026-#### or DRL-###.
 *  - Takes a transaction-scoped advisory lock on the prefix, so concurrent creates queue instead of both reading the
 *    same "last" number and colliding on the unique column.
 *  - Reads the highest number numerically: sorting the text puts DRL-1000 before DRL-999, which would hand out 1000 again.
 * Table and column are code constants, never user input.
 */
export async function nextSequence(tx: Prisma.TransactionClient, table: 'JobCard' | 'Asset', column: 'jobNo' | 'assetNumber', prefix: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`${table}:${prefix}`}))::text`;
  const rows = await tx.$queryRaw<{ n: number | null }[]>`
    SELECT MAX(CAST(SUBSTRING(${Prisma.raw(`"${column}"`)} FROM ${prefix.length + 1}::int) AS INTEGER)) AS n
    FROM ${Prisma.raw(`"${table}"`)}
    WHERE ${Prisma.raw(`"${column}"`)} LIKE ${`${prefix}%`} AND SUBSTRING(${Prisma.raw(`"${column}"`)} FROM ${prefix.length + 1}::int) ~ '^[0-9]+$'`;
  return Number(rows[0]?.n ?? 0) + 1;
}
