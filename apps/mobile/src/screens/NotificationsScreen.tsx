import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { api } from '../lib/api';
import { cached } from '../sync/cache';
import { Card } from '../ui';
import { colors } from '../ui/theme';

type N = { id: string; type: string; title: string; body?: string; readAt?: string; createdAt: string };
const TONE: Record<string, string> = { machine_alert: colors.crit, maintenance_due: colors.hazard, low_stock: colors.hazard, approval_required: colors.warn, report_unlocked: colors.hazard, report_approved: colors.ok, job_card_approved: colors.ok };

/** In-app notification centre with read/unread (SRS §9.4). */
export default function NotificationsScreen() {
  const [rows, setRows] = useState<N[]>([]); const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => { try { const r = await cached('notifications', () => api<N[]>('/notifications')); setRows(r.data); } catch {} }, []);
  useEffect(() => { load(); }, [load]);
  async function read(n: N) { if (n.readAt) return; setRows((x) => x.map((y) => (y.id === n.id ? { ...y, readAt: new Date().toISOString() } : y))); try { await api(`/notifications/${n.id}/read`, { method: 'POST' }); } catch {} }
  async function readAll() { setRows((x) => x.map((y) => ({ ...y, readAt: y.readAt ?? new Date().toISOString() }))); try { await api('/notifications/read-all', { method: 'POST' }); } catch {} }
  const unread = rows.filter((r) => !r.readAt).length;
  return (
    <FlatList style={{ backgroundColor: colors.canvas }} contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 40 }} data={rows} keyExtractor={(n) => n.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      ListHeaderComponent={unread ? <Pressable onPress={readAll} style={{ alignSelf: "flex-end", marginBottom: 4 }}><Text style={{ color: colors.navy800, fontWeight: "700" }}>Mark all read ({unread})</Text></Pressable> : undefined}
      ListEmptyComponent={<Card><Text style={{ color: colors.muted }}>No notifications.</Text></Card>}
      renderItem={({ item }) => (
        <Pressable onPress={() => read(item)}>
          <Card stripe={TONE[item.type] ?? colors.steel} style={{ paddingLeft: 18, opacity: item.readAt ? 0.6 : 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}><Text style={[s.title, !item.readAt && { fontWeight: '800' }]} numberOfLines={2}>{item.title}</Text>{!item.readAt && <View style={s.dot} />}</View>
            {item.body ? <Text style={s.body}>{item.body}</Text> : null}
            <Text style={s.meta}>{item.type.replace(/_/g, ' ')} · {new Date(item.createdAt).toLocaleString()}</Text>
          </Card>
        </Pressable>
      )} />
  );
}
const s = StyleSheet.create({ title: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.ink }, body: { color: colors.muted, fontSize: 13 }, meta: { color: colors.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 2 }, dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.hazard, marginTop: 6 } });
