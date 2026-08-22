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
// crypto.randomUUID() only exists in secure contexts (HTTPS/localhost); fall back to Math.random for plain-HTTP deployments.
function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
export function deviceId() { let id = localStorage.getItem('deviceId'); if (!id) { id = `web-${uuid()}`; localStorage.setItem('deviceId', id); } return id; }
