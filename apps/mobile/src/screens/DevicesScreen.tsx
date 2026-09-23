import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { api } from '../lib/api';
import { Card, Eyebrow } from '../ui';
import { colors } from '../ui/theme';

type D = { id: string; deviceId: string; platform?: string; approved: boolean; lastSeen: string; pushToken?: string; user: { employeeId: string; name: string; role: string } };

export default function DevicesScreen() {
  const [rows, setRows] = useState<D[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { try { setRows(await api<D[]>('/devices')); setError(null); } catch (e) { setError((e as Error).message); } }, []);
  useEffect(() => { load(); }, [load]);

  function setApproved(d: D, approved: boolean) {
    if (!approved) {
      Alert.alert('Revoke device?', `${d.user.employeeId}'s device ${d.deviceId} will be signed out.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Revoke', style: 'destructive', onPress: () => apply(d, approved) }]);
    } else apply(d, approved);
  }
  async function apply(d: D, approved: boolean) {
    try { await api(`/devices/${d.id}`, { method: 'PATCH', body: JSON.stringify({ approved }) }); load(); } catch (e) { setError((e as Error).message); }
  }

  return (
    <FlatList style={{ backgroundColor: colors.canvas }} contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }} data={rows} keyExtractor={(d) => d.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      ListHeaderComponent={<View style={{ gap: 6, marginBottom: 4 }}><Eyebrow>Devices</Eyebrow><Text style={s.lead}>Every sign-in registers a device. Revoking one signs it out remotely.</Text>{error && <Text style={{ color: colors.hazard, fontSize: 12 }}>{error}</Text>}</View>}
      ListEmptyComponent={<Card><Text style={{ color: colors.muted }}>No devices yet.</Text></Card>}
      renderItem={({ item }) => (
        <Card stripe={item.approved ? colors.ok : colors.crit} style={{ paddingLeft: 18, gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text style={s.id}>{item.user.employeeId} <Text style={s.name}>{item.user.name}</Text></Text>
              <Text style={s.device}>{item.deviceId}</Text>
            </View>
            <Text style={[s.status, { color: item.approved ? colors.ok : colors.crit }]}>{item.approved ? 'Approved' : 'Blocked'}</Text>
          </View>
          <Text style={s.meta}>{item.platform ?? 'unknown platform'} · push {item.pushToken ? 'registered' : 'none'} · last seen {new Date(item.lastSeen).toLocaleString()}</Text>
          <Text style={[s.link, { color: item.approved ? colors.crit : colors.navy700, marginTop: 8 }]} onPress={() => setApproved(item, !item.approved)}>{item.approved ? 'Revoke' : 'Approve'}</Text>
        </Card>
      )} />
  );
}
const s = StyleSheet.create({
  id: { fontFamily: 'Menlo', fontWeight: '700', fontSize: 14, color: colors.navy800 },
  name: { fontFamily: undefined, color: colors.muted, fontWeight: '400', fontSize: 13 },
  device: { fontFamily: 'Menlo', fontSize: 12, color: colors.muted, marginTop: 2 },
  status: { fontSize: 12, fontWeight: '700' },
  meta: { color: colors.muted, fontSize: 12, marginTop: 4 },
  link: { fontWeight: '700', fontSize: 13 },
  lead: { color: colors.muted, fontSize: 12 },
});
