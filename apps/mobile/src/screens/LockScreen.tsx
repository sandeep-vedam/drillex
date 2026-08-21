import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { api, clearSession, getDeviceId, loadSession, saveSession, Session } from '../lib/api';
import { Button, Field, Mark } from '../ui';
import { colors } from '../ui/theme';
import { biometricsAvailable, promptBiometric } from '../security/biometrics';

export default function LockScreen({ onUnlock, onSignedOut }: { onUnlock: () => void; onSignedOut: () => void }) {
  const [who, setWho] = useState<string>('');
  const [bio, setBio] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadSession().then((s) => setWho(s?.user.employeeId ?? ''));
    biometricsAvailable().then((b) => { setBio(b); if (b) tryBio(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function tryBio() { if (await promptBiometric()) onUnlock(); }
  async function withPassword() {
    setBusy(true); setError(null);
    try {
      const deviceId = await getDeviceId();
      const res = await api<Session>('/auth/login', { method: 'POST', body: JSON.stringify({ employeeId: who, password, deviceId }) });
      await saveSession(res); onUnlock();
    } catch (e) { setError((e as Error).message === 'Unauthorized' ? 'Incorrect password.' : (e as Error).message); } finally { setBusy(false); }
  }
  async function signOut() { await clearSession(); onSignedOut(); }

  return (
    <View style={s.wrap}>
      <Mark size={44} />
      <Text style={s.h1}>Session locked</Text>
      <Text style={s.sub}>Locked after 15 minutes of inactivity. Signed in as <Text style={{ fontFamily: 'Menlo', color: colors.ink }}>{who}</Text>.</Text>
      <View style={{ gap: 12, marginTop: 24, width: '100%' }}>
        {bio && <Button title={`Unlock with ${bio === 'FaceID' ? 'Face ID' : bio === 'TouchID' ? 'Touch ID' : 'biometrics'}`} onPress={tryBio} />}
        <Field label="Password" placeholder="••••••••" secureTextEntry value={password} onChangeText={setPassword} onSubmitEditing={withPassword} />
        {error && <Text style={s.err}>{error}</Text>}
        <Button title={busy ? 'Unlocking…' : 'Unlock with password'} onPress={withPassword} disabled={busy || !password} variant={bio ? 'ghost' : 'primary'} />
        <Button title="Sign out" onPress={signOut} variant="ghost" />
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.canvas, padding: 24, justifyContent: 'center', alignItems: 'flex-start' },
  h1: { fontSize: 30, fontWeight: '800', color: colors.navy800, marginTop: 16 },
  sub: { color: colors.muted, fontSize: 14, marginTop: 4 },
  err: { color: colors.crit },
});
