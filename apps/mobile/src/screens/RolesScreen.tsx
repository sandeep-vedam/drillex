import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../lib/api';
import type { RootStackParamList } from '../navigation';
import { Button, Card, Eyebrow } from '../ui';
import { colors } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Roles'>;
export type RoleRow = { id: string; key: string; name: string; isSystem: boolean; userCount: number; permissions: { permission: string; scope: string }[] };

export default function RolesScreen({ navigation }: Props) {
  const [rows, setRows] = useState<RoleRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { try { setRows(await api<RoleRow[]>('/roles')); setError(null); } catch (e) { setError((e as Error).message); } }, []);
  useEffect(() => navigation.addListener('focus', load), [navigation, load]);

  function remove(r: RoleRow) {
    if (r.isSystem) return Alert.alert('Built-in role', 'Built-in roles cannot be deleted.');
    if (r.userCount > 0) return Alert.alert('Role in use', `${r.userCount} user(s) still have this role — reassign them first.`);
    Alert.alert('Delete role?', `"${r.name}" will be permanently removed.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { try { await api(`/roles/${r.id}`, { method: 'DELETE' }); load(); } catch (e) { setError((e as Error).message); } } }]);
  }

  return (
    <FlatList style={{ backgroundColor: colors.canvas }} contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }} data={rows} keyExtractor={(r) => r.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      ListHeaderComponent={<View style={{ gap: 10, marginBottom: 4 }}><Button title="+ New role" onPress={() => navigation.navigate('RoleForm', {})} />{error && <Text style={{ color: colors.hazard, fontSize: 12 }}>{error}</Text>}<Eyebrow>Roles &amp; permissions</Eyebrow></View>}
      ListEmptyComponent={<Card><Text style={{ color: colors.muted }}>No roles yet.</Text></Card>}
      renderItem={({ item }) => (
        <Card stripe={item.isSystem ? colors.steel : colors.navy700} style={{ paddingLeft: 18, gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{item.name}{item.isSystem && <Text style={s.badge}>  BUILT-IN</Text>}</Text>
              <Text style={s.key}>{item.key}</Text>
            </View>
          </View>
          <Text style={s.meta}>{item.permissions.length} permission(s) · {item.userCount} user(s)</Text>
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
            <Text style={s.link} onPress={() => navigation.navigate('RoleForm', { role: item })}>Edit</Text>
            <Text style={[s.link, { color: colors.crit }]} onPress={() => remove(item)}>Delete</Text>
          </View>
        </Card>
      )} />
  );
}
const s = StyleSheet.create({
  name: { fontSize: 16, fontWeight: '700', color: colors.ink },
  badge: { fontSize: 10, fontWeight: '800', color: colors.steel, letterSpacing: 0.6 },
  key: { fontFamily: 'Menlo', fontSize: 12, color: colors.muted, marginTop: 2 },
  meta: { color: colors.muted, fontSize: 12, marginTop: 4 },
  link: { color: colors.navy700, fontWeight: '700', fontSize: 13 },
});
