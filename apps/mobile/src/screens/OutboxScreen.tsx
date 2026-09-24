import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { discard, flush, listOps, Op, retry, subscribe } from '../sync/outbox';
import { Action, Button, Card, Eyebrow } from '../ui';
import { colors } from '../ui/theme';

export default function OutboxScreen() {
  const [ops, setOps] = useState<Op[]>([]);
  const reload = () => listOps().then(setOps);
  useEffect(() => { reload(); return subscribe(() => { reload(); }); }, []);
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <FlatList data={ops} keyExtractor={(o) => o.opId} contentContainerStyle={{ padding: 16, gap: 10 }}
        ListHeaderComponent={<View style={{ gap: 10, marginBottom: 6 }}><Eyebrow>Pending uploads</Eyebrow><Text style={{ color: colors.muted, fontSize: 13 }}>Submissions are saved on this device and sent automatically when you have signal. Nothing is lost if the app closes.</Text><Button title="Sync now" onPress={() => void flush()} variant="ghost" /></View>}
        ListEmptyComponent={<Card><Text style={{ color: colors.ok, fontWeight: '700' }}>Everything is synced.</Text></Card>}
        renderItem={({ item }) => (
          <Card stripe={item.error ? colors.crit : colors.hazard} style={{ paddingLeft: 18, gap: 6 }}>
            <Text style={s.title}>{item.label}</Text>
            <Text style={s.meta}>{item.kind.replace('_', ' ')} · queued {new Date(item.queuedAt).toLocaleString()} · {item.attempts} attempt(s)</Text>
            {item.error && <Text style={s.err}>Rejected: {item.error}</Text>}
            {item.error && <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}><Action title="Retry" onPress={() => retry(item.opId)} /><Action title="Discard" tone={colors.crit} onPress={() => discard(item.opId)} /></View>}
          </Card>
        )} />
    </View>
  );
}
const s = StyleSheet.create({ title: { fontWeight: '700', color: colors.ink, fontSize: 15 }, meta: { color: colors.muted, fontSize: 12 }, err: { color: colors.crit, fontSize: 13 }, link: { color: colors.navy800, fontWeight: '700' } });
