import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../lib/api';
import type { RootStackParamList } from '../navigation';
import { Action, Button, Card, Eyebrow } from '../ui';
import { colors } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Users'>;
type U = { id: string; employeeId: string; name: string; role: string; status: string; totpEnabled: boolean; mustChangePassword: boolean; site?: { name: string } | null };
const roleTone: Record<string, string> = { ADMIN: colors.crit, MANAGER: colors.navy700, SUPERVISOR: colors.hazard, TECHNICIAN: colors.steel, OPERATOR: colors.ok };

export default function UsersScreen({ navigation }: Props) {
  const [rows, setRows] = useState<U[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { try { setRows(await api<U[]>('/users')); setError(null); } catch (e) { setError((e as Error).message); } }, []);
  useEffect(() => navigation.addListener('focus', load), [navigation, load]);

  function reset(u: U) {
    Alert.alert('Reset password?', `${u.employeeId} (${u.name}) will be signed out everywhere.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Reset', onPress: async () => {
      try { const r = await api<{ temporaryPassword: string }>(`/users/${u.id}/reset-password`, { method: 'POST' }); Alert.alert(`Temporary password for ${u.employeeId}`, `${r.temporaryPassword}\n\nShare this once, out of band. It is not shown again.`); load(); } catch (e) { setError((e as Error).message); }
    } }]);
  }
  function toggle(u: U) {
    const next = u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    Alert.alert(`${next === 'ACTIVE' ? 'Enable' : 'Disable'} ${u.employeeId}?`, u.name, [{ text: 'Cancel', style: 'cancel' }, { text: next === 'ACTIVE' ? 'Enable' : 'Disable', style: next === 'ACTIVE' ? 'default' : 'destructive', onPress: async () => {
      try { await api(`/users/${u.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: next }) }); load(); } catch (e) { setError((e as Error).message); }
    } }]);
  }

  return (
    <FlatList style={{ backgroundColor: colors.canvas }} contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }} data={rows} keyExtractor={(u) => u.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      ListHeaderComponent={<View style={{ gap: 10, marginBottom: 4 }}><Button title="+ New user" onPress={() => navigation.navigate('UserNew')} />{error && <Text style={{ color: colors.hazard, fontSize: 12 }}>{error}</Text>}<Eyebrow>User management</Eyebrow></View>}
      ListEmptyComponent={<Card><Text style={{ color: colors.muted }}>No users yet.</Text></Card>}
      renderItem={({ item }) => (
        <Card stripe={roleTone[item.role] ?? colors.steel} style={{ paddingLeft: 18, gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text style={s.id}>{item.employeeId}</Text>
              <Text style={s.name}>{item.name}{item.mustChangePassword && <Text style={s.warn}>  must change password</Text>}</Text>
            </View>
            <Text style={[s.status, { color: item.status === 'ACTIVE' ? colors.ok : colors.crit }]}>{item.status === 'ACTIVE' ? 'Active' : 'Disabled'}</Text>
          </View>
          <Text style={s.meta}>{item.role} · {item.site?.name ?? 'no site'} · 2FA {item.totpEnabled ? 'on' : 'off'}</Text>
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
            <Action title="Change role" onPress={() => navigation.navigate('UserRole', { userId: item.id, employeeId: item.employeeId, currentRole: item.role })} />
            <Action title="Reset password" onPress={() => reset(item)} />
            <Action title={item.status === 'ACTIVE' ? 'Disable' : 'Enable'} tone={item.status === 'ACTIVE' ? colors.crit : colors.ok} onPress={() => toggle(item)} />
          </View>
        </Card>
      )} />
  );
}
const s = StyleSheet.create({
  id: { fontFamily: 'Menlo', fontWeight: '700', fontSize: 14, color: colors.navy800 },
  name: { fontSize: 15, fontWeight: '600', color: colors.ink, marginTop: 2 },
  warn: { fontSize: 11, color: colors.hazard, fontWeight: '600' },
  status: { fontSize: 12, fontWeight: '700' },
  meta: { color: colors.muted, fontSize: 12, marginTop: 4 },
  link: { color: colors.navy700, fontWeight: '700', fontSize: 13 },
});
