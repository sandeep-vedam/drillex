import * as Keychain from 'react-native-keychain';
import DeviceInfo from 'react-native-device-info';
import { Platform } from 'react-native';

// Android emulator reaches the host on 10.0.2.2; iOS simulator on localhost.
export const API_URL = Platform.OS === 'android' ? 'http://10.0.2.2:4000/api/v1' : 'http://localhost:4000/api/v1';

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
