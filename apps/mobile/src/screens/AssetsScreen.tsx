import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, loadSession } from '../lib/api';
import { can, type PermissionMatrix } from '@drillex/shared';
import { cached } from '../sync/cache';
import type { RootStackParamList } from '../navigation';
import { Button, Card, Eyebrow, StatusChip } from '../ui';
import { colors } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Assets'>;
export type Asset = {
  id: string; assetNumber: string; name: string; category: string; status: string;
  make: string; model: string; serialNumber: string; yearOfManufacture: number;
  commissionedAt: string; siteId: string; notes?: string | null;
  operators?: { userId: string }[];
};

const CATEGORY: Record<string, string> = {
  DRILLING: 'Drilling', HAULAGE: 'Haulage', COMPRESSOR: 'Compressor', ANCILLARY: 'Ancillary', OTHER: 'Other',
};

/** The full machine register, matching the web Assets page. Home only lists the machines assigned to you. */
export default function AssetsScreen({ navigation }: Props) {
  const [rows, setRows] = useState<Asset[]>([]);
  const [q, setQ] = useState('');
  const [matrix, setMatrix] = useState<PermissionMatrix | null>(null);
  const [role, setRole] = useState<string | undefined>();
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [a, perms, sess] = await Promise.all([
        cached('assets', () => api<Asset[]>('/assets')),
        cached('permissions', () => api<PermissionMatrix>('/roles/matrix')),
        loadSession(),
      ]);
      setRows(a.data); setMatrix(perms.data); setRole(sess?.user.role);
      setError(a.fromCache ? 'Offline — showing last synced register.' : null);
    } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => navigation.addListener('focus', load), [navigation, load]);

  const canWrite = !!role && !!matrix && !!can(matrix, role, 'asset:write');
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((a) => `${a.assetNumber} ${a.name} ${a.make} ${a.model} ${a.serialNumber}`.toLowerCase().includes(t));
  }, [rows, q]);

  return (
    <FlatList
      style={{ backgroundColor: colors.canvas }}
      contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
      data={list}
      keyExtractor={(a) => a.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      ListHeaderComponent={
        <View style={{ gap: 10, marginBottom: 4 }}>
          {canWrite && <Button title="+ Register a machine" onPress={() => navigation.navigate('AssetNew')} />}
          <TextInput
            style={s.search}
            value={q}
            onChangeText={setQ}
            placeholder="Search number, name, make or serial"
            placeholderTextColor="#9AA6B3"
            autoCapitalize="characters"
            autoCorrect={false}
          />
          {error && <Text style={s.err}>{error}</Text>}
          <Eyebrow>Machine register · {list.length}</Eyebrow>
        </View>
      }
      ListEmptyComponent={<Card><Text style={{ color: colors.muted }}>{q ? 'Nothing matches that search.' : 'No machines registered.'}</Text></Card>}
      renderItem={({ item }) => (
        <Pressable onPress={() => navigation.navigate('AssetDetail', { asset: item })}>
          <Card style={{ gap: 5 }}>
            <View style={s.rowTop}>
              <Text style={s.num}>{item.assetNumber}</Text>
              <StatusChip status={item.status} />
            </View>
            <Text style={s.name}>{item.name}</Text>
            <Text style={s.meta}>{item.make} {item.model} · {CATEGORY[item.category] ?? item.category}</Text>
            <Text style={s.link}>View details  →</Text>
          </Card>
        </Pressable>
      )}
    />
  );
}

const s = StyleSheet.create({
  search: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.ink },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  num: { fontFamily: 'Menlo', fontWeight: '800', color: colors.navy800, fontSize: 14 },
  name: { fontSize: 16, fontWeight: '700', color: colors.ink },
  meta: { color: colors.muted, fontSize: 13 },
  link: { color: colors.navy700, fontWeight: '700', fontSize: 13, marginTop: 4 },
  err: { color: colors.hazard, fontSize: 12 },
});
