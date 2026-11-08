import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../lib/api';
import type { RootStackParamList } from '../navigation';
import { Action, Button, Card, Eyebrow } from '../ui';
import { colors } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Users'>;
type U = { id: string; employeeId: string; name: string; role: string; status: 'ACTIVE' | 'DISABLED' | 'BLOCKED' | 'SUSPENDED'; statusReason: string | null; usesPin: boolean; phone: string | null; machines: { assetNumber: string }[]; totpEnabled: boolean; mustChangePassword: boolean; site?: { name: string } | null };
const STATUS: Record<U['status'], { label: string; color: string }> = { ACTIVE: { label: 'Active', color: colors.ok }, BLOCKED: { label: 'Blocked', color: colors.crit }, SUSPENDED: { label: 'Suspended', color: colors.hazard }, DISABLED: { label: 'Deactivated', color: colors.muted } };
const roleTone: Record<string, string> = { ADMIN: colors.crit, MANAGER: colors.navy700, SUPERVISOR: colors.hazard, TECHNICIAN: colors.steel, OPERATOR: colors.ok };

export default function UsersScreen({ navigation }: Props) {
  const [rows, setRows] = useState<U[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { try { setRows(await api<U[]>('/users')); setError(null); } catch (e) { setError((e as Error).message); } }, []);
  useEffect(() => navigation.addListener('focus', load), [navigation, load]);

  function reset(u: U) {
    const word = u.usesPin ? 'PIN' : 'password';
    Alert.alert(`Reset ${word}?`, `${u.employeeId} (${u.name}) gets a new temporary ${word} and is signed out everywhere.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Reset', onPress: async () => {
      try { const r = await api<{ temporaryPassword: string; expiresAt: string }>(`/users/${u.id}/reset-password`, { method: 'POST' }); Alert.alert(`Temporary ${word} for ${u.employeeId}`, `${r.temporaryPassword}\n\nGive it to them in person. It expires ${new Date(r.expiresAt).toLocaleString()} and is not shown again.`); load(); } catch (e) { setError((e as Error).message); }
    } }]);
  }
  const setStatus = async (u: U, status: U['status'], reason?: string) => {
    try { await api(`/users/${u.id}/status`, { method: 'PATCH', body: JSON.stringify({ status, reason }) }); load(); } catch (e) { setError((e as Error).message); }
  };
  /** Block a leaver (client spec §10.3): immediate, with a reason; their records stay for audit. */
  function block(u: U) {
    Alert.alert(`Block ${u.employeeId}?`, `${u.name} is signed out on every device now and cannot sign in again. Choose the reason:`, [
      ...['Resigned', 'Terminated', 'Contract ended'].map((reason) => ({ text: reason, style: 'destructive' as const, onPress: () => setStatus(u, 'BLOCKED', reason) })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }
  function restore(u: U) {
    const verb = u.status === 'SUSPENDED' ? 'Unlock' : u.status === 'BLOCKED' ? 'Unblock' : 'Reactivate';
    Alert.alert(`${verb} ${u.employeeId}?`, u.statusReason ?? u.name, [{ text: 'Cancel', style: 'cancel' }, { text: verb, onPress: () => setStatus(u, 'ACTIVE') }]);
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
              <Text style={s.name}>{item.name}{item.mustChangePassword && <Text style={s.warn}>  temporary credential issued</Text>}</Text>
            </View>
            <Text style={[s.status, { color: STATUS[item.status].color }]}>{STATUS[item.status].label}</Text>
          </View>
          {item.status !== 'ACTIVE' && item.statusReason && <Text style={[s.meta, { color: STATUS[item.status].color }]}>{item.statusReason}</Text>}
          <Text style={s.meta}>{item.role} · {item.site?.name ?? 'no site'} · {item.usesPin ? 'PIN' : 'password'}{item.totpEnabled ? ' · 2FA on' : ''}{item.phone ? ` · ${item.phone}` : ''}</Text>
          {item.machines.length > 0 && <Text style={s.meta}>Machines: {item.machines.map((m) => m.assetNumber).join(', ')}</Text>}
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
            <Action title="Change role" onPress={() => navigation.navigate('UserRole', { userId: item.id, employeeId: item.employeeId, currentRole: item.role })} />
            <Action title={`Reset ${item.usesPin ? 'PIN' : 'password'}`} onPress={() => reset(item)} />
            {item.status === 'ACTIVE'
              ? <Action title="Block" tone={colors.crit} onPress={() => block(item)} />
              : <Action title={item.status === 'SUSPENDED' ? 'Unlock' : item.status === 'BLOCKED' ? 'Unblock' : 'Reactivate'} tone={colors.ok} onPress={() => restore(item)} />}
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
