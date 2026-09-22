import * as Keychain from 'react-native-keychain';
import DeviceInfo from 'react-native-device-info';
import { Platform } from 'react-native';

// Dev (emulator/simulator): Android emulator reaches the host on 10.0.2.2; iOS simulator on localhost.
// A physical device in dev can use `adb reverse tcp:4000 tcp:4000` (then 10.0.2.2 won't work — use localhost).
const DEV_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
// Release / standalone installs: the API server reachable from the device's network.
// Served through nginx on port 80 (not 4000 — that port is firewalled off), so no port suffix here.
const RELEASE_HOST = '15.252.162.136';
export const API_URL = __DEV__ ? `http://${DEV_HOST}:4000/api/v1` : `http://${RELEASE_HOST}/api/v1`;

const SERVICE = 'drillex.session';

export type Session = { accessToken: string; refreshToken: string; user: { id: string; employeeId: string; role: string; siteId: string | null } };

export async function saveSession(s: Session) {
  await Keychain.setGenericPassword('session', JSON.stringify(s), { service: SERVICE });
}
export async function loadSession(): Promise<Session | null> {
  const c = await Keychain.getGenericPassword({ service: SERVICE });
  return c ? (JSON.parse(c.password) as Session) : null;
}
export async function clearSession() { await Keychain.resetGenericPassword({ service: SERVICE }); }

export async function getDeviceId() { return DeviceInfo.getUniqueId(); }

/** Thrown once the refresh token itself is rejected — the only case where the user has to sign in again. */
export class SessionExpiredError extends Error {
  constructor() { super('Session expired — please sign in again.'); this.name = 'SessionExpiredError'; }
}
let onSessionExpired: (() => void) | null = null;
export function setSessionExpiredHandler(fn: (() => void) | null) { onSessionExpired = fn; }

/**
 * Access tokens last 15 minutes, so anything long-lived — the outbox above all — has to refresh or it starts
 * 401ing and never recovers. Refresh tokens are rotated server-side, so concurrent 401s share one in-flight
 * refresh instead of each spending the token and invalidating the others.
 */
type RefreshResult = 'refreshed' | 'invalid' | 'unreachable';
let refreshing: Promise<RefreshResult> | null = null;
async function refreshSession(usedAccessToken?: string): Promise<RefreshResult> {
  const current = await loadSession();
  // A request that was already in flight when someone else refreshed comes back 401 holding a stale token;
  // the stored one is already new, so retry with it rather than rotating a second time.
  if (usedAccessToken && current && current.accessToken !== usedAccessToken) return 'refreshed';
  if (!refreshing) {
    // The guard is cleared when the request settles, not by each awaiter, or a late 401 starts a second
    // rotation — and two overlapping rotations revoke each other, which signs the user out.
    refreshing = (async (): Promise<RefreshResult> => {
      if (!current?.refreshToken) return 'invalid';
      let res: Response;
      try {
        res = await fetch(`${API_URL}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: current.refreshToken }) });
      } catch {
        return 'unreachable'; // offline or server down: keep the session, the caller retries later
      }
      if (!res.ok) return 'invalid';
      try { await saveSession((await res.json()) as Session); return 'refreshed'; } catch { return 'unreachable'; }
    })().finally(() => { refreshing = null; });
  }
  return refreshing;
}

/** Endpoints that mint tokens from credentials: a 401 from these is a real rejection, not an expired access token. */
const ISSUES_TOKENS = ['/auth/login', '/auth/refresh', '/auth/2fa'];

export async function api<T>(path: string, init: RequestInit = {}, isRetry = false): Promise<T> {
  const session = await loadSession();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {}),
      ...((init.headers as Record<string, string>) ?? {}),
    },
  });
  if (res.status === 401 && !isRetry && !ISSUES_TOKENS.some((p) => path.startsWith(p))) {
    const outcome = await refreshSession(session?.accessToken);
    if (outcome === 'refreshed') return api<T>(path, init, true); // the access token had merely expired
    if (outcome === 'invalid') { await clearSession(); onSessionExpired?.(); throw new SessionExpiredError(); }
    // 'unreachable' falls through: queued work stays queued and is retried, the session is left intact
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? res.statusText);
  }
  return res.json() as Promise<T>;
}
