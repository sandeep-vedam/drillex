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

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = await loadSession();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {}),
      ...((init.headers as Record<string, string>) ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? res.statusText);
  }
  return res.json() as Promise<T>;
}
