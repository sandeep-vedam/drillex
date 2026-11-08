import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { can, requestNumber, RequestPriorityLabel, RequestStatusLabel, RequestTypeLabel, type PermissionMatrix } from '@drillex/shared';
import { api, loadSession } from '../lib/api';
import { cached } from '../sync/cache';
import type { RootStackParamList } from '../navigation';
import { Button, Card, Eyebrow } from '../ui';
import { colors } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Requests'>;
export type RequestRow = {
  id: string; number: number; type: keyof typeof RequestTypeLabel; priority: keyof typeof RequestPriorityLabel; details: string; status: keyof typeof RequestStatusLabel; createdAt: string;
  createdBy: { id: string; employeeId: string; name: string }; asset: { assetNumber: string; name: string } | null; replies: { id: string }[];
};
export const STATUS_COLOR: Record<string, string> = { RECEIVED: colors.hazard, IN_PROGRESS: colors.navy700, RESOLVED: colors.ok };
export const PRIORITY_COLOR: Record<string, string> = { URGENT: colors.crit, MEDIUM: colors.hazard, LOW: colors.muted };

/** Requests (client spec §4A tab 7, §4B tab 6): what you asked for and where it stands. */
export default function RequestsScreen({ navigation }: Props) {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const [r, perms, sess] = await Promise.all([cached('requests', () => api<RequestRow[]>('/requests')), cached('permissions', () => api<PermissionMatrix>('/roles/matrix')), loadSession()]);
      setRows(r.data); setNote(r.fromCache ? 'Offline — showing the last synced list.' : null);
      setCanCreate(!!can(perms.data, sess?.user.role, 'request:create'));
    } catch (e) { setNote((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => navigation.addListener('focus', load), [navigation, load]);

  return (
    <FlatList
      style={{ backgroundColor: colors.canvas }}
      contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
      data={rows}
      keyExtractor={(r) => r.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      ListHeaderComponent={
        <View style={{ gap: 10, marginBottom: 4 }}>
          {canCreate && <Button title="+ New request" onPress={() => navigation.navigate('RequestNew')} />}
          {note && <Text style={s.note}>{note}</Text>}
        </View>
      }
      ListEmptyComponent={<Text style={s.empty}>No requests yet. Ask for consumables, equipment, safety items, HR or finance help here.</Text>}
      renderItem={({ item }) => (
        <Pressable onPress={() => navigation.navigate('RequestDetail', { id: item.id })}>
          <Card stripe={STATUS_COLOR[item.status]} style={{ paddingLeft: 18, gap: 4 }}>
            <View style={s.top}>
              <Text style={s.num}>{requestNumber(item.number)}</Text>
              <Text style={[s.status, { color: STATUS_COLOR[item.status] }]}>{RequestStatusLabel[item.status]}</Text>
            </View>
            <Eyebrow>{RequestTypeLabel[item.type]} · <Text style={{ color: PRIORITY_COLOR[item.priority] }}>{RequestPriorityLabel[item.priority]}</Text>{item.asset ? ` · ${item.asset.assetNumber}` : ''}</Eyebrow>
            <Text style={s.details} numberOfLines={2}>{item.details}</Text>
            <Text style={s.meta}>{item.createdBy.employeeId} · {new Date(item.createdAt).toLocaleDateString()}{item.replies.length ? ` · ${item.replies.length} repl${item.replies.length === 1 ? 'y' : 'ies'}` : ''}</Text>
          </Card>
        </Pressable>
      )}
    />
  );
}
const s = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  num: { fontFamily: 'Menlo', fontWeight: '800', color: colors.navy800, fontSize: 16 },
  status: { fontWeight: '800', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6 },
  details: { color: colors.ink, fontSize: 14 },
  meta: { color: colors.muted, fontSize: 12 },
  note: { color: colors.hazard, fontSize: 13 },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 32, paddingHorizontal: 24 },
});
