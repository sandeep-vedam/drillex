import React, { useCallback, useEffect, useState } from 'react';
import { Clipboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, getDeviceId, saveSession, type Session } from '../lib/api';
import type { RootStackParamList } from '../navigation';
import { Button, Card, Eyebrow, Field } from '../ui';
import { colors } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'TwoFaEnrol'>;

/**
 * Two-factor enrolment, so a role that requires it can be set up from the handset rather than being
 * sent to the web portal. Both endpoints are pre-auth (the user cannot sign in until enrolled), so the
 * employee ID and password are carried through from the login attempt and never stored.
 *
 * The secret is shown for manual entry rather than as a QR code: the app has no SVG or QR dependency,
 * and every authenticator app accepts a typed key.
 */
export default function TwoFaEnrolScreen({ navigation, route }: Props) {
  const { employeeId, password } = route.params;
  const [secret, setSecret] = useState<string | null>(null);
  const [totp, setTotp] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setup = useCallback(async () => {
    setError(null);
    try {
      const r = await api<{ otpauth: string; secret: string }>('/auth/2fa/setup', {
        method: 'POST', body: JSON.stringify({ employeeId, password }),
      });
      setSecret(r.secret);
    } catch (e) {
      const m = (e as Error).message;
      setError(m === 'Unauthorized' ? 'That employee ID or password was not accepted.' : m);
    }
  }, [employeeId, password]);
  useEffect(() => { setup(); }, [setup]);

  async function enable() {
    if (totp.trim().length !== 6) { setError('Enter the six-digit code from your authenticator app.'); return; }
    setBusy(true); setError(null);
    try {
      const deviceId = await getDeviceId();
      const res = await api<Session>('/auth/2fa/enable', {
        method: 'POST',
        body: JSON.stringify({ employeeId, password, totp: totp.trim(), deviceId }),
      });
      await saveSession(res);
      if (res.user?.mustChangePassword) { navigation.replace('ChangePassword', { forced: true }); return; }
      navigation.replace('Home');
    } catch (e) {
      const m = (e as Error).message;
      setError(m === 'Unauthorized' ? 'That code was not accepted. Codes change every 30 seconds — try the current one.' : m);
    } finally { setBusy(false); }
  }

  /** Clipboard is a deprecated RN core API; if it has gone, the key is still selectable by long-press. */
  function copySecret() {
    if (!secret) return;
    try {
      Clipboard?.setString?.(secret);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: 12 }}>
          <View>
            <Eyebrow>Extra security</Eyebrow>
            <Text style={s.h1}>Set up your sign-in code</Text>
            <Text style={s.lead}>
              Your role requires a six-digit code in addition to your password. Add the key below to an
              authenticator app — Google Authenticator, Microsoft Authenticator and 1Password all work.
            </Text>
          </View>

          <View style={{ gap: 6 }}>
            <Text style={s.label}>Step 1 — add this key to your authenticator app</Text>
            {secret ? (
              <>
                <Pressable onPress={copySecret}>
                  <View style={s.secretBox}>
                    <Text style={s.secret} selectable>{secret.replace(/(.{4})/g, '$1 ').trim()}</Text>
                  </View>
                </Pressable>
                <Text style={s.hint}>{copied ? 'Copied to the clipboard.' : 'Tap to copy, or long-press to select. Enter it as an account named Drillex Ops.'}</Text>
              </>
            ) : (
              <Text style={s.hint}>{error ? 'Could not start enrolment.' : 'Preparing your key…'}</Text>
            )}
          </View>

          <View style={{ gap: 6 }}>
            <Text style={s.label}>Step 2 — type the code it shows</Text>
            <Field
              label="Six-digit code"
              value={totp}
              onChangeText={(v: string) => setTotp(v.replace(/[^0-9]/g, '').slice(0, 6))}
              keyboardType="number-pad"
              autoCorrect={false}
              maxLength={6}
            />
            <Text style={s.hint}>The code changes every 30 seconds. If it is rejected, wait for the next one.</Text>
          </View>

          {error && <Text style={s.err}>{error}</Text>}

          <Button title={busy ? 'Checking…' : 'Turn on and sign in'} onPress={enable} disabled={busy || !secret} />
          <Button title="Back to sign in" variant="ghost" onPress={() => navigation.replace('Login')} />
        </Card>

        <Text style={s.foot}>Keep the key private — anyone holding it can generate your codes.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  h1: { fontSize: 24, fontWeight: '700', color: colors.navy800, marginTop: 4, letterSpacing: 0.2 },
  lead: { color: colors.muted, fontSize: 14, marginTop: 6, lineHeight: 20 },
  label: { fontSize: 13, fontWeight: '600', color: colors.ink },
  secretBox: { borderWidth: 1, borderColor: colors.navy700, backgroundColor: colors.navy100, padding: 14, alignItems: 'center' },
  secret: { fontFamily: 'Menlo', fontSize: 16, fontWeight: '700', color: colors.navy900, letterSpacing: 1.2 },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 16 },
  err: { color: colors.crit, fontSize: 13, fontWeight: '600', borderLeftWidth: 2, borderLeftColor: colors.crit, paddingLeft: 10 },
  foot: { color: colors.muted, fontSize: 12, textAlign: 'center', lineHeight: 17 },
});
