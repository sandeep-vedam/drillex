import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Permissions, permissionDescription, type Permission } from '@drillex/shared';
import { api } from '../lib/api';
import type { RootStackParamList } from '../navigation';
import { Button, Field } from '../ui';
import { Section, Segmented } from '../ui/form';
import { colors } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'RoleForm'>;
type Scope = 'self' | 'site' | 'all';
const SCOPES: { v: Scope; l: string }[] = [{ v: 'self', l: 'Self' }, { v: 'site', l: 'Site' }, { v: 'all', l: 'All' }];

const GROUP_LABEL: Record<string, string> = {
  user: 'User management', asset: 'Assets', shift_report: 'Shift reports', daily_reading: 'Daily readings',
  maintenance: 'Maintenance', job_card: 'Job cards', parts: 'Parts', report: 'Reports', role: 'Roles',
  notification: 'Notifications', audit: 'Audit',
};
const groups = Permissions.reduce<{ label: string; perms: Permission[] }[]>((acc, p) => {
  const label = GROUP_LABEL[p.split(':')[0]] ?? 'Other';
  const g = acc.find((x) => x.label === label);
  if (g) g.perms.push(p); else acc.push({ label, perms: [p] });
  return acc;
}, []);

export default function RoleFormScreen({ navigation, route }: Props) {
  const role = route.params?.role;
  const [name, setName] = useState(role?.name ?? '');
  const [grants, setGrants] = useState<Partial<Record<Permission, Scope>>>(() => {
    const init: Partial<Record<Permission, Scope>> = {};
    for (const g of role?.permissions ?? []) init[g.permission as Permission] = g.scope as Scope;
    return init;
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggle(p: Permission) {
    setGrants((g) => { const next = { ...g }; if (next[p]) delete next[p]; else next[p] = 'site'; return next; });
  }
  function setScope(p: Permission, scope: Scope) { setGrants((g) => ({ ...g, [p]: scope })); }

  async function submit() {
    if (!name.trim()) { setError('Give the role a name.'); return; }
    setBusy(true); setError(null);
    const permissions = (Object.entries(grants) as [Permission, Scope][]).map(([permission, scope]) => ({ permission, scope }));
    try {
      if (role) await api(`/roles/${role.id}`, { method: 'PATCH', body: JSON.stringify({ name, permissions }) });
      else await api('/roles', { method: 'POST', body: JSON.stringify({ name, permissions }) });
      Alert.alert(role ? 'Role updated' : 'Role created', name, [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Text style={s.lead}>{role ? <>Key <Text style={s.mono}>{role.key}</Text> never changes — only the name and grants below do.</> : <>A stable key is generated from the name automatically.</>}</Text>
        <Field label="Role name" placeholder="Site Coordinator" value={name} onChangeText={setName} />
        {groups.map((g) => (
          <Section key={g.label} title={g.label}>
            <View style={s.list}>
              {g.perms.map((p) => {
                const scope = grants[p];
                return (
                  <View key={p} style={s.row}>
                    <Pressable onPress={() => toggle(p)} style={s.rowTop}>
                      <View style={[s.box, !!scope && { backgroundColor: colors.navy800, borderColor: colors.navy800 }]}>{!!scope && <Text style={s.tick}>✓</Text>}</View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.perm}>{p}</Text>
                        <Text style={s.permDesc}>{permissionDescription(p)}</Text>
                      </View>
                    </Pressable>
                    {scope && <View style={{ marginTop: 8 }}><Segmented label="Scope" value={scope} options={SCOPES} onChange={(v) => setScope(p, v)} /></View>}
                  </View>
                );
              })}
            </View>
          </Section>
        ))}
        {error && <Text style={s.err}>{error}</Text>}
        <Button title={busy ? 'Saving…' : role ? 'Save changes' : 'Create role'} onPress={submit} disabled={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const s = StyleSheet.create({
  lead: { color: colors.muted, fontSize: 13 },
  permDesc: { color: colors.muted, fontSize: 12, lineHeight: 16, marginTop: 2 },
  mono: { fontFamily: 'Menlo', color: colors.ink },
  list: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  row: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  box: { width: 20, height: 20, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  tick: { color: '#fff', fontSize: 13, fontWeight: '800', lineHeight: 16 },
  perm: { fontFamily: 'Menlo', fontSize: 13, color: colors.ink, flex: 1 },
  err: { color: colors.crit, fontSize: 13, fontWeight: '600' },
});
