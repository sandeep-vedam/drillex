import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Image, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../lib/api';
import { describeSubmission, DEFAULT_ALERT_THRESHOLD } from '@drillex/shared';
import { cached } from '../sync/cache';
import { Card, Eyebrow } from '../ui';
import { colors } from '../ui/theme';

type Reading = {
  id: string; date: string; hourMeter: string; conditionRating: number;
  warningLights: boolean; leaks: boolean; unusualNoises: boolean;
  asset: { assetNumber: string; name: string }; user: { employeeId: string; name: string };
};

/**
 * Review of everyone's readings, with the flagged-only filter a supervisor uses each morning — the
 * counterpart of the web Daily readings page. Distinct from HistoryScreen, which shows only your own.
 */
export default function ReadingsScreen() {
  const [rows, setRows] = useState<Reading[]>([]);
  const [flagged, setFlagged] = useState(false);
  const [sel, setSel] = useState<Record<string, unknown> | null>(null);
  const [selTitle, setSelTitle] = useState('');
  const [selPhotos, setSelPhotos] = useState<{ id: string; kind: string; url: string }[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(DEFAULT_ALERT_THRESHOLD); // the server's alert rule (SRS §5.3), admin-configurable
  useEffect(() => { cached('settings.operations', () => api<{ readingAlertThreshold: number }>('/settings/operations')).then((r) => setThreshold(r.data.readingAlertThreshold)).catch(() => {}); }, []);

  const load = useCallback(async () => {
    try { setRows(await api<Reading[]>(`/daily-readings${flagged ? '?flagged=1' : ''}`)); setError(null); }
    catch (e) { setError((e as Error).message); }
  }, [flagged]);
  useEffect(() => { load(); }, [load]);

  async function open(r: Reading) {
    setSelTitle(`${r.asset.assetNumber} · ${new Date(r.date).toLocaleDateString()}`);
    setSelPhotos([]);
    try { setSel(await api<Record<string, unknown>>(`/daily-readings/${r.id}`)); }
    catch (e) { setError((e as Error).message); }
    try { setSelPhotos(await api<{ id: string; kind: string; url: string }[]>(`/attachments?ownerType=DailyReading&ownerId=${r.id}`)); }
    catch { /* the figures matter more than the pictures */ }
  }

  function flagsOf(r: Reading) {
    const f: string[] = [];
    if (r.warningLights) f.push('Warning lights');
    if (r.leaks) f.push('Leaks');
    if (r.unusualNoises) f.push('Unusual noises');
    if (r.conditionRating <= threshold) f.push('Poor condition');
    return f;
  }

  return (
    <>
      <FlatList
        style={{ backgroundColor: colors.canvas }}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
        data={rows}
        keyExtractor={(r) => r.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListHeaderComponent={
          <View style={{ gap: 10, marginBottom: 4 }}>
            <Eyebrow>Daily readings</Eyebrow>
            <Pressable onPress={() => setFlagged((v) => !v)} style={[s.filter, flagged && s.filterOn]}>
              <View style={[s.box, flagged && { backgroundColor: colors.hazard, borderColor: colors.hazard }]}>
                {flagged && <Text style={s.tick}>✓</Text>}
              </View>
              <Text style={[s.filterText, flagged && { color: colors.hazard }]}>Show only machines with a fault flagged</Text>
            </Pressable>
            {error && <Text style={s.err}>{error}</Text>}
          </View>
        }
        ListEmptyComponent={<Card><Text style={{ color: colors.muted }}>{flagged ? 'No faults flagged.' : 'No readings yet.'}</Text></Card>}
        renderItem={({ item }) => {
          const flags = flagsOf(item);
          return (
            <Pressable onPress={() => open(item)}>
              <Card stripe={flags.length ? (item.conditionRating <= threshold ? colors.crit : colors.hazard) : colors.ok} style={{ paddingLeft: 18, gap: 4 }}>
                <View style={s.rowTop}>
                  <Text style={s.num}>{item.asset.assetNumber}</Text>
                  <Text style={s.rating}>{item.conditionRating} / 5</Text>
                </View>
                <Text style={s.meta}>{new Date(item.date).toLocaleDateString()} · {Number(item.hourMeter)} h · {item.user.employeeId}</Text>
                {!!flags.length && <Text style={s.flags}>{flags.join(' · ')}</Text>}
              </Card>
            </Pressable>
          );
        }}
      />

      <Modal visible={!!sel} animationType="slide" transparent onRequestClose={() => setSel(null)}>
        <View style={s.backdrop}>
          <View style={s.sheet}>
            <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 28 }}>
              <View style={s.rowTop}>
                <View><Eyebrow>Daily reading</Eyebrow><Text style={s.sheetTitle}>{selTitle}</Text></View>
                <Pressable onPress={() => setSel(null)} hitSlop={10}><Text style={s.close}>Close</Text></Pressable>
              </View>
              {selPhotos.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {selPhotos.map((a) => <Image key={a.id} source={{ uri: a.url }} style={s.photo} resizeMode="cover" />)}
                </ScrollView>
              )}
              {/* Same formatter the sync-conflicts screen uses, so a reading reads identically wherever it appears. */}
              {sel && (
                <View style={{ borderTopWidth: 1, borderTopColor: colors.line }}>
                  {describeSubmission(sel).map((f) => (
                    <View key={f.key} style={s.detail}>
                      <Text style={s.dk}>{f.label}</Text>
                      <Text style={[s.dv, f.tone === 'crit' && { color: colors.crit }, f.tone === 'warn' && { color: colors.hazard }]}>{f.value}</Text>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  filter: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 11 },
  filterOn: { borderColor: colors.hazard },
  box: { width: 18, height: 18, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  tick: { color: '#fff', fontSize: 12, fontWeight: '900', lineHeight: 14 },
  filterText: { color: colors.ink, fontSize: 13, fontWeight: '600', flex: 1 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  num: { fontSize: 16, fontWeight: '700', color: colors.ink },
  rating: { fontSize: 13, fontWeight: '700', color: colors.muted, fontVariant: ['tabular-nums'] },
  meta: { color: colors.muted, fontSize: 13 },
  flags: { color: colors.hazard, fontSize: 12, fontWeight: '700' },
  err: { color: colors.crit, fontSize: 13, fontWeight: '600' },
  backdrop: { flex: 1, backgroundColor: 'rgba(11,27,48,.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.canvas, maxHeight: '88%', borderTopWidth: 3, borderTopColor: colors.hazard },
  sheetTitle: { fontSize: 19, fontWeight: '700', color: colors.ink, marginTop: 3 },
  close: { color: colors.navy700, fontWeight: '700', fontSize: 13 },
  photo: { width: 104, height: 104, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  detail: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.line },
  dk: { color: colors.muted, fontSize: 13, flexShrink: 0 },
  dv: { color: colors.ink, fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
});
