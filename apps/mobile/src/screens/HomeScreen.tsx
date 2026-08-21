import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable, RefreshControl } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, clearSession, loadSession } from '../lib/api';
import { cached } from '../sync/cache';
import type { RootStackParamList } from '../navigation';
import { Card, Eyebrow, Stat, StatusChip } from '../ui';
import { colors } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;
type Asset = { id: string; assetNumber: string; name: string; status: string; make: string; model: string; siteId: string; category: string };
type Summary = { readingsToday: number; pendingApprovals: number; openAlerts: number; assets: { total: number } };

export default function HomeScreen({ navigation }: Props) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [who, setWho] = useState<{ employeeId: string; role: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      const [a, sm, sess] = await Promise.all([cached('assets', () => api<Asset[]>('/assets')), cached('summary', () => api<Summary>('/dashboard/summary')), loadSession()]);
      setAssets(a.data); setSummary(sm.data); setWho(sess?.user ?? null); setError(a.fromCache ? 'Offline — showing last synced data.' : null);
      api<{ count: number }>('/notifications/unread-count').then((r) => setUnread(r.count)).catch(() => {});
    } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  async function signOut() { await clearSession(); navigation.replace('Login'); }

  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening';
  const isTech = who?.role === 'TECHNICIAN' || who?.role === 'SUPERVISOR';
  const tasks = [
    ...(isTech ? [{ key: 'maint', title: 'Maintenance services', sub: 'View assigned services · mark completed', tone: colors.hazard, onPress: () => navigation.navigate('Maintenance') }, { key: 'jc', title: 'Job cards', sub: 'Record work done on a machine', tone: colors.navy700, onPress: () => navigation.navigate('JobCards') }] : []),
    { key: 'reading', title: 'Daily machine readings', sub: summary ? (summary.readingsToday ? 'Submitted today' : 'Due today — not yet submitted') : '—', tone: summary?.readingsToday ? colors.ok : colors.hazard },
    { key: 'shift', title: 'Shift production report', sub: 'Submit at end of shift', tone: colors.navy700 },
  ];

  return (
    <FlatList
      style={{ backgroundColor: colors.canvas }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
      data={assets}
      keyExtractor={(a) => a.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <View style={s.head}>
            <View><Eyebrow>{greeting}</Eyebrow><Text style={s.h1}>{who?.employeeId ?? '—'}</Text><Text style={s.role}>{who?.role ?? ''}</Text></View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <Pressable onPress={() => navigation.navigate('Notifications')} hitSlop={10} style={s.bell}><Text style={s.bellText}>🔔 {unread ? unread : ''}</Text></Pressable>
              <Pressable onPress={signOut} hitSlop={10}><Text style={s.link}>Sign out</Text></Pressable>
            </View>
          </View>
          {error && <Text style={s.err}>{error}</Text>}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Stat label="My assets" value={assets.length} />
            <Stat label="Readings today" value={summary?.readingsToday ?? '—'} tone={summary?.readingsToday ? colors.ok : colors.hazard} />
            <Stat label="Alerts" value={summary?.openAlerts ?? '—'} tone={summary?.openAlerts ? colors.crit : colors.ok} />
          </View>
          <Eyebrow>Today</Eyebrow>
          {tasks.map((t) => (
            <Pressable key={t.key} onPress={'onPress' in t ? t.onPress : undefined} disabled={!('onPress' in t)}>
              <Card stripe={t.tone} style={{ paddingLeft: 18 }}>
                <Text style={s.taskTitle}>{t.title}{'onPress' in t ? '  →' : ''}</Text><Text style={s.taskSub}>{t.sub}</Text>
              </Card>
            </Pressable>
          ))}
          <Eyebrow>My assets</Eyebrow>
        </View>
      }
      ListEmptyComponent={!error ? <Card><Text style={{ color: colors.muted }}>No assets assigned to you yet.</Text></Card> : undefined}
      renderItem={({ item }) => (
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={s.num}>{item.assetNumber}</Text><StatusChip status={item.status} />
          </View>
          <Text style={s.name}>{item.name}</Text>
          <Text style={s.meta}>{item.make} {item.model}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <Pressable style={s.action} onPress={() => navigation.navigate('DailyReading', { assetId: item.id, assetNumber: item.assetNumber, assetName: item.name })}><Text style={s.actionText}>Daily reading</Text></Pressable>
            {item.category === 'DRILLING' && <Pressable style={[s.action, { backgroundColor: colors.hazard }]} onPress={() => navigation.navigate('ShiftReport', { assetId: item.id, assetNumber: item.assetNumber, assetName: item.name, siteId: item.siteId })}><Text style={s.actionText}>Shift report</Text></Pressable>}
          </View>
        </Card>
      )}
    />
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingTop: 8 },
  h1: { fontSize: 28, fontWeight: '800', color: colors.navy800, fontFamily: 'Menlo' },
  role: { color: colors.muted, fontSize: 12, letterSpacing: 1.2 },
  link: { color: colors.navy700, fontWeight: '600', textDecorationLine: 'underline' },
  bell: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 6 }, bellText: { fontWeight: '800', color: colors.hazard },
  err: { color: colors.crit },
  taskTitle: { fontSize: 16, fontWeight: '700', color: colors.ink }, taskSub: { color: colors.muted, fontSize: 13, marginTop: 2 },
  num: { fontFamily: 'Menlo', fontWeight: '700', color: colors.navy800, fontSize: 15 },
  name: { fontSize: 17, fontWeight: '600', color: colors.ink, marginTop: 6 }, meta: { color: colors.muted, fontSize: 13, marginTop: 2 },
  action: { flex: 1, backgroundColor: colors.navy800, paddingVertical: 10, alignItems: 'center' }, actionText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
