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

/**
 * One-line summaries of what the five built-in roles are for, so the admin UI can explain a role without
 * the reader having to decode its grant list. Keyed by `Role.key`. Custom roles created from the admin UI
 * have no entry — callers should fall back to showing nothing rather than inventing a description.
 */
export const RoleDescriptions: Record<string, string> = {
  OPERATOR: 'Submits daily machine readings and shift production reports for their own machines.',
  TECHNICIAN: 'Completes assigned maintenance services, raises job cards and keeps parts stock up to date.',
  SUPERVISOR: 'Approves shift reports and runs maintenance, job cards and assets for their own site.',
  MANAGER: 'Full operational oversight across every site, including approvals, report generation and the audit trail.',
  ADMIN: 'Manages roles, users, devices and security. Can edit master data, but cannot approve shift reports.',
};

/** The description for a role key, or undefined for custom roles. */
export const roleDescription = (key: string): string | undefined => RoleDescriptions[key];

/**
 * Plain-English explanation of each permission, for the role editor — a grant list of raw keys like
 * `shift_report:unlock` doesn't tell an admin what they are handing out. Typed as a total Record, so
 * adding a permission above without describing it here fails the build rather than shipping a blank row.
 * What each one *scopes to* (self / site / all) is chosen separately in the editor.
 */
export const PermissionDescriptions: Record<Permission, string> = {
  'user:manage': 'Create users, change their role and deactivate accounts.',
  'user:reset_password': 'Issue a temporary password to someone who is locked out.',
  'asset:read': 'View the machine register and asset details.',
  'asset:write': 'Register new machines and edit existing ones.',
  'shift_report:create': 'Submit a shift production report at the end of a shift.',
  'shift_report:read': 'View shift production reports.',
  'shift_report:approve': 'Sign off a submitted shift report as correct.',
  'shift_report:unlock': 'Reopen a report so the driller can correct and resubmit it.',
  'daily_reading:create': 'Submit a daily machine reading.',
  'daily_reading:read': 'View daily machine readings, including flagged ones.',
  'maintenance:read': 'View the maintenance schedule and upcoming services.',
  'maintenance:write': 'Schedule services and change when they are due.',
  'maintenance:complete': 'Mark a maintenance service as carried out.',
  'job_card:create': 'Raise a job card recording work done on a machine.',
  'job_card:read': 'View job cards.',
  'job_card:approve': 'Sign off a completed job card.',
  'parts:read': 'Search the parts store and check stock levels.',
  'parts:write': 'Adjust stock levels and add new parts.',
  'report:read': 'View generated reports.',
  'report:generate': 'Generate month-end and custom reports as PDF or Excel.',
  'notification:read': 'Receive and read notifications.',
  'audit:read': 'View the audit trail of who changed what, and when.',
  'role:manage': 'Create roles and change which permissions each one grants.',
};

/** The description for a permission key. */
export const permissionDescription = (p: Permission): string => PermissionDescriptions[p];
