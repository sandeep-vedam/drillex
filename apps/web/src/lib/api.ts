'use client';
const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
export type SessionUser = { id: string; employeeId: string; role: string; siteId: string | null; mustChangePassword?: boolean };
export function getUser(): SessionUser | null { if (typeof window === 'undefined') return null; try { return JSON.parse(localStorage.getItem('user') ?? 'null'); } catch { return null; } }
export function signOut() { localStorage.removeItem('accessToken'); localStorage.removeItem('refreshToken'); localStorage.removeItem('user'); window.location.href = '/login'; }
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) } });
  if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth/')) signOut();
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(typeof b?.message === 'string' ? b.message : res.statusText); }
  return res.json();
}
export function deviceId() { let id = localStorage.getItem('deviceId'); if (!id) { id = `web-${crypto.randomUUID()}`; localStorage.setItem('deviceId', id); } return id; }
