import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../lib/api';
import { cached } from '../sync/cache';
import { Card, Eyebrow } from '../ui';
import { colors } from '../ui/theme';

type Sched = { id: string; description: string; serviceType: string; status: string; nextDueAt?: string; nextDueHours?: string; hoursRemaining: number | null; currentHours: number | null; estDowntimeHours?: string; notes?: string; asset: { assetNumber: string; name: string } };
const TONE: Record<string, string> = { OVERDUE: colors.crit, DUE_NOW: colors.hazard, UPCOMING: colors.navy700, COMPLETED: colors.ok };
const LABEL: Record<string, string> = { OVERDUE: 'OVERDUE', DUE_NOW: 'DUE NOW', UPCOMING: 'Upcoming', COMPLETED: 'Completed' };

export default function MaintenanceScreen() {
  const [rows, setRows] = useState<Sched[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hm, setHm] = useState<Record<string, string>>({});
  const load = useCallback(async () => { try { const r = await cached('maint', () => api<Sched[]>('/maintenance/schedules?mine=1')); setRows(r.data.filter((x) => x.status !== 'COMPLETED')); setError(r.fromCache ? 'Offline — showing last synced list.' : null); } catch (e) { setError((e as Error).message); } }, []);
  useEffect(() => { load(); }, [load]);

  async function complete(s: Sched) {
    const hours = hm[s.id] ? Number(hm[s.id]) : undefined;
    Alert.alert('Mark completed?', `${s.asset.assetNumber} · ${s.description}${hours != null ? ` at ${hours} h` : ''}`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Complete', onPress: async () => { try { await api(`/maintenance/schedules/${s.id}/complete`, { method: 'POST', body: JSON.stringify({ hourMeter: hours }) }); load(); } catch (e) { setError((e as Error).message); } } }]);
  }

  return (
    <FlatList style={{ backgroundColor: colors.canvas }} contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }} data={rows} keyExtractor={(s) => s.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      ListHeaderComponent={<View style={{ gap: 6, marginBottom: 4 }}><Eyebrow>My assigned services</Eyebrow>{error && <Text style={{ color: colors.hazard, fontSize: 12 }}>{error}</Text>}</View>}
      ListEmptyComponent={<Card><Text style={{ color: colors.muted }}>No services assigned to you.</Text></Card>}
      renderItem={({ item }) => (
        <Card stripe={TONE[item.status]} style={{ paddingLeft: 18, gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={s.num}>{item.asset.assetNumber} <Text style={{ fontFamily: undefined, color: colors.muted, fontWeight: '400' }}>{item.asset.name}</Text></Text><Text style={[s.badge, { color: TONE[item.status] }]}>{LABEL[item.status]}</Text></View>
          <Text style={s.title}>{item.description}</Text>
          <Text style={s.meta}>{item.nextDueAt ? `Due ${new Date(item.nextDueAt).toLocaleDateString()}` : ''}{item.nextDueHours != null ? `${item.nextDueAt ? ' · ' : ''}at ${Number(item.nextDueHours)} h${item.hoursRemaining != null ? ` (${item.hoursRemaining < 0 ? `${Math.abs(item.hoursRemaining)} h over` : `${item.hoursRemaining} h left`})` : ''}` : ''}{item.estDowntimeHours ? ` · est. ${Number(item.estDowntimeHours)} h downtime` : ''}</Text>
          {item.notes ? <Text style={[s.meta, { fontStyle: 'italic' }]}>{item.notes.split('\n').slice(-1)[0]}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, alignItems: 'center' }}>
            <TextInput style={s.hm} keyboardType="decimal-pad" placeholder={item.currentHours != null ? `${item.currentHours} h` : 'Hour meter'} placeholderTextColor="#9AA6B3" value={hm[item.id] ?? ''} onChangeText={(v) => setHm((x) => ({ ...x, [item.id]: v }))} />
            <Pressable style={s.btn} onPress={() => complete(item)}><Text style={s.btnText}>Mark completed</Text></Pressable>
          </View>
        </Card>
      )} />
  );
}
const s = StyleSheet.create({ num: { fontFamily: 'Menlo', fontWeight: '700', color: colors.navy800 }, badge: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 }, title: { fontSize: 16, fontWeight: '700', color: colors.ink }, meta: { color: colors.muted, fontSize: 12 }, hm: { flex: 1, borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 9, color: colors.ink }, btn: { backgroundColor: colors.navy800, paddingHorizontal: 14, paddingVertical: 11 }, btnText: { color: '#fff', fontWeight: '700', fontSize: 13 } });
