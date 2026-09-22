import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable, RefreshControl } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../lib/api';
import { cached } from '../sync/cache';
import type { RootStackParamList } from '../navigation';
import { Card, Eyebrow, StatusChip } from '../ui';
import { colors } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'History'>;
type Asset = { assetNumber: string; name: string };
type Reading = { id: string; date: string; hourMeter: string; fuelConsumed: string; conditionRating: number; warningLights: boolean; leaks: boolean; unusualNoises: boolean; asset: Asset; user: { employeeId: string } };
type Shift = { id: string; date: string; shift: string; holeRef: string; totalMeters: string; holesCompleted: number; status: string; asset: Asset; user: { employeeId: string } };

const fmtDate = (d: string) => new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
const TABS = [['readings', 'Machine readings'], ['shifts', 'Drilled production']] as const;

export default function HistoryScreen({}: Props) {
  const [tab, setTab] = useState<'readings' | 'shifts'>('readings');
  const [readings, setReadings] = useState<Reading[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // The API scopes both lists to the machines this operator is assigned to, so no filtering is needed here.
  const load = useCallback(async () => {
    try {
      const [r, s] = await Promise.all([
        cached('history.readings', () => api<Reading[]>('/daily-readings')),
        cached('history.shifts', () => api<Shift[]>('/shift-reports')),
      ]);
      setReadings(r.data); setShifts(s.data);
      setNote(r.fromCache || s.fromCache ? 'Offline — showing the last synced history.' : null);
    } catch (e) { setNote((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows: (Reading | Shift)[] = tab === 'readings' ? readings : shifts;
  return (
    <FlatList
      style={{ backgroundColor: colors.canvas }}
      contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
      data={rows}
      keyExtractor={(x) => x.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <View style={s.tabs}>
            {TABS.map(([key, label]) => (
              <Pressable key={key} onPress={() => setTab(key)} style={[s.tab, tab === key && s.tabOn]}>
                <Text style={[s.tabText, tab === key && s.tabTextOn]}>{label} {key === 'readings' ? readings.length : shifts.length}</Text>
              </Pressable>
            ))}
          </View>
          {note && <Text style={s.note}>{note}</Text>}
          <Eyebrow>Submitted</Eyebrow>
        </View>
      }
      ListEmptyComponent={<Card><Text style={{ color: colors.muted }}>Nothing submitted yet. Anything still waiting to sync is in the sync queue.</Text></Card>}
      renderItem={({ item }) => tab === 'readings' ? <ReadingRow r={item as Reading} /> : <ShiftRow r={item as Shift} />}
    />
  );
}

function ReadingRow({ r }: { r: Reading }) {
  const flags = [r.warningLights && 'Warning lights', r.leaks && 'Leaks', r.unusualNoises && 'Unusual noises'].filter(Boolean) as string[];
  return (
    <Card stripe={flags.length || r.conditionRating <= 2 ? colors.crit : colors.ok}>
      <View style={s.rowTop}><Text style={s.num}>{r.asset?.assetNumber}</Text><Text style={s.date}>{fmtDate(r.date)}</Text></View>
      <Text style={s.name}>{r.asset?.name}</Text>
      <Text style={s.meta}>Hour meter {r.hourMeter} · Fuel used {r.fuelConsumed} · Condition {r.conditionRating}/5</Text>
      {flags.length > 0 && <Text style={s.flags}>{flags.join(' · ')}</Text>}
      <Text style={s.by}>Submitted by {r.user?.employeeId}</Text>
    </Card>
  );
}

function ShiftRow({ r }: { r: Shift }) {
  return (
    <Card stripe={colors.navy700}>
      <View style={s.rowTop}><Text style={s.num}>{r.asset?.assetNumber}</Text><StatusChip status={r.status} /></View>
      <Text style={s.name}>{r.asset?.name}</Text>
      <Text style={s.meta}>{fmtDate(r.date)} · {r.shift === 'DAY' ? 'Day' : 'Night'} shift · Hole {r.holeRef}</Text>
      <Text style={s.meters}>{r.totalMeters} m drilled · {r.holesCompleted} holes</Text>
      <Text style={s.by}>Submitted by {r.user?.employeeId}</Text>
    </Card>
  );
}

const s = StyleSheet.create({
  tabs: { flexDirection: 'row', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabOn: { backgroundColor: colors.navy800 },
  tabText: { fontSize: 13, fontWeight: '700', color: colors.muted },
  tabTextOn: { color: '#fff' },
  note: { color: colors.hazard, fontSize: 13 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  num: { fontFamily: 'Menlo', fontWeight: '700', color: colors.navy800, fontSize: 15 },
  date: { color: colors.muted, fontSize: 13 },
  name: { fontSize: 16, fontWeight: '600', color: colors.ink, marginTop: 4 },
  meta: { color: colors.muted, fontSize: 13, marginTop: 4 },
  meters: { color: colors.ink, fontSize: 14, fontWeight: '700', marginTop: 4 },
  flags: { color: colors.crit, fontSize: 13, fontWeight: '700', marginTop: 4 },
  by: { color: colors.muted, fontSize: 12, marginTop: 6 },
});
