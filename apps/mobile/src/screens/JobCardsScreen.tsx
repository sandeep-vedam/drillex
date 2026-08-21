import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../lib/api';
import { cached } from '../sync/cache';
import { Button, Card, Eyebrow } from '../ui';
import { colors } from '../ui/theme';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'JobCards'>;
type JC = { id: string; jobNo: string; date: string; jobType: string; workPerformed: string; status: string; approvedAt?: string; labourHours?: string; asset: { assetNumber: string; name: string }; parts: { quantity: number }[] };
const TONE: Record<string, string> = { OPEN: colors.navy700, IN_PROGRESS: colors.hazard, AWAITING_PARTS: colors.warn, COMPLETED: colors.ok };
const TYPE: Record<string, string> = { SCHEDULED_SERVICE: 'Scheduled service', BREAKDOWN_REPAIR: 'Breakdown repair', MODIFICATION: 'Modification', INSPECTION: 'Inspection' };

export default function JobCardsScreen({ navigation }: Props) {
  const [rows, setRows] = useState<JC[]>([]); const [refreshing, setRefreshing] = useState(false); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { try { const r = await cached('jobcards', () => api<JC[]>('/job-cards')); setRows(r.data); setError(r.fromCache ? 'Offline — showing last synced list.' : null); } catch (e) { setError((e as Error).message); } }, []);
  useEffect(() => { const u = navigation.addListener('focus', load); return u; }, [navigation, load]);
  return (
    <FlatList style={{ backgroundColor: colors.canvas }} contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }} data={rows} keyExtractor={(r) => r.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      ListHeaderComponent={<View style={{ gap: 10, marginBottom: 4 }}><Button title="+ New job card" onPress={() => navigation.navigate('JobCardNew', {})} />{error && <Text style={{ color: colors.hazard, fontSize: 12 }}>{error}</Text>}<Eyebrow>My job cards</Eyebrow></View>}
      ListEmptyComponent={<Card><Text style={{ color: colors.muted }}>No job cards yet.</Text></Card>}
      renderItem={({ item }) => (
        <Card stripe={TONE[item.status]} style={{ paddingLeft: 18, gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={s.num}>{item.jobNo}</Text><Text style={[s.badge, { color: item.approvedAt ? colors.ok : TONE[item.status] }]}>{item.approvedAt ? 'APPROVED' : item.status.replace('_', ' ')}</Text></View>
          <Text style={s.asset}>{item.asset.assetNumber} <Text style={{ color: colors.muted, fontWeight: '400' }}>{item.asset.name} · {TYPE[item.jobType]}</Text></Text>
          <Text numberOfLines={2} style={s.work}>{item.workPerformed}</Text>
          <Text style={s.meta}>{new Date(item.date).toLocaleDateString()}{item.labourHours ? ` · ${Number(item.labourHours)} h labour` : ''}{item.parts.length ? ` · ${item.parts.length} part line(s)` : ''}</Text>
        </Card>
      )} />
  );
}
const s = StyleSheet.create({ num: { fontFamily: 'Menlo', fontWeight: '800', color: colors.navy800 }, badge: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 }, asset: { fontFamily: 'Menlo', fontWeight: '700', color: colors.ink, fontSize: 13 }, work: { color: colors.ink, fontSize: 14 }, meta: { color: colors.muted, fontSize: 12 } });
