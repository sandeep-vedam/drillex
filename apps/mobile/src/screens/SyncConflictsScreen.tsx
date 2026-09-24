import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { api } from '../lib/api';
import { describeSubmission } from '@drillex/shared';
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
          <View style={s.fields}>
            {describeSubmission(item.versions.incoming).map((f) => (
              <View key={f.key} style={s.row}>
                <Text style={s.fieldLabel}>{f.label}</Text>
                <Text style={[s.fieldValue, f.tone === 'crit' && s.crit, f.tone === 'warn' && s.warn]}>{f.value}</Text>
              </View>
            ))}
          </View>
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
  fields: { borderTopWidth: 1, borderTopColor: colors.line, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.line },
  fieldLabel: { color: colors.muted, fontSize: 12, flexShrink: 0 },
  fieldValue: { color: colors.ink, fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  warn: { color: colors.hazard },
  crit: { color: colors.crit },
});
