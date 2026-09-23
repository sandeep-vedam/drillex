import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../lib/api';
import { Button, Card, Eyebrow } from '../ui';
import { colors } from '../ui/theme';

type Conflict = { id: string; entity: string; entityId: string; versions: { incoming: Record<string, unknown>; submittedBy: string; deviceId: string }; createdAt: string };

export default function SyncConflictsScreen() {
  const [rows, setRows] = useState<Conflict[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { try { setRows(await api<Conflict[]>('/sync/conflicts')); setError(null); } catch (e) { setError((e as Error).message); } }, []);
  useEffect(() => { load(); }, [load]);

  async function resolve(id: string) {
    try { await api(`/sync/conflicts/${id}/resolve`, { method: 'POST' }); load(); } catch (e) { setError((e as Error).message); }
  }

  return (
    <FlatList style={{ backgroundColor: colors.canvas }} contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }} data={rows} keyExtractor={(c) => c.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      ListHeaderComponent={<View style={{ gap: 6, marginBottom: 4 }}><Eyebrow>Sync conflicts</Eyebrow><Text style={s.lead}>When two devices submit the same record offline, the first wins and the second is held here for review.</Text>{error && <Text style={{ color: colors.hazard, fontSize: 12 }}>{error}</Text>}</View>}
      ListEmptyComponent={<Card><Text style={{ color: colors.muted }}>No unresolved conflicts.</Text></Card>}
      renderItem={({ item }) => (
        <Card stripe={colors.hazard} style={{ paddingLeft: 18, gap: 6 }}>
          <Text style={s.entity}>{item.entity.replace(/([A-Z])/g, ' $1').trim()}</Text>
          <Text style={s.meta}>Rejected duplicate from <Text style={s.mono}>{item.versions.submittedBy}</Text> · device {item.versions.deviceId} · {new Date(item.createdAt).toLocaleString()}</Text>
          <ScrollView horizontal style={s.dump}><Text style={s.dumpText}>{JSON.stringify(item.versions.incoming, null, 2)}</Text></ScrollView>
          <Button title="Mark reviewed" onPress={() => resolve(item.id)} />
        </Card>
      )} />
  );
}
const s = StyleSheet.create({
  lead: { color: colors.muted, fontSize: 12 },
  entity: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: colors.muted },
  meta: { color: colors.ink, fontSize: 13, fontWeight: '600' },
  mono: { fontFamily: 'Menlo', fontWeight: '700' },
  dump: { maxHeight: 160, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line, padding: 8 },
  dumpText: { fontFamily: 'Menlo', fontSize: 11, color: colors.ink },
});
