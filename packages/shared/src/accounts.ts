import { z } from 'zod';

/**
 * Credentials (client spec §10.2, §10.6, §10.8).
 *
 * Field roles sign in with a 4-digit PIN; office roles (manager, finance, admin) keep a password plus 2FA. Which roles
 * use a PIN is admin-configurable; this is the default. An admin issues a temporary credential — a 6-digit PIN for PIN
 * roles, a password for the rest — that expires after TEMP_CREDENTIAL_HOURS and must be replaced on first sign-in.
 */
export const DEFAULT_PIN_ROLES = ['OPERATOR', 'TECHNICIAN', 'SUPERVISOR', 'PLANT_HIRE_SUPERVISOR'];
export const TEMP_CREDENTIAL_HOURS = 24;
/** Consecutive failed sign-ins after which the account is suspended until an admin unlocks it. */
export const MAX_FAILED_LOGINS = 5;

export const isLoginPin = (s: string) => /^\d{4}$/.test(s);
export const isTempPin = (s: string) => /^\d{6}$/.test(s);
export const PASSWORD_MIN = 8;

/** Why a new credential is not acceptable for this kind of account, or null when it is. */
export function credentialProblem(value: string, usesPin: boolean): string | null {
  if (usesPin) return isLoginPin(value) ? null : 'Your PIN must be exactly 4 digits';
  return value.length >= PASSWORD_MIN ? null : `Your password must be at least ${PASSWORD_MIN} characters`;
}

/** Shown on the login screen for a blocked or suspended account (client spec §10.3). */
export const ACCOUNT_SUSPENDED_MESSAGE = 'Account suspended. Contact your administrator.';

export const PinRolesSettingSchema = z.object({ roles: z.array(z.string().min(1)) });

const phone = z.string().trim().max(30).regex(/^[+0-9 ()-]*$/, 'Use digits, spaces and + only').optional();

/** Add user (client spec §10.2, §10.7). The employee ID is generated from the role when left blank; the temporary credential is always generated. */
export const CreateUserSchema = z.object({
  employeeId: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,20}$/, 'Letters and digits only, e.g. OPR004').optional(),
  name: z.string().trim().min(1),
  role: z.string().min(1), // validated against the live role list at the API layer, not a fixed enum
  siteId: z.string().uuid().optional(),
  phone,
  /** Machines the person is assigned to (stored as asset operator assignments). */
  assetIds: z.array(z.string().uuid()).default([]),
});
export type CreateUserInput = z.infer<typeof CreateUserSchema>;

/** Edit user: role changes go through their own route so they are audited as such. */
export const UpdateUserSchema = z.object({
  name: z.string().trim().min(1).optional(),
  siteId: z.string().uuid().nullable().optional(),
  phone: phone.nullable(),
  assetIds: z.array(z.string().uuid()).optional(),
});
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;

/** Block / unblock / deactivate. Blocking needs a reason (e.g. Resigned, Terminated, Contract ended). */
export const UserStatusSchema = z
  .object({ status: z.enum(['ACTIVE', 'DISABLED', 'BLOCKED']), reason: z.string().trim().max(300).optional() })
  .refine((v) => v.status !== 'BLOCKED' || (v.reason ?? '').length >= 3, { message: 'Give a reason for blocking the account', path: ['reason'] });
export const BLOCK_REASONS = ['Resigned', 'Terminated', 'Contract ended', 'Other'];

/** Next employee ID for a role prefix given the IDs already taken: OPR001 → OPR002, keeping at least three digits. */
export function nextEmployeeId(prefix: string, taken: string[]): string {
  const max = taken.reduce((m, id) => {
    const n = id.startsWith(prefix) && /^\d+$/.test(id.slice(prefix.length)) ? Number(id.slice(prefix.length)) : 0;
    return Math.max(m, n);
  }, 0);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}
