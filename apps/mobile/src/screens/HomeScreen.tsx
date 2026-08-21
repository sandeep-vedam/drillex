import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable, RefreshControl } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, clearSession, loadSession } from '../lib/api';
import type { RootStackParamList } from '../navigation';
import { Card, Eyebrow, Stat, StatusChip } from '../ui';
import { colors } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;
type Asset = { id: string; assetNumber: string; name: string; status: string; make: string; model: string };
type Summary = { readingsToday: number; pendingApprovals: number; openAlerts: number; assets: { total: number } };

export default function HomeScreen({ navigation }: Props) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [who, setWho] = useState<{ employeeId: string; role: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [a, sm, sess] = await Promise.all([api<Asset[]>('/assets'), api<Summary>('/dashboard/summary'), loadSession()]);
      setAssets(a); setSummary(sm); setWho(sess?.user ?? null); setError(null);
    } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  async function signOut() { await clearSession(); navigation.replace('Login'); }

  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening';
  const tasks = [
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
            <Pressable onPress={signOut} hitSlop={10}><Text style={s.link}>Sign out</Text></Pressable>
          </View>
          {error && <Text style={s.err}>{error}</Text>}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Stat label="My assets" value={assets.length} />
            <Stat label="Readings today" value={summary?.readingsToday ?? '—'} tone={summary?.readingsToday ? colors.ok : colors.hazard} />
            <Stat label="Alerts" value={summary?.openAlerts ?? '—'} tone={summary?.openAlerts ? colors.crit : colors.ok} />
          </View>
          <Eyebrow>Today</Eyebrow>
          {tasks.map((t) => (
            <Card key={t.key} stripe={t.tone} style={{ paddingLeft: 18 }}>
              <Text style={s.taskTitle}>{t.title}</Text><Text style={s.taskSub}>{t.sub}</Text>
            </Card>
          ))}
          <Eyebrow>My assets</Eyebrow>
        </View>
      }
      ListEmptyComponent={!error ? <Card><Text style={{ color: colors.muted }}>No assets assigned to you yet.</Text></Card> : undefined}
      renderItem={({ item }) => (
        <Pressable onPress={() => navigation.navigate('DailyReading', { assetId: item.id, assetNumber: item.assetNumber, assetName: item.name })}>
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={s.num}>{item.assetNumber}</Text><StatusChip status={item.status} />
          </View>
          <Text style={s.name}>{item.name}</Text>
          <Text style={s.meta}>{item.make} {item.model}</Text>
          <Text style={s.cta}>Submit daily reading →</Text>
        </Card>
        </Pressable>
      )}
    />
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingTop: 8 },
  h1: { fontSize: 28, fontWeight: '800', color: colors.navy800, fontFamily: 'Menlo' },
  role: { color: colors.muted, fontSize: 12, letterSpacing: 1.2 },
  link: { color: colors.navy700, fontWeight: '600', textDecorationLine: 'underline', marginTop: 8 },
  err: { color: colors.crit },
  taskTitle: { fontSize: 16, fontWeight: '700', color: colors.ink }, taskSub: { color: colors.muted, fontSize: 13, marginTop: 2 },
  num: { fontFamily: 'Menlo', fontWeight: '700', color: colors.navy800, fontSize: 15 },
  name: { fontSize: 17, fontWeight: '600', color: colors.ink, marginTop: 6 }, meta: { color: colors.muted, fontSize: 13, marginTop: 2 },
  cta: { color: colors.navy700, fontWeight: '700', fontSize: 13, marginTop: 10 },
});
