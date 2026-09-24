import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../lib/api';
import { roleDescription } from '@drillex/shared';
import type { RootStackParamList } from '../navigation';
import { Button } from '../ui';
import { Section, Segmented } from '../ui/form';
import { colors } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'UserRole'>;
type RoleOpt = { key: string; name: string };

export default function UserRoleScreen({ navigation, route }: Props) {
  const { userId, employeeId, currentRole } = route.params;
  const [roles, setRoles] = useState<RoleOpt[]>([]);
  const [role, setRole] = useState(currentRole);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { api<RoleOpt[]>('/roles').then(setRoles).catch((e) => setError((e as Error).message)); }, []);

  async function save() {
    if (role === currentRole) return navigation.goBack();
    setBusy(true); setError(null);
    try {
      await api(`/users/${userId}/role`, { method: 'PATCH', body: JSON.stringify({ role }) });
      navigation.goBack();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48 }}>
        <Section title={`Change role — ${employeeId}`}>
          {roles.length > 0 ? (
            <>
              <Segmented label="Role" value={role} options={roles.map((r) => ({ v: r.key, l: r.name }))} onChange={setRole} />
              {roleDescription(role) && <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 8 }}>{roleDescription(role)}</Text>}
            </>
          ) : (
            <Text style={{ color: colors.muted }}>Loading roles…</Text>
          )}
        </Section>
        {error && <Text style={{ color: colors.crit, fontSize: 13, fontWeight: '600' }}>{error}</Text>}
        <Button title={busy ? 'Saving…' : 'Save'} onPress={save} disabled={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
