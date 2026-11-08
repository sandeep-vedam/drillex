import React, { useCallback, useEffect, useState } from 'react';
import { PermissionsAndroid, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, loadSession } from '../lib/api';
import { cached } from '../sync/cache';
import type { RootStackParamList } from '../navigation';
import type { Asset } from './AssetsScreen';
import { Button, Card, Eyebrow } from '../ui';
import { colors } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Site'>;
type Current = { client: string; site: string; status: string; startDate: string; expectedEndDate: string | null; daysOnSite: number; daysRemaining: number | null; progress: number | null } | null;
type Fix = { lat: number; lng: number; accuracy: number; at: number };

async function askLocation() {
  if (Platform.OS !== 'android') return true;
  const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, {
    title: 'Location', message: 'Drillex shows where your machine is working. Your location is not shared until you send a report.', buttonPositive: 'Allow',
  });
  return r === PermissionsAndroid.RESULTS.GRANTED;
}

/**
 * Location and Client Tracker (client spec §4A tabs 4–5, §4B tabs 3–4): the site and client the machine is with,
 * GPS coordinates from the phone, and how far through the deployment it is.
 */
export default function SiteScreen(_: Props) {
  const [machines, setMachines] = useState<Asset[]>([]);
  const [selected, setSelected] = useState<string | undefined>();
  const [sites, setSites] = useState<Record<string, string>>({});
  const [current, setCurrent] = useState<Current | undefined>();
  const [fix, setFix] = useState<Fix | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const locate = useCallback(async () => {
    setGpsError(null); setLocating(true);
    if (!(await askLocation())) { setGpsError('Location permission was not given. Allow it in the phone settings to see GPS coordinates.'); setLocating(false); return; }
    Geolocation.getCurrentPosition(
      (p) => { setFix({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, at: p.timestamp }); setLocating(false); },
      (e) => { setGpsError(e.code === 3 ? 'No GPS fix yet — step outside or try again.' : e.message); setLocating(false); },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 },
    );
  }, []);

  const load = useCallback(async () => {
    const [a, s, sess] = await Promise.all([cached('assets', () => api<Asset[]>('/assets')), cached('sites', () => api<{ id: string; name: string }[]>('/sites')), loadSession()]);
    const own = a.data.filter((x) => x.operators?.some((o) => o.userId === sess?.user.id));
    const list = own.length ? own : a.data;
    setMachines(list); setSites(Object.fromEntries(s.data.map((x) => [x.id, x.name])));
    setSelected((cur) => cur ?? list[0]?.id);
  }, []);
  useEffect(() => { load().catch(() => {}); locate(); }, [load, locate]);
  useEffect(() => {
    if (!selected) return;
    setCurrent(undefined);
    cached(`current.${selected}`, () => api<Current>(`/finance/current?assetId=${selected}`)).then((r) => setCurrent(r.data)).catch(() => setCurrent(null));
  }, [selected]);

  const m = machines.find((x) => x.id === selected);
  const pct = current?.progress != null ? Math.round(current.progress * 100) : null;
  return (
    <ScrollView style={{ backgroundColor: colors.canvas }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load().catch(() => {}); await locate(); setRefreshing(false); }} />}>
      {machines.length > 1 && (
        <View style={s.chips}>{machines.map((x) => <Pressable key={x.id} onPress={() => setSelected(x.id)} style={[s.chip, selected === x.id && s.chipOn]}><Text style={[s.chipText, selected === x.id && { color: '#fff' }]}>{x.assetNumber}</Text></Pressable>)}</View>
      )}
      <Card stripe={colors.navy700} style={{ paddingLeft: 18, gap: 8 }}>
        <Eyebrow>Location</Eyebrow>
        <Text style={s.big}>{current?.site ?? (m ? sites[m.siteId] : '—') ?? '—'}</Text>
        <Row k="Client" v={current === undefined ? '…' : current?.client ?? 'Not on hire'} />
        <Row k="Machine" v={m ? `${m.assetNumber} · ${m.name}` : '—'} />
        <Row k="Base site" v={m ? sites[m.siteId] ?? '—' : '—'} />
        <View style={s.gps}>
          <Text style={s.label}>GPS coordinates</Text>
          {fix ? <>
            <Text style={s.coords}>{fix.lat.toFixed(5)}, {fix.lng.toFixed(5)}</Text>
            <Text style={s.meta}>±{Math.round(fix.accuracy)} m · {new Date(fix.at).toLocaleTimeString()}</Text>
          </> : <Text style={s.meta}>{locating ? 'Finding your position…' : gpsError ?? '—'}</Text>}
          {fix && gpsError && <Text style={s.warn}>{gpsError}</Text>}
        </View>
        <Button title={locating ? 'Locating…' : 'Refresh location'} variant="ghost" onPress={locate} disabled={locating} />
      </Card>

      <Card stripe={colors.gold} style={{ paddingLeft: 18, gap: 8 }}>
        <Eyebrow>Client tracker</Eyebrow>
        {current === undefined ? <Text style={s.meta}>Loading…</Text> : !current ? <Text style={s.meta}>This machine is not on hire to a client right now.</Text> : <>
          <Text style={s.big}>{current.client}</Text>
          <Row k="Start date" v={new Date(current.startDate).toLocaleDateString()} />
          <Row k="Expected end" v={current.expectedEndDate ? new Date(current.expectedEndDate).toLocaleDateString() : 'Open-ended'} />
          <View style={s.tiles}>
            <View style={s.tile}><Text style={s.tileValue}>{current.daysOnSite}</Text><Text style={s.tileLabel}>Days on site</Text></View>
            <View style={s.tile}><Text style={[s.tileValue, current.daysRemaining != null && current.daysRemaining < 0 && { color: colors.crit }]}>{current.daysRemaining ?? '—'}</Text><Text style={s.tileLabel}>Days remaining</Text></View>
          </View>
          {pct != null && (
            <View style={{ gap: 4 }}>
              <View style={s.track}><View style={[s.bar, { width: `${pct}%` }]} /></View>
              <Text style={s.meta}>{pct}% of the deployment elapsed</Text>
            </View>
          )}
        </>}
      </Card>
    </ScrollView>
  );
}
const Row = ({ k, v }: { k: string; v: string }) => <View style={s.row}><Text style={s.k}>{k}</Text><Text style={s.v}>{v}</Text></View>;
const s = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 8 },
  chipOn: { backgroundColor: colors.navy800, borderColor: colors.navy800 },
  chipText: { fontFamily: 'Menlo', fontWeight: '700', color: colors.ink },
  big: { fontSize: 22, fontWeight: '800', color: colors.navy800 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: 6 },
  k: { color: colors.muted, fontSize: 14 }, v: { color: colors.ink, fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  gps: { backgroundColor: colors.navy100, padding: 12, gap: 2 },
  label: { fontSize: 11, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.8 },
  coords: { fontFamily: 'Menlo', fontSize: 18, fontWeight: '800', color: colors.ink },
  meta: { color: colors.muted, fontSize: 13 }, warn: { color: colors.hazard, fontSize: 12 },
  tiles: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, borderWidth: 1, borderColor: colors.line, padding: 10, alignItems: 'center' },
  tileValue: { fontSize: 26, fontWeight: '800', color: colors.ink, fontVariant: ['tabular-nums'] },
  tileLabel: { fontSize: 12, color: colors.muted },
  track: { height: 12, backgroundColor: colors.line },
  bar: { height: 12, backgroundColor: colors.gold },
});
