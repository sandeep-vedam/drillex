import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { api } from '../lib/api';
import { cached } from '../sync/cache';
import { Card, Eyebrow } from '../ui';
import { colors } from '../ui/theme';

type R = { id: string; title: string; periodStart: string; periodEnd: string; generatedAt: string; pdfUrl?: string; xlsxUrl?: string };
/** Report archive on mobile: view / share the generated PDF or Excel (SRS §8.1). */
export default function ReportsScreen() {
  const [rows, setRows] = useState<R[]>([]); const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => { try { const r = await cached('reports', () => api<R[]>('/reports')); setRows(r.data); } catch {} }, []);
  useEffect(() => { load(); }, [load]);
  return (
    <FlatList style={{ backgroundColor: colors.canvas }} contentContainerStyle={{ padding: 16, gap: 10 }} data={rows} keyExtractor={(r) => r.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      ListHeaderComponent={<Eyebrow>Monthly & custom reports</Eyebrow>} ListEmptyComponent={<Card><Text style={{ color: colors.muted }}>No reports generated yet.</Text></Card>}
      renderItem={({ item }) => (
        <Card style={{ gap: 4 }}>
          <Text style={s.title}>{item.title}</Text>
          <Text style={s.meta}>{item.periodStart.slice(0, 10)} → {item.periodEnd.slice(0, 10)} · generated {new Date(item.generatedAt).toLocaleDateString()}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
            {item.pdfUrl && <Pressable style={s.btn} onPress={() => Linking.openURL(item.pdfUrl!)}><Text style={s.btnText}>Open PDF</Text></Pressable>}
            {item.xlsxUrl && <Pressable style={[s.btn, s.ghost]} onPress={() => Linking.openURL(item.xlsxUrl!)}><Text style={[s.btnText, { color: colors.navy800 }]}>Excel</Text></Pressable>}
          </View>
        </Card>
      )} />
  );
}
const s = StyleSheet.create({ title: { fontSize: 16, fontWeight: '700', color: colors.ink }, meta: { color: colors.muted, fontSize: 12 }, btn: { backgroundColor: colors.navy800, paddingHorizontal: 14, paddingVertical: 9 }, ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.line }, btnText: { color: '#fff', fontWeight: '700', fontSize: 13 } });
