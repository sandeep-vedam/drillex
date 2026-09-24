import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, loadSession } from '../lib/api';
import { can, type PermissionMatrix } from '@drillex/shared';
import { cached } from '../sync/cache';
import type { RootStackParamList } from '../navigation';
import { Eyebrow } from '../ui';
import { Icon, type IconName } from '../ui/icons';
import { colors } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'More'>;
type Entry = { key: string; icon: IconName; title: string; sub: string; go: () => void };

/**
 * Everything that is not today's job. Home keeps the one thing that needs doing; this holds the rest as
 * large picture tiles, so a destination can be found by its shape rather than by reading every label.
 * Wording here is deliberately plain: "Duplicate entries", not "Sync conflicts".
 */
export default function MoreScreen({ navigation }: Props) {
  const [matrix, setMatrix] = useState<PermissionMatrix | null>(null);
  const [role, setRole] = useState<string | undefined>();

  const load = useCallback(async () => {
    const [perms, sess] = await Promise.all([
      cached('permissions', () => api<PermissionMatrix>('/roles/matrix')),
      loadSession(),
    ]);
    setMatrix(perms.data); setRole(sess?.user.role);
  }, []);
  useEffect(() => { load().catch(() => {}); }, [load]);

  const allow = (p: Parameters<typeof can>[2]) => !!role && !!matrix && !!can(matrix, role, p);

  const work: Entry[] = [
    ...(allow('shift_report:approve') ? [{ key: 'approvals', icon: 'check' as IconName, title: 'Approve production', sub: 'Sign off drilled metres', go: () => navigation.navigate('ShiftReports') }] : []),
    ...(allow('daily_reading:read') ? [{ key: 'readings', icon: 'gauge' as IconName, title: 'Machine checks', sub: 'See every check, find faults', go: () => navigation.navigate('Readings') }] : []),
    ...(allow('maintenance:read') ? [{ key: 'maint', icon: 'cog' as IconName, title: 'Servicing', sub: 'What is due, mark it done', go: () => navigation.navigate('Maintenance') }] : []),
    ...(allow('job_card:read') ? [{ key: 'jc', icon: 'clipboard' as IconName, title: 'Repair records', sub: 'Write up work you did', go: () => navigation.navigate('JobCards') }] : []),
    ...(allow('parts:read') ? [{ key: 'parts', icon: 'parts' as IconName, title: 'Parts store', sub: 'Stock levels and ordering', go: () => navigation.navigate('Parts') }] : []),
    ...(allow('parts:read') ? [{ key: 'chemicals', icon: 'parts' as IconName, title: 'Chemicals', sub: 'The list for shift reports', go: () => navigation.navigate('Chemicals') }] : []),
    ...(allow('asset:read') ? [{ key: 'assets', icon: 'rig' as IconName, title: 'All machines', sub: 'The full machine list', go: () => navigation.navigate('Assets') }] : []),
    ...(allow('asset:write') ? [{ key: 'newasset', icon: 'plus' as IconName, title: 'Add a machine', sub: 'Put a new one on the list', go: () => navigation.navigate('AssetNew') }] : []),
    ...(allow('report:read') ? [{ key: 'reports', icon: 'report' as IconName, title: 'Reports', sub: 'Monthly figures to download', go: () => navigation.navigate('Reports') }] : []),
    ...(allow('daily_reading:read') || allow('shift_report:read') ? [{ key: 'history', icon: 'clock' as IconName, title: 'What I sent', sub: 'Your past checks and reports', go: () => navigation.navigate('History') }] : []),
  ];

  const admin: Entry[] = [
    ...(allow('user:manage') ? [{ key: 'users', icon: 'people' as IconName, title: 'People', sub: 'Add staff, reset passwords', go: () => navigation.navigate('Users') }] : []),
    ...(allow('role:manage') ? [{ key: 'roles', icon: 'key' as IconName, title: 'What people can do', sub: 'Job types and their permissions', go: () => navigation.navigate('Roles') }] : []),
    ...(allow('user:manage') ? [{ key: 'devices', icon: 'phone' as IconName, title: 'Phones', sub: 'Allow or block a phone', go: () => navigation.navigate('Devices') }] : []),
    ...(allow('user:manage') ? [{ key: 'security', icon: 'shield' as IconName, title: 'Extra sign-in code', sub: 'Which jobs need a code', go: () => navigation.navigate('TwoFaSettings') }] : []),
    ...(allow('user:manage') ? [{ key: 'operations', icon: 'cog' as IconName, title: 'Operations', sub: 'Alert level, repair sign-off', go: () => navigation.navigate('OperationsSettings') }] : []),
    ...(allow('shift_report:approve') ? [{ key: 'conflicts', icon: 'duplicate' as IconName, title: 'Duplicate entries', sub: 'Things sent twice by mistake', go: () => navigation.navigate('SyncConflicts') }] : []),
  ];

  const grid = (items: Entry[]) =>
    items.reduce<Entry[][]>((acc, it, i) => (i % 2 ? acc[acc.length - 1].push(it) : acc.push([it]), acc), []);

  const render = (items: Entry[], keyPrefix: string) =>
    grid(items).map((row, i) => (
      <View key={`${keyPrefix}${i}`} style={s.row}>
        {row.map((e) => (
          <Pressable
            key={e.key}
            onPress={e.go}
            accessibilityRole="button"
            accessibilityLabel={`${e.title}. ${e.sub}`}
            style={({ pressed }) => [s.tile, pressed && { backgroundColor: colors.navy100, borderColor: colors.navy700 }]}
          >
            <View style={s.iconWrap}><Icon name={e.icon} size={30} color={colors.navy800} /></View>
            <Text style={s.title}>{e.title}</Text>
            <Text style={s.sub}>{e.sub}</Text>
          </Pressable>
        ))}
        {row.length === 1 && <View style={{ flex: 1 }} />}
      </View>
    ));

  return (
    <ScrollView style={{ backgroundColor: colors.canvas }} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 44 }}>
      {work.length > 0 && <Eyebrow>Everyday jobs</Eyebrow>}
      {render(work, 'w')}
      {admin.length > 0 && <Eyebrow>Setting things up</Eyebrow>}
      {render(admin, 'a')}
      {work.length === 0 && admin.length === 0 && (
        <Text style={s.sub}>There is nothing else for your job type.</Text>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  tile: {
    flex: 1, minHeight: 128, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
    paddingHorizontal: 14, paddingTop: 16, paddingBottom: 14, gap: 4,
  },
  iconWrap: { height: 34, justifyContent: 'center' },
  title: { fontSize: 15.5, fontWeight: '700', color: colors.ink, lineHeight: 20 },
  sub: { fontSize: 12.5, color: colors.muted, lineHeight: 17 },
});
