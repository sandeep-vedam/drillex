import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable, RefreshControl } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, clearSession, loadSession } from '../lib/api';
import { cached } from '../sync/cache';
import type { RootStackParamList } from '../navigation';
import type { Asset } from './AssetsScreen';
import { Card, Eyebrow, StatusChip } from '../ui';
import { colors } from '../ui/theme';
import { can, type PermissionMatrix } from '@drillex/shared';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;
type Summary = {
  readingsToday: number; pendingApprovals: number; openAlerts: number; overdueMaintenance: number;
  assets: { total: number; active: number; underMaintenance: number; idle: number; decommissioned: number };
  alerts?: { id: string; severity: string; message: string; createdAt: string; asset: { assetNumber: string; name: string } }[];
};

export default function HomeScreen({ navigation }: Props) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [who, setWho] = useState<{ employeeId: string; role: string } | null>(null);
  const [matrix, setMatrix] = useState<PermissionMatrix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      const [a, sm, perms, sess] = await Promise.all([cached('assets', () => api<Asset[]>('/assets')), cached('summary', () => api<Summary>('/dashboard/summary')), cached('permissions', () => api<PermissionMatrix>('/roles/matrix')), loadSession()]);
      setAssets(a.data); setSummary(sm.data); setMatrix(perms.data); setWho(sess?.user ?? null); setError(a.fromCache ? 'Offline — showing last synced data.' : null);
      api<{ count: number }>('/notifications/unread-count').then((r) => setUnread(r.count)).catch(() => {});
    } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  // Refresh on return, so a newly registered asset appears without a manual pull.
  useEffect(() => navigation.addListener('focus', load), [navigation, load]);
  async function signOut() { await clearSession(); navigation.replace('Login'); }

  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening';
  // SRS FR-9.1.1: the same permission matrix the API enforces decides what this screen offers, so the app
  // never shows a task the server would then refuse.
  const role = who?.role;
  const allow = (p: Parameters<typeof can>[2]) => !!role && !!matrix && !!can(matrix, role, p);
  /**
   * One job, chosen for this person: the thing they would open the app to do. Everything else moved to
   * the More screen — a wall of fourteen equal choices told nobody what mattered.
   */
  const pending = summary?.pendingApprovals ?? 0;
  const overdue = summary?.overdueMaintenance ?? 0;
  const readingDone = !!summary?.readingsToday;
  const job =
    allow('daily_reading:create') && !readingDone
      ? { title: 'Today\u2019s machine check is not done', body: 'Open your machine below and tap Daily reading.', cta: null, tone: colors.hazard }
    : allow('shift_report:approve') && pending > 0
      ? { title: `${pending} production report${pending > 1 ? 's' : ''} waiting for you`, body: 'Check the figures, then approve or send back.', cta: { label: 'Review them', go: () => navigation.navigate('ShiftReports') }, tone: colors.hazard }
    : allow('maintenance:read') && overdue > 0
      ? { title: `${overdue} service${overdue > 1 ? 's are' : ' is'} overdue`, body: 'These machines are past their service point.', cta: { label: 'See servicing', go: () => navigation.navigate('Maintenance') }, tone: colors.crit }
    : allow('daily_reading:create') && readingDone
      ? { title: 'Today\u2019s check is done', body: 'Nothing else is waiting for you.', cta: null, tone: colors.ok }
    : { title: 'Nothing is waiting for you', body: 'Everything is up to date right now.', cta: null, tone: colors.ok };
  // Office roles (anyone who doesn't file readings) get the web dashboard's overview; operators keep the one-job screen.
  const overview = !!role && !!matrix && !allow('daily_reading:create');
  const alerts = summary?.alerts ?? [];
  const alertLimit = 3;

  return (
    <FlatList
      style={{ backgroundColor: colors.canvas }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
      data={assets}
      keyExtractor={(a) => a.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <View style={s.head}>
            <View><Eyebrow>{greeting}</Eyebrow><Text style={s.h1}>{who?.employeeId ?? '—'}</Text><Text style={s.role}>{who?.role ?? ''}</Text></View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <Pressable onPress={() => navigation.navigate('Notifications')} hitSlop={10} style={s.bell}><Text style={s.bellText}>🔔 {unread ? unread : ''}</Text></Pressable>
              <View style={{ flexDirection: 'row', gap: 14 }}>
                <Pressable onPress={() => navigation.navigate('ChangePassword')} hitSlop={10}><Text style={s.link}>Password</Text></Pressable>
                <Pressable onPress={signOut} hitSlop={10}><Text style={s.link}>Sign out</Text></Pressable>
              </View>
            </View>
          </View>
          {error && <Text style={s.err}>{error}</Text>}

          {/* The one thing that needs doing, stated as a sentence rather than a number on a tile. */}
          <Card stripe={job.tone} style={{ paddingLeft: 18, gap: 8 }}>
            <Text style={s.jobTitle}>{job.title}</Text>
            {!overview && !job.cta && <Text style={s.jobBody}>{job.body}</Text>}
            {job.cta && (
              <Pressable onPress={job.cta.go} accessibilityRole="button" style={({ pressed }) => [s.cta, pressed && { opacity: 0.7 }]}>
                <Text style={s.ctaText}>{job.cta.label}</Text>
              </Pressable>
            )}
          </Card>

          {/* Office roles: three numbers, each a way in. Details live one tap away, not on the home screen. */}
          {overview && summary && (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Figure value={summary.assets.total} label="Machines" onPress={() => navigation.navigate('Assets')} />
              <Figure value={`${summary.readingsToday}/${summary.assets.active}`} label="Checked" tone={summary.readingsToday < summary.assets.active ? colors.hazard : colors.ok} onPress={allow('daily_reading:read') ? () => navigation.navigate('Readings') : undefined} />
              <Figure value={summary.openAlerts} label="Alerts" tone={summary.openAlerts ? colors.crit : colors.ok} onPress={allow('daily_reading:read') ? () => navigation.navigate('Readings') : undefined} />
            </View>
          )}

          {!overview && !!alerts.length && allow('daily_reading:read') && (
            <Card stripe={colors.crit} style={{ paddingLeft: 18, gap: 6 }}>
              <Eyebrow>Faults reported</Eyebrow>
              {alerts.slice(0, alertLimit).map((a) => (
                <View key={a.id} style={{ gap: 1 }}>
                  <Text style={s.alertMsg}>{a.message}</Text>
                  <Text style={s.alertMeta}>{a.asset.assetNumber} · {new Date(a.createdAt).toLocaleDateString()}</Text>
                </View>
              ))}
              {alerts.length > alertLimit && <Text style={s.alertMeta}>and {alerts.length - alertLimit} more</Text>}
            </Card>
          )}

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Eyebrow>{allow('daily_reading:create') ? 'My machines' : 'Machines'}</Eyebrow>
            {overview && allow('asset:write') && <Pressable onPress={() => navigation.navigate('AssetNew')} hitSlop={10}><Text style={s.more}>+ Add</Text></Pressable>}
          </View>
        </View>
      }
      ListEmptyComponent={!error ? <Card><Text style={{ color: colors.muted }}>No machines are assigned to you yet.</Text></Card> : undefined}
      renderItem={({ item }) => overview ? (
        // No per-machine actions for office roles, so one line is enough.
        <Pressable onPress={() => navigation.navigate('AssetDetail', { asset: item })}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 }}>
            <Text style={s.num}>{item.assetNumber}</Text>
            <Text style={[s.rowName, { flex: 1 }]} numberOfLines={1}>{item.name}</Text>
            <StatusChip status={item.status} />
          </Card>
        </Pressable>
      ) : (
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={s.num}>{item.assetNumber}</Text><StatusChip status={item.status} />
          </View>
          <Text style={s.name}>{item.name}</Text>
          <Text style={s.meta}>{item.make} {item.model}</Text>
          {(allow('daily_reading:create') || allow('shift_report:create')) && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              {allow('daily_reading:create') && <Pressable style={s.action} onPress={() => navigation.navigate('DailyReading', { assetId: item.id, assetNumber: item.assetNumber, assetName: item.name })}><Text style={s.actionText}>Daily reading</Text></Pressable>}
              {allow('shift_report:create') && item.category === 'DRILLING' && <Pressable style={[s.action, { backgroundColor: colors.hazard }]} onPress={() => navigation.navigate('ShiftReport', { assetId: item.id, assetNumber: item.assetNumber, assetName: item.name, siteId: item.siteId })}><Text style={s.actionText}>Shift report</Text></Pressable>}
            </View>
          )}
        </Card>
      )}
    />
  );
}

function Figure({ value, label, tone = colors.navy800, onPress }: { value: string | number; label: string; tone?: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [s.figure, pressed && { opacity: 0.7 }]}>
      <Text style={[s.figValue, { color: tone }]}>{value}</Text>
      <Text style={s.figLabel}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  jobTitle: { fontSize: 19, fontWeight: '700', color: colors.ink, lineHeight: 25 },
  jobBody: { fontSize: 14.5, color: colors.muted, lineHeight: 20 },
  cta: { marginTop: 4, minHeight: 48, backgroundColor: colors.navy800, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: 15, letterSpacing: 0.3 },
  figure: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, paddingVertical: 12, alignItems: 'center', gap: 2 },
  figValue: { fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  figLabel: { fontSize: 12, color: colors.muted },
  rowName: { fontSize: 15, fontWeight: '600', color: colors.ink },
  alertMsg: { fontSize: 13, fontWeight: '600', color: colors.ink },
  alertMeta: { fontSize: 11, color: colors.muted },
  more: { color: colors.navy700, fontWeight: '700', fontSize: 12 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingTop: 8 },
  h1: { fontSize: 28, fontWeight: '800', color: colors.navy800, fontFamily: 'Menlo' },
  role: { color: colors.muted, fontSize: 12, letterSpacing: 1.2 },
  link: { color: colors.navy700, fontWeight: '700', fontSize: 13, paddingVertical: 6, paddingHorizontal: 2 },
  bell: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 6 }, bellText: { fontWeight: '800', color: colors.hazard },
  err: { color: colors.crit },
  taskTitle: { fontSize: 16, fontWeight: '700', color: colors.ink }, taskSub: { color: colors.muted, fontSize: 13, marginTop: 2 },
  num: { fontFamily: 'Menlo', fontWeight: '700', color: colors.navy800, fontSize: 15 },
  name: { fontSize: 17, fontWeight: '600', color: colors.ink, marginTop: 6 }, meta: { color: colors.muted, fontSize: 13, marginTop: 2 },
  action: { flex: 1, minHeight: 48, backgroundColor: colors.navy800, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' }, actionText: { color: '#fff', fontWeight: '700', fontSize: 14, letterSpacing: 0.3 },
});
