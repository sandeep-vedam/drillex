import ReactNativeBiometrics from 'react-native-biometrics';
const rnb = new ReactNativeBiometrics({ allowDeviceCredentials: false });
export async function biometricsAvailable() {
  try { const r = await rnb.isSensorAvailable(); return r.available ? r.biometryType ?? 'Biometrics' : null; } catch { return null; }
}
export async function promptBiometric(reason = 'Unlock Drillex') {
  try { const r = await rnb.simplePrompt({ promptMessage: reason, cancelButtonText: 'Use password' }); return r.success; } catch { return false; }
}
