import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { roleDescription } from '@drillex/shared';
import { api } from '../lib/api';
import type { RootStackParamList } from '../navigation';
import type { Asset } from './AssetsScreen';
import { Button, Field } from '../ui';
import { Chips, Section } from '../ui/form';
import { colors } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'UserNew'>;
type Opt = { id: string; name: string };
type RoleOpt = { key: string; name: string };

/**
 * Add user (client spec §10.2): name, employee ID (suggested from the role), role, machines, site and contact number.
 * The server generates the temporary PIN (field roles) or password (office roles), shown once here to pass on.
 */
export default function UserNewScreen({ navigation }: Props) {
  const [sites, setSites] = useState<Opt[]>([]);
  const [roles, setRoles] = useState<RoleOpt[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [f, setF] = useState({ employeeId: '', name: '', role: 'OPERATOR', siteId: '', phone: '', assetIds: [] as string[] });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: 'employeeId' | 'name' | 'role' | 'siteId' | 'phone', v: string) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    api<Opt[]>('/sites').then((s) => { setSites(s); setF((x) => ({ ...x, siteId: x.siteId || s[0]?.id || '' })); }).catch(() => {});
    api<RoleOpt[]>('/roles').then(setRoles).catch(() => {});
    api<Asset[]>('/assets').then(setAssets).catch(() => {});
  }, []);
  useEffect(() => { api<{ employeeId: string | null }>(`/users/next-id?role=${f.role}`).then((r) => setF((x) => ({ ...x, employeeId: r.employeeId ?? '' }))).catch(() => {}); }, [f.role]);
  const toggle = (id: string) => setF((x) => ({ ...x, assetIds: x.assetIds.includes(id) ? x.assetIds.filter((a) => a !== id) : [...x.assetIds, id] }));

  async function submit() {
    if (!f.name.trim()) { setError('Full name is required.'); return; }
    setBusy(true); setError(null);
    try {
      const r = await api<{ employeeId: string; temporaryPassword: string; usesPin: boolean; expiresAt: string }>('/users', { method: 'POST', body: JSON.stringify({ ...f, employeeId: f.employeeId.trim().toUpperCase() || undefined, phone: f.phone || undefined, siteId: f.siteId || undefined }) });
      const word = r.usesPin ? 'PIN' : 'password';
      Alert.alert(`${r.employeeId} added`, `Temporary ${word}: ${r.temporaryPassword}\n\nGive it to them in person. It expires ${new Date(r.expiresAt).toLocaleString()} and they must set their own ${r.usesPin ? '4-digit PIN' : 'password'} on first sign-in. It is not shown again.`, [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Section title="New user">
          {roles.length > 0 && <Chips label="Role" value={f.role} options={roles.map((r) => ({ v: r.key, l: r.name }))} onChange={(v) => set('role', v)} />}
          {roleDescription(f.role) && <Text style={s.hint}>{roleDescription(f.role)}</Text>}
          <Field label="Employee ID" hint="suggested" autoCapitalize="characters" style={s.mono} placeholder="OPR002" value={f.employeeId} onChangeText={(v) => set('employeeId', v)} />
          <Field label="Full name" value={f.name} onChangeText={(v) => set('name', v)} />
          <Field label="Contact number" keyboardType="phone-pad" placeholder="+260 …" value={f.phone} onChangeText={(v) => set('phone', v)} />
          {sites.length > 1 && <Chips label="Site" value={f.siteId} options={sites.map((x) => ({ v: x.id, l: x.name }))} onChange={(v) => set('siteId', v)} />}
        </Section>
        <Section title={`Assigned machines (${f.assetIds.length})`}>
          <View style={s.chips}>{assets.map((a) => { const on = f.assetIds.includes(a.id); return <Pressable key={a.id} onPress={() => toggle(a.id)} style={[s.chip, on && s.chipOn]}><Text style={[s.chipText, on && { color: '#fff' }]}>{a.assetNumber}</Text></Pressable>; })}</View>
        </Section>
        <Text style={s.hint}>A temporary PIN (field roles) or password (office roles) is generated and shown once. It expires in 24 hours.</Text>
        {error && <Text style={s.err}>{error}</Text>}
        <Button title={busy ? 'Adding…' : 'Add user'} onPress={submit} disabled={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const s = StyleSheet.create({
  mono: { fontFamily: 'Menlo' }, err: { color: colors.crit, fontSize: 13, fontWeight: '600' }, hint: { color: colors.muted, fontSize: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 8 },
  chipOn: { backgroundColor: colors.navy800, borderColor: colors.navy800 },
  chipText: { fontFamily: 'Menlo', fontWeight: '700', color: colors.ink },
});
