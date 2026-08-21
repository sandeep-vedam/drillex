import React, { useState } from 'react';
import { Text, StyleSheet, KeyboardAvoidingView, Platform, View, ScrollView } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, getDeviceId, saveSession, Session } from '../lib/api';
import type { RootStackParamList } from '../navigation';
import { Button, Eyebrow, Field, Mark } from '../ui';
import { colors } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true); setError(null);
    try {
      const deviceId = await getDeviceId();
      const res = await api<Session & { requires2faSetup?: boolean }>('/auth/login', {
        method: 'POST', body: JSON.stringify({ employeeId: employeeId.trim().toUpperCase(), password, deviceId }),
      });
      if (res.requires2faSetup) { setError('This role needs two-factor authentication. Enrol on the web portal first.'); return; }
      await saveSession(res);
      navigation.replace('Home');
    } catch (e) {
      const m = (e as Error).message;
      setError(m === 'Unauthorized' ? 'Employee ID or password is incorrect.' : m);
    } finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.navy900 }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={s.hero}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Mark size={34} />
            <View><Text style={s.brand}>DRILLEX</Text><Text style={s.brandSub}>OPERATIONS</Text></View>
          </View>
          <View style={{ marginTop: 36 }}>
            <Text style={s.kicker}>FIELD OPERATIONS · MAINTENANCE · REPORTING</Text>
            <Text style={s.h1}>Every rig,{'\n'}every shift,{'\n'}one record.</Text>
          </View>
          <View style={s.ring} /><View style={s.ring2} />
        </View>
        <View style={s.sheet}>
          <Eyebrow>Sign in</Eyebrow>
          <Text style={s.h2}>Welcome back</Text>
          <Text style={s.sub}>Use your Employee ID and personal password.</Text>
          <View style={{ gap: 14, marginTop: 18 }}>
            <Field label="Employee ID" placeholder="OPR001" autoCapitalize="characters" autoCorrect={false} value={employeeId} onChangeText={setEmployeeId} textContentType="username" />
            <Field label="Password" placeholder="••••••••" secureTextEntry value={password} onChangeText={setPassword} textContentType="password" onSubmitEditing={submit} />
            {error && <Text style={s.err}>{error}</Text>}
            <Button title={busy ? 'Signing in…' : 'Sign in'} onPress={submit} disabled={busy} />
            <Text style={s.help}>Forgot your password? Ask your supervisor or administrator to reset it.</Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  hero: { padding: 24, paddingTop: 64, paddingBottom: 40, overflow: 'hidden' },
  brand: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: 1.2, lineHeight: 22 },
  brandSub: { color: 'rgba(255,255,255,.55)', fontSize: 9, letterSpacing: 3.5 },
  kicker: { color: colors.hazard, fontSize: 10, letterSpacing: 2.4, fontWeight: '700', marginBottom: 10 },
  h1: { color: '#fff', fontSize: 40, fontWeight: '800', lineHeight: 42, letterSpacing: -0.5 },
  ring: { position: 'absolute', right: -70, top: 30, width: 220, height: 220, borderRadius: 110, borderWidth: 18, borderColor: 'rgba(224,106,16,.18)' },
  ring2: { position: 'absolute', right: 6, top: 106, width: 70, height: 70, borderRadius: 35, borderWidth: 9, borderColor: 'rgba(224,106,16,.4)' },
  sheet: { flex: 1, backgroundColor: colors.canvas, padding: 24, paddingTop: 28 },
  h2: { fontSize: 30, fontWeight: '800', color: colors.navy800, marginTop: 4 },
  sub: { color: colors.muted, fontSize: 14, marginTop: 2 },
  err: { color: colors.crit, borderLeftWidth: 2, borderLeftColor: colors.crit, paddingLeft: 10, fontSize: 13 },
  help: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 4 },
});
