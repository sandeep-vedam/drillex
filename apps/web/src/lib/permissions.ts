'use client';
import { useEffect, useState } from 'react';
import type { PermissionMatrix } from '@drillex/shared';
import { api } from './api';

// Module-level cache: every component that needs the matrix shares one fetch instead of each firing
// its own request, mirroring how the old static import was shared by every importer for free.
let cache: PermissionMatrix | null = null;
let inflight: Promise<PermissionMatrix> | null = null;

async function fetchMatrix(): Promise<PermissionMatrix> {
  if (cache) return cache;
  if (!inflight) inflight = api<PermissionMatrix>('/roles/matrix').then((m) => { cache = m; return m; }).finally(() => { inflight = null; });
  return inflight;
}

/** The admin-editable permission matrix (replaces the old static `RBAC` import). Fetched once and
 *  cached in memory; use with `can(matrix, role, permission)` from '@drillex/shared'. */
export function useRoleMatrix(): PermissionMatrix | null {
  const [matrix, setMatrix] = useState<PermissionMatrix | null>(cache);
  useEffect(() => { if (!matrix) fetchMatrix().then(setMatrix).catch(() => {}); }, [matrix]);
  return matrix;
}
