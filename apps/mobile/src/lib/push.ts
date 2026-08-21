import { api } from './api';
/**
 * Push registration (SRS §9.4). The server sends via FCM HTTP v1 for Android and iOS.
 * Wiring a native push SDK requires Firebase project files (android/app/google-services.json, ios GoogleService-Info.plist + APNs key).
 * Once @react-native-firebase/messaging is added, call registerPushToken(await messaging().getToken(), Platform.OS).
 */
export async function registerPushToken(pushToken: string, platform: 'android' | 'ios') {
  try { await api('/auth/push-token', { method: 'POST', body: JSON.stringify({ pushToken, platform }) }); } catch {}
}
