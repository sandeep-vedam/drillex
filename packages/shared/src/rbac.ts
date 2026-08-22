import type { Role } from './enums';

/**
 * Single source of truth for permissions (SRS §2.1, §9.3).
 * Scope tells the API how to row-filter:
 *  - self: only records the user created / is assigned to
 *  - site: records on the user's site
 *  - all:  every record
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
] as const;
export type Permission = (typeof Permissions)[number];

type Matrix = Record<Role, Partial<Record<Permission, Scope>>>;

export const RBAC: Matrix = {
  OPERATOR: {
    'asset:read': 'self',
    'shift_report:create': 'self', 'shift_report:read': 'self',
    'daily_reading:create': 'self', 'daily_reading:read': 'self',
    'notification:read': 'self',
  },
  TECHNICIAN: {
    'asset:read': 'site',
    'maintenance:read': 'self', 'maintenance:complete': 'self',
    'job_card:create': 'self', 'job_card:read': 'self',
    'parts:read': 'all', 'parts:write': 'all',
    'report:read': 'site',
    'notification:read': 'self',
  },
  SUPERVISOR: {
    'user:reset_password': 'site',
    'asset:read': 'site', 'asset:write': 'site',
    'shift_report:read': 'site', 'shift_report:approve': 'site', 'shift_report:unlock': 'site',
    'daily_reading:read': 'site',
    'maintenance:read': 'site', 'maintenance:write': 'site', 'maintenance:complete': 'site',
    'job_card:create': 'site', 'job_card:read': 'site', 'job_card:approve': 'site',
    'report:read': 'site',
    'notification:read': 'self',
  },
  MANAGER: {
    'asset:read': 'all', 'asset:write': 'all',
    'shift_report:read': 'all', 'shift_report:approve': 'all', 'shift_report:unlock': 'all',
    'daily_reading:read': 'all',
    'maintenance:read': 'all', 'maintenance:write': 'all', 'maintenance:complete': 'all',
    'job_card:read': 'all', 'job_card:approve': 'all',
    'parts:read': 'all', 'parts:write': 'all',
    'report:read': 'all', 'report:generate': 'all',
    'notification:read': 'self', 'audit:read': 'all',
  },
  ADMIN: {
    'user:manage': 'all', 'user:reset_password': 'all',
    'asset:read': 'all', 'asset:write': 'all',
    'shift_report:read': 'all', 'daily_reading:read': 'all',
    'maintenance:read': 'all', 'maintenance:write': 'all',
    'job_card:read': 'all', 'parts:read': 'all', 'parts:write': 'all',
    'report:read': 'all', 'report:generate': 'all',
    'notification:read': 'self', 'audit:read': 'all',
  },
};

export function can(role: Role, permission: Permission): Scope | undefined {
  return RBAC[role]?.[permission];
}

/** Default when no admin-configured "roles_requiring_2fa" SystemSetting exists yet. See apps/api/src/settings. */
export const ROLES_REQUIRING_2FA: Role[] = [];
