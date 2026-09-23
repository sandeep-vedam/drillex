import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../lib/api';
import type { RootStackParamList } from '../navigation';
import { Button, Field } from '../ui';
import { Section, Segmented } from '../ui/form';
import { colors } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'UserNew'>;
type Opt = { id: string; name: string };
type RoleOpt = { key: string; name: string };

export default function UserNewScreen({ navigation }: Props) {
  const [sites, setSites] = useState<Opt[]>([]);
  const [roles, setRoles] = useState<RoleOpt[]>([]);
  const [f, setF] = useState({ employeeId: '', name: '', role: 'OPERATOR', siteId: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    api<Opt[]>('/sites').then((s) => { setSites(s); setF((x) => ({ ...x, siteId: x.siteId || s[0]?.id || '' })); }).catch(() => {});
    api<RoleOpt[]>('/roles').then((r) => { setRoles(r); setF((x) => ({ ...x, role: r.find((y) => y.key === x.role)?.key ?? r[0]?.key ?? x.role })); }).catch(() => {});
  }, []);

  function validate() {
    if (!f.employeeId.trim()) return 'Employee ID is required.';
    if (!f.name.trim()) return 'Full name is required.';
    if (f.password.length < 8) return 'Temporary password must be at least 8 characters.';
    return null;
  }

  async function submit() {
    const bad = validate();
    if (bad) { setError(bad); return; }
    setBusy(true); setError(null);
    try {
      await api('/users', { method: 'POST', body: JSON.stringify({ ...f, employeeId: f.employeeId.toUpperCase() }) });
      Alert.alert(`${f.employeeId.toUpperCase()} created`, `Temporary password: ${f.password}\n\nThey must change it on first sign-in.`, [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Section title="New user">
          <Field label="Employee ID" autoCapitalize="characters" placeholder="OPR002" value={f.employeeId} onChangeText={(v) => set('employeeId', v)} />
          <Field label="Full name" value={f.name} onChangeText={(v) => set('name', v)} />
          {roles.length > 0 && <Segmented label="Role" value={f.role} options={roles.map((r) => ({ v: r.key, l: r.name }))} onChange={(v) => set('role', v)} />}
          {sites.length > 1 && <Segmented label="Site" value={f.siteId} options={sites.map((x) => ({ v: x.id, l: x.name }))} onChange={(v) => set('siteId', v)} />}
          <Field label="Temporary password" hint="min. 8 characters" style={s.mono} value={f.password} onChangeText={(v) => set('password', v)} />
        </Section>
        {error && <Text style={s.err}>{error}</Text>}
        <Button title={busy ? 'Creating…' : 'Create user'} onPress={submit} disabled={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const s = StyleSheet.create({ mono: { fontFamily: 'Menlo' }, err: { color: colors.crit, fontSize: 13, fontWeight: '600' } });
