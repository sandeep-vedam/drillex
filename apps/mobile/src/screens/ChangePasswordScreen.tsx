import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, loadSession, saveSession } from '../lib/api';
import type { RootStackParamList } from '../navigation';
import { Button, Card, Eyebrow, Field } from '../ui';
import { colors } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ChangePassword'>;

/**
 * Mirrors the web portal's forced-change flow (apps/web/src/app/change-password): a user issued a
 * temporary password lands here instead of Home and cannot go anywhere else until it is replaced.
 * `forced` distinguishes that from a voluntary change started from the home screen.
 */
export default function ChangePasswordScreen({ navigation, route }: Props) {
  const forced = !!route.params?.forced;
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [rep, setRep] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Same four checks the web meter uses, so the two give identical feedback for the same password.
  const strength = [nw.length >= 8, /[A-Z]/.test(nw), /[0-9]/.test(nw), /[^A-Za-z0-9]/.test(nw)].filter(Boolean).length;

  async function submit() {
    setError(null);
    if (nw.length < 8) { setError('The new password must be at least 8 characters.'); return; }
    if (nw !== rep) { setError('New passwords do not match.'); return; }
    if (nw === cur) { setError('The new password must be different from the current one.'); return; }
    setBusy(true);
    try {
      await api('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: cur, newPassword: nw }) });
      // The stored session still carries the old flag; clear it so a later launch doesn't bounce them back here.
      const s = await loadSession();
      if (s) await saveSession({ ...s, user: { ...s.user, mustChangePassword: false } });
      navigation.replace('Home');
    } catch (e) {
      const m = (e as Error).message;
      setError(m === 'Unauthorized' ? (forced ? 'That temporary password is not correct.' : 'Your current password is not correct.') : m);
    } finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: 14 }}>
          <View>
            <Eyebrow>{forced ? 'First sign-in' : 'Account'}</Eyebrow>
            <Text style={s.h1}>{forced ? 'Set your personal password' : 'Change your password'}</Text>
            <Text style={s.lead}>
              {forced
                ? 'You signed in with a temporary password issued by your supervisor or administrator. Choose a password only you know.'
                : 'Choose a new password. You will stay signed in on this device.'}
            </Text>
          </View>

          <Field
            label={forced ? 'Temporary password' : 'Current password'}
            value={cur}
            onChangeText={setCur}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
          />

          <View style={{ gap: 6 }}>
            <Field
              label="New password"
              value={nw}
              onChangeText={setNw}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
            />
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {[0, 1, 2, 3].map((i) => (
                <View
                  key={i}
                  style={[s.meter, i < strength && { backgroundColor: strength < 3 ? colors.hazard : colors.ok }]}
                />
              ))}
            </View>
            <Text style={s.hint}>At least 8 characters. Mixing upper case, numbers and symbols makes it stronger.</Text>
          </View>

          <Field
            label="Repeat new password"
            value={rep}
            onChangeText={setRep}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="newPassword"
          />

          {error && <Text style={s.err}>{error}</Text>}

          <Button title={busy ? 'Saving…' : forced ? 'Set password and continue' : 'Update password'} onPress={submit} disabled={busy} />
        </Card>

        {forced && <Text style={s.foot}>You cannot skip this step — the temporary password is shared with whoever issued it.</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  h1: { fontSize: 24, fontWeight: '700', color: colors.navy800, marginTop: 4, letterSpacing: 0.2 },
  lead: { color: colors.muted, fontSize: 14, marginTop: 6, lineHeight: 20 },
  meter: { flex: 1, height: 4, backgroundColor: colors.line },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 16 },
  err: { color: colors.crit, fontSize: 13, fontWeight: '600', borderLeftWidth: 2, borderLeftColor: colors.crit, paddingLeft: 10 },
  foot: { color: colors.muted, fontSize: 12, textAlign: 'center', lineHeight: 17 },
});
