import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TextInput, RefreshControl } from 'react-native';
import { api } from '../lib/api';
import { cached } from '../sync/cache';
import { Card, Eyebrow } from '../ui';
import { colors } from '../ui/theme';

type Part = { id: string; partNo: string; name: string; qtyOnHand: number; minQty: number; unitCost?: string };

/** Parts lookup for technicians in the field (PRD persona: job card list, parts lookup, maintenance due list). */
export default function PartsScreen() {
  const [parts, setParts] = useState<Part[]>([]);
  const [q, setQ] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Cached so the store is still searchable underground; the whole list is small enough to hold offline.
  const load = useCallback(async () => {
    try {
      const r = await cached('parts', () => api<Part[]>('/parts'));
      setParts(r.data);
      setNote(r.fromCache ? 'Offline — showing the last synced stock levels.' : null);
    } catch (e) { setNote((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const term = q.trim().toLowerCase();
  const rows = term ? parts.filter((p) => `${p.partNo} ${p.name}`.toLowerCase().includes(term)) : parts;
  const low = (p: Part) => p.qtyOnHand <= p.minQty;

  return (
    <FlatList
      style={{ backgroundColor: colors.canvas }}
      contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
      data={rows}
      keyExtractor={(p) => p.id}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <TextInput
            style={s.search}
            placeholder="Search part number or name…"
            placeholderTextColor="#9AA6B3"
            value={q}
            onChangeText={setQ}
            autoCorrect={false}
          />
          {note && <Text style={s.note}>{note}</Text>}
          <Eyebrow>{rows.length} of {parts.length} parts</Eyebrow>
        </View>
      }
      ListEmptyComponent={<Card><Text style={{ color: colors.muted }}>{parts.length ? 'No parts match that search.' : 'No parts in the store yet.'}</Text></Card>}
      renderItem={({ item }) => (
        <Card stripe={low(item) ? colors.crit : colors.ok}>
          <View style={s.row}>
            <Text style={s.partNo}>{item.partNo}</Text>
            <Text style={[s.qty, low(item) && { color: colors.crit }]}>{item.qtyOnHand} in stock</Text>
          </View>
          <Text style={s.name}>{item.name}</Text>
          <Text style={s.meta}>
            Minimum {item.minQty}{item.unitCost ? ` · ${item.unitCost} each` : ''}
            {low(item) ? '  ·  LOW STOCK' : ''}
          </Text>
        </Card>
      )}
    />
  );
}

const s = StyleSheet.create({
  search: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.ink },
  note: { color: colors.hazard, fontSize: 13 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  partNo: { fontFamily: 'Menlo', fontWeight: '700', color: colors.navy800, fontSize: 15 },
  qty: { fontSize: 14, fontWeight: '700', color: colors.ok },
  name: { fontSize: 16, fontWeight: '600', color: colors.ink, marginTop: 6 },
  meta: { color: colors.muted, fontSize: 13, marginTop: 4 },
});
