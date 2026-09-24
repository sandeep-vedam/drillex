-- Dynamic RBAC: roles and their permission grants move from the hardcoded packages/shared/src/rbac.ts
-- matrix into the database. "key" is the stable identifier User.role and the JWT already use; "name" is
-- the new editable display label. The 5 built-in roles are seeded below as isSystem so they can't be
-- deleted, with the exact grants the static matrix held.

-- Free the name "Role" before the table below can take it: in PostgreSQL a table implicitly creates a
-- type of the same name, so the old enum must go first. User.role moves onto a plain string here; the
-- FK to Role.key is added at the end, once the rows it references have been seeded.
ALTER TABLE "User" ALTER COLUMN "role" TYPE TEXT USING ("role"::TEXT);
DROP TYPE IF EXISTS "Role";

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "scope" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RolePermission_roleId_permission_key" ON "RolePermission"("roleId", "permission");

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the 5 built-in roles
INSERT INTO "Role" ("id", "key", "name", "isSystem", "updatedAt") VALUES
  ('role_operator',   'OPERATOR',   'Operator',   true, CURRENT_TIMESTAMP),
  ('role_technician', 'TECHNICIAN', 'Technician', true, CURRENT_TIMESTAMP),
  ('role_supervisor', 'SUPERVISOR', 'Supervisor', true, CURRENT_TIMESTAMP),
  ('role_manager',    'MANAGER',    'Manager',    true, CURRENT_TIMESTAMP),
  ('role_admin',      'ADMIN',      'Admin',      true, CURRENT_TIMESTAMP);

-- Backfill grants from the retired static RBAC matrix
INSERT INTO "RolePermission" ("id", "roleId", "permission", "scope") VALUES
  -- OPERATOR
  ('rp_operator_asset_read',          'role_operator', 'asset:read',          'self'),
  ('rp_operator_shift_report_create', 'role_operator', 'shift_report:create', 'self'),
  ('rp_operator_shift_report_read',   'role_operator', 'shift_report:read',   'self'),
  ('rp_operator_daily_reading_create','role_operator', 'daily_reading:create','self'),
  ('rp_operator_daily_reading_read',  'role_operator', 'daily_reading:read',  'self'),
  ('rp_operator_notification_read',   'role_operator', 'notification:read',   'self'),
  -- TECHNICIAN
  ('rp_technician_asset_read',        'role_technician', 'asset:read',          'site'),
  ('rp_technician_maintenance_read',  'role_technician', 'maintenance:read',    'self'),
  ('rp_technician_maintenance_complete','role_technician','maintenance:complete','self'),
  ('rp_technician_job_card_create',   'role_technician', 'job_card:create',     'self'),
  ('rp_technician_job_card_read',     'role_technician', 'job_card:read',       'self'),
  ('rp_technician_parts_read',        'role_technician', 'parts:read',          'all'),
  ('rp_technician_parts_write',       'role_technician', 'parts:write',         'all'),
  ('rp_technician_report_read',       'role_technician', 'report:read',         'site'),
  ('rp_technician_notification_read', 'role_technician', 'notification:read',   'self'),
  -- SUPERVISOR
  ('rp_supervisor_user_reset_password','role_supervisor','user:reset_password', 'site'),
  ('rp_supervisor_asset_read',        'role_supervisor', 'asset:read',          'site'),
  ('rp_supervisor_asset_write',       'role_supervisor', 'asset:write',         'site'),
  ('rp_supervisor_shift_report_read', 'role_supervisor', 'shift_report:read',   'site'),
  ('rp_supervisor_shift_report_approve','role_supervisor','shift_report:approve','site'),
  ('rp_supervisor_shift_report_unlock','role_supervisor','shift_report:unlock', 'site'),
  ('rp_supervisor_daily_reading_read','role_supervisor', 'daily_reading:read',  'site'),
  ('rp_supervisor_maintenance_read',  'role_supervisor', 'maintenance:read',    'site'),
  ('rp_supervisor_maintenance_write', 'role_supervisor', 'maintenance:write',   'site'),
  ('rp_supervisor_maintenance_complete','role_supervisor','maintenance:complete','site'),
  ('rp_supervisor_job_card_create',   'role_supervisor', 'job_card:create',     'site'),
  ('rp_supervisor_job_card_read',     'role_supervisor', 'job_card:read',       'site'),
  ('rp_supervisor_job_card_approve',  'role_supervisor', 'job_card:approve',    'site'),
  ('rp_supervisor_report_read',       'role_supervisor', 'report:read',         'site'),
  ('rp_supervisor_notification_read', 'role_supervisor', 'notification:read',   'self'),
  -- MANAGER
  ('rp_manager_asset_read',           'role_manager', 'asset:read',            'all'),
  ('rp_manager_asset_write',          'role_manager', 'asset:write',           'all'),
  ('rp_manager_shift_report_read',    'role_manager', 'shift_report:read',     'all'),
  ('rp_manager_shift_report_approve', 'role_manager', 'shift_report:approve',  'all'),
  ('rp_manager_shift_report_unlock',  'role_manager', 'shift_report:unlock',   'all'),
  ('rp_manager_daily_reading_read',   'role_manager', 'daily_reading:read',    'all'),
  ('rp_manager_maintenance_read',     'role_manager', 'maintenance:read',      'all'),
  ('rp_manager_maintenance_write',    'role_manager', 'maintenance:write',     'all'),
  ('rp_manager_maintenance_complete', 'role_manager', 'maintenance:complete',  'all'),
  ('rp_manager_job_card_read',        'role_manager', 'job_card:read',         'all'),
  ('rp_manager_job_card_approve',     'role_manager', 'job_card:approve',      'all'),
  ('rp_manager_parts_read',           'role_manager', 'parts:read',            'all'),
  ('rp_manager_parts_write',          'role_manager', 'parts:write',           'all'),
  ('rp_manager_report_read',          'role_manager', 'report:read',           'all'),
  ('rp_manager_report_generate',      'role_manager', 'report:generate',       'all'),
  ('rp_manager_notification_read',    'role_manager', 'notification:read',     'self'),
  ('rp_manager_audit_read',           'role_manager', 'audit:read',            'all'),
  -- ADMIN
  ('rp_admin_user_manage',            'role_admin', 'user:manage',            'all'),
  ('rp_admin_user_reset_password',    'role_admin', 'user:reset_password',    'all'),
  ('rp_admin_asset_read',             'role_admin', 'asset:read',             'all'),
  ('rp_admin_asset_write',            'role_admin', 'asset:write',            'all'),
  ('rp_admin_shift_report_read',      'role_admin', 'shift_report:read',      'all'),
  ('rp_admin_daily_reading_read',     'role_admin', 'daily_reading:read',     'all'),
  ('rp_admin_maintenance_read',       'role_admin', 'maintenance:read',       'all'),
  ('rp_admin_maintenance_write',      'role_admin', 'maintenance:write',      'all'),
  ('rp_admin_job_card_read',          'role_admin', 'job_card:read',          'all'),
  ('rp_admin_parts_read',             'role_admin', 'parts:read',             'all'),
  ('rp_admin_parts_write',            'role_admin', 'parts:write',            'all'),
  ('rp_admin_report_read',            'role_admin', 'report:read',            'all'),
  ('rp_admin_report_generate',        'role_admin', 'report:generate',        'all'),
  ('rp_admin_notification_read',      'role_admin', 'notification:read',      'self'),
  ('rp_admin_audit_read',             'role_admin', 'audit:read',             'all'),
  ('rp_admin_role_manage',            'role_admin', 'role:manage',            'all');

-- Now that every role key above exists as a row, point User.role at it. Renaming a role's display
-- name never touches this column, so every existing `u.role === 'X'` check keeps working unchanged.
ALTER TABLE "User" ADD CONSTRAINT "User_role_fkey" FOREIGN KEY ("role") REFERENCES "Role"("key") ON DELETE RESTRICT ON UPDATE CASCADE;
