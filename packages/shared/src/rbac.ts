import type { Role } from './enums';

/**
 * Single source of truth for *which permissions exist* (SRS §2.1, §9.3). Scope tells the API how to
 * row-filter:
 *  - self: only records the user created / is assigned to
 *  - site: records on the user's site
 *  - all:  every record
 *
 * Which roles exist and which of these permissions (at what scope) each one holds is no longer fixed
 * here — it lives in the database (see apps/api/src/roles) and is admin-editable. `Permissions` stays a
 * closed, compile-time list because each entry corresponds to a real `@RequirePermission(...)` guard on
 * an API controller; a permission can't be invented from the admin UI without a matching code change.
 */
export type Scope = 'self' | 'site' | 'all';

export const Permissions = [
  'user:manage', 'user:reset_password',
  'asset:read', 'asset:write',
  'shift_report:create', 'shift_report:read', 'shift_report:approve', 'shift_report:unlock',
  'daily_reading:create', 'daily_reading:read',
  'maintenance:read', 'maintenance:write', 'maintenance:complete',
  'job_card:create', 'job_card:read', 'job_card:approve',
  'parts:read', 'parts:write',
  'report:read', 'report:generate',
  'notification:read',
  'audit:read',
  'role:manage',
] as const;
export type Permission = (typeof Permissions)[number];

/** { [roleKey]: { [permission]: scope } } — fetched from the database (GET /roles/matrix) rather than
 *  imported statically, so an admin can edit grants without a redeploy. */
export type PermissionMatrix = Record<string, Partial<Record<Permission, Scope>>>;

export function can(matrix: PermissionMatrix, role: string | undefined, permission: Permission): Scope | undefined {
  if (!role) return undefined;
  return matrix[role]?.[permission];
}

/** Default when no admin-configured "roles_requiring_2fa" SystemSetting exists yet. See apps/api/src/settings. */
export const ROLES_REQUIRING_2FA: Role[] = [];
