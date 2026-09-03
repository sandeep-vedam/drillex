import { Prisma } from '@prisma/client';

/**
 * MySQL has no scalar list type, so `technicianIds` is a JSON array of User.ids and
 * Prisma types it as `JsonValue`. These two helpers are the only code that knows that.
 */
export function technicianIds(value: Prisma.JsonValue | null | undefined): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** `where` fragment matching rows whose technicianIds array contains `userId`. */
export function assignedTo(userId: string) {
  return { technicianIds: { array_contains: userId } };
}
