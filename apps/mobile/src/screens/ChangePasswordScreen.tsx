import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, loadSession, saveSession } from '../lib/api';
import type { RootStackParamList } from '../navigation';
import { Button, Card, Eyebrow, Field } from '../ui';
import { colors } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ChangePassword'>;

/**
 * Mirrors the web portal's forced-change flow: someone issued a temporary credential lands here and cannot go
 * anywhere else until it is replaced. Field roles set a 4-digit PIN (client spec §10.2, §10.6); office roles a password.
 */
export default function ChangePasswordScreen({ navigation, route }: Props) {
  const forced = !!route.params?.forced;
  const [pin, setPin] = useState(false);
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [rep, setRep] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { loadSession().then((s) => setPin(!!s?.user.usesPin)).catch(() => {}); }, []);
  const word = pin ? 'PIN' : 'password';
  const digits = (v: string) => v.replace(/\D/g, '');

  // Same four checks the web meter uses, so the two give identical feedback for the same password.
  const strength = [nw.length >= 8, /[A-Z]/.test(nw), /[0-9]/.test(nw), /[^A-Za-z0-9]/.test(nw)].filter(Boolean).length;

  async function submit() {
    setError(null);
    if (pin && !/^\d{4}$/.test(nw)) { setError('Your PIN must be exactly 4 digits.'); return; }
    if (!pin && nw.length < 8) { setError('The new password must be at least 8 characters.'); return; }
    if (nw !== rep) { setError(`The new ${word}s do not match.`); return; }
    if (nw === cur) { setError(`The new ${word} must be different from the current one.`); return; }
    setBusy(true);
    try {
      await api('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: cur, newPassword: nw }) });
      // The stored session still carries the old flag; clear it so a later launch doesn't bounce them back here.
      const s = await loadSession();
      if (s) await saveSession({ ...s, user: { ...s.user, mustChangePassword: false } });
      navigation.replace('Home');
    } catch (e) {
      const m = (e as Error).message;
      setError(m === 'Unauthorized' ? (forced ? `That temporary ${word} is not correct.` : `Your current ${word} is not correct.`) : m);
    } finally { setBusy(false); }
  }

  const secret = { secureTextEntry: true, autoCapitalize: 'none' as const, autoCorrect: false };
  const pinProps = pin ? { keyboardType: 'number-pad' as const, maxLength: 4 } : {};
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: 14 }}>
          <View>
            <Eyebrow>{forced ? 'First sign-in' : 'Account'}</Eyebrow>
            <Text style={s.h1}>{forced ? `Set your personal ${word}` : `Change your ${word}`}</Text>
            <Text style={s.lead}>
              {forced
                ? `You signed in with a temporary ${word} from your administrator. Choose ${pin ? 'a 4-digit PIN' : 'a password'} only you know.`
                : `Choose a new ${word}. You will stay signed in on this device.`}
            </Text>
          </View>

          <Field label={forced ? `Temporary ${word}` : `Current ${word}`} value={cur} onChangeText={(v) => setCur(pin ? digits(v) : v)} {...secret} {...(pin ? { keyboardType: 'number-pad' as const } : {})} textContentType="password" />

          <View style={{ gap: 6 }}>
            <Field label={pin ? 'New 4-digit PIN' : 'New password'} value={nw} onChangeText={(v) => setNw(pin ? digits(v) : v)} {...secret} {...pinProps} textContentType="newPassword" />
            {!pin && (
              <>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  {[0, 1, 2, 3].map((i) => <View key={i} style={[s.meter, i < strength && { backgroundColor: strength < 3 ? colors.hazard : colors.ok }]} />)}
                </View>
                <Text style={s.hint}>At least 8 characters. Mixing upper case, numbers and symbols makes it stronger.</Text>
              </>
            )}
            {pin && <Text style={s.hint}>Avoid easy PINs like 1234 or your birth year.</Text>}
          </View>

          <Field label={`Repeat new ${word}`} value={rep} onChangeText={(v) => setRep(pin ? digits(v) : v)} {...secret} {...pinProps} textContentType="newPassword" />

          {error && <Text style={s.err}>{error}</Text>}

          <Button title={busy ? 'Saving…' : forced ? `Set ${word} and continue` : `Update ${word}`} onPress={submit} disabled={busy} />
        </Card>

        {forced && <Text style={s.foot}>You cannot skip this step — the temporary {word} is known to whoever issued it.</Text>}
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
