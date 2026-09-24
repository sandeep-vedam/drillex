import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, loadSession } from '../lib/api';
import { ServiceTypes, can, type PermissionMatrix } from '@drillex/shared';
import { cached } from '../sync/cache';
import { Action, Button, Card, Eyebrow } from '../ui';
import { colors } from '../ui/theme';

type Sched = { id: string; description: string; serviceType: string; status: string; nextDueAt?: string; nextDueHours?: string; hoursRemaining: number | null; currentHours: number | null; estDowntimeHours?: string; notes?: string; asset: { assetNumber: string; name: string } };
const TONE: Record<string, string> = { OVERDUE: colors.crit, DUE_NOW: colors.hazard, UPCOMING: colors.navy700, COMPLETED: colors.ok };
const LABEL: Record<string, string> = { OVERDUE: 'OVERDUE', DUE_NOW: 'DUE NOW', UPCOMING: 'Upcoming', COMPLETED: 'Completed' };
const SERVICE_LABEL: Record<string, string> = { HR_250: 'Every 250 hours', HR_500: 'Every 500 hours', HR_1000: 'Every 1000 hours', ANNUAL: 'Yearly', CONDITION_BASED: 'When needed', AD_HOC: 'One-off' };
type AssetOpt = { id: string; assetNumber: string; name: string };

export default function MaintenanceScreen() {
  const [rows, setRows] = useState<Sched[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hm, setHm] = useState<Record<string, string>>({});
  const load = useCallback(async () => { try { const r = await cached('maint', () => api<Sched[]>('/maintenance/schedules?mine=1')); setRows(r.data.filter((x) => x.status !== 'COMPLETED')); setError(r.fromCache ? 'Offline — showing last synced list.' : null); } catch (e) { setError((e as Error).message); } }, []);
  const [matrix, setMatrix] = useState<PermissionMatrix | null>(null);
  const [role, setRole] = useState<string | undefined>();
  useEffect(() => { Promise.all([cached('permissions', () => api<PermissionMatrix>('/roles/matrix')), loadSession()]).then(([m, sess]) => { setMatrix(m.data); setRole(sess?.user.role); }).catch(() => {}); }, []);
  const canWrite = !!role && !!matrix && !!can(matrix, role, 'maintenance:write');
  const [showNew, setShowNew] = useState(false);
  const [assets, setAssets] = useState<AssetOpt[]>([]);
  const [busy, setBusy] = useState(false);
  const [ns, setNs] = useState({ assetId: '', serviceType: 'HR_250', description: '', intervalHours: '' });

  useEffect(() => { cached('assets', () => api<AssetOpt[]>('/assets')).then((r) => { setAssets(r.data); setNs((n) => ({ ...n, assetId: n.assetId || r.data[0]?.id || '' })); }).catch(() => {}); }, []);

  async function createSchedule() {
    if (!ns.assetId) { setError('Choose a machine.'); return; }
    if (ns.description.trim().length < 3) { setError('Describe the service in a few words.'); return; }
    setBusy(true); setError(null);
    try {
      const hrs = parseInt(ns.intervalHours, 10);
      await api('/maintenance/schedules', { method: 'POST', body: JSON.stringify({
        assetId: ns.assetId, serviceType: ns.serviceType, description: ns.description.trim(),
        ...(Number.isFinite(hrs) && hrs > 0 ? { intervalHours: hrs } : {}),
      }) });
      setShowNew(false); setNs({ assetId: assets[0]?.id ?? '', serviceType: 'HR_250', description: '', intervalHours: '' });
      load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  /** Deleting a schedule is what the web offers; it removes the plan, not the history. */
  function remove(sc: Sched) {
    Alert.alert('Delete this schedule?', `"${sc.description}" on ${sc.asset.assetNumber} will be removed. Work already recorded is kept.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
          try { await api(`/maintenance/schedules/${sc.id}`, { method: 'DELETE' }); load(); }
          catch (e) { setError((e as Error).message); }
        } },
    ]);
  }
  useEffect(() => { load(); }, [load]);

  async function complete(s: Sched) {
    const hours = hm[s.id] ? Number(hm[s.id]) : undefined;
    Alert.alert('Mark completed?', `${s.asset.assetNumber} · ${s.description}${hours != null ? ` at ${hours} h` : ''}`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Complete', onPress: async () => { try { await api(`/maintenance/schedules/${s.id}/complete`, { method: 'POST', body: JSON.stringify({ hourMeter: hours }) }); load(); } catch (e) { setError((e as Error).message); } } }]);
  }

  return (
    <>
    <FlatList style={{ backgroundColor: colors.canvas }} contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }} data={rows} keyExtractor={(s) => s.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      ListHeaderComponent={<View style={{ gap: 10, marginBottom: 4 }}>{canWrite && <Button title="+ Schedule a service" onPress={() => setShowNew(true)} />}<Eyebrow>{canWrite ? 'Services' : 'My assigned services'}</Eyebrow>{error && <Text style={{ color: colors.hazard, fontSize: 12 }}>{error}</Text>}</View>}
      ListEmptyComponent={<Card><Text style={{ color: colors.muted }}>No services assigned to you.</Text></Card>}
      renderItem={({ item }) => (
        <Card stripe={TONE[item.status]} style={{ paddingLeft: 18, gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={s.num}>{item.asset.assetNumber} <Text style={{ fontFamily: undefined, color: colors.muted, fontWeight: '400' }}>{item.asset.name}</Text></Text><Text style={[s.badge, { color: TONE[item.status] }]}>{LABEL[item.status]}</Text></View>
          <Text style={s.title}>{item.description}</Text>
          <Text style={s.meta}>{item.nextDueAt ? `Due ${new Date(item.nextDueAt).toLocaleDateString()}` : ''}{item.nextDueHours != null ? `${item.nextDueAt ? ' · ' : ''}at ${Number(item.nextDueHours)} h${item.hoursRemaining != null ? ` (${item.hoursRemaining < 0 ? `${Math.abs(item.hoursRemaining)} h over` : `${item.hoursRemaining} h left`})` : ''}` : ''}{item.estDowntimeHours ? ` · est. ${Number(item.estDowntimeHours)} h downtime` : ''}</Text>
          {item.notes ? <Text style={[s.meta, { fontStyle: 'italic' }]}>{item.notes.split('\n').slice(-1)[0]}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, alignItems: 'center' }}>
            <TextInput style={s.hm} keyboardType="decimal-pad" placeholder={item.currentHours != null ? `${item.currentHours} h` : 'Hour meter'} placeholderTextColor="#9AA6B3" value={hm[item.id] ?? ''} onChangeText={(v) => setHm((x) => ({ ...x, [item.id]: v }))} />
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Pressable style={s.btn} onPress={() => complete(item)}><Text style={s.btnText}>Mark completed</Text></Pressable>
              {canWrite && <Action title="Delete" tone={colors.crit} onPress={() => remove(item)} />}
            </View>
          </View>
        </Card>
      )} />

    <Modal visible={showNew} animationType="slide" transparent onRequestClose={() => setShowNew(false)}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
            <View style={s.sheetTop}>
              <View><Eyebrow>Maintenance</Eyebrow><Text style={s.sheetTitle}>Schedule a service</Text></View>
              <Pressable onPress={() => setShowNew(false)} hitSlop={10}><Text style={s.close}>Close</Text></Pressable>
            </View>

            <Text style={s.lbl}>Machine</Text>
            <View style={s.optList}>
              {assets.map((a) => (
                <Pressable key={a.id} onPress={() => setNs({ ...ns, assetId: a.id })} style={[s.opt, ns.assetId === a.id && s.optOn]}>
                  <Text style={[s.optText, ns.assetId === a.id && s.optTextOn]}>{a.assetNumber} — {a.name}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={s.lbl}>How often</Text>
            <View style={s.optList}>
              {ServiceTypes.map((t) => (
                <Pressable key={t} onPress={() => setNs({ ...ns, serviceType: t })} style={[s.opt, ns.serviceType === t && s.optOn]}>
                  <Text style={[s.optText, ns.serviceType === t && s.optTextOn]}>{SERVICE_LABEL[t] ?? t}</Text>
                </Pressable>
              ))}
            </View>

            <TextInput style={s.input} value={ns.description} onChangeText={(v) => setNs({ ...ns, description: v })} placeholder="What the service covers" placeholderTextColor="#9AA6B3" />
            <TextInput style={s.input} value={ns.intervalHours} onChangeText={(v) => setNs({ ...ns, intervalHours: v })} placeholder="Run hours between services (optional)" placeholderTextColor="#9AA6B3" keyboardType="number-pad" />

            {error && <Text style={{ color: colors.crit, fontSize: 13, fontWeight: '600' }}>{error}</Text>}
            <Button title={busy ? 'Saving…' : 'Add to the schedule'} onPress={createSchedule} disabled={busy} />
          </ScrollView>
        </View>
      </View>
    </Modal>
    </>
  );
}
const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(11,27,48,.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.canvas, maxHeight: '90%', borderTopWidth: 3, borderTopColor: colors.hazard },
  sheetTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  sheetTitle: { fontSize: 19, fontWeight: '700', color: colors.ink, marginTop: 3 },
  close: { color: colors.navy700, fontWeight: '700', fontSize: 13 },
  lbl: { fontSize: 13, fontWeight: '600', color: colors.ink, marginTop: 4 },
  optList: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  opt: { paddingHorizontal: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.line },
  optOn: { backgroundColor: colors.navy100 },
  optText: { fontSize: 14, color: colors.ink },
  optTextOn: { fontWeight: '700', color: colors.navy800 },
  input: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15, color: colors.ink }, num: { fontFamily: 'Menlo', fontWeight: '700', color: colors.navy800 }, badge: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 }, title: { fontSize: 16, fontWeight: '700', color: colors.ink }, meta: { color: colors.muted, fontSize: 12 }, hm: { flex: 1, borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 9, color: colors.ink }, btn: { backgroundColor: colors.navy800, paddingHorizontal: 14, paddingVertical: 11 }, btnText: { color: '#fff', fontWeight: '700', fontSize: 13 } });
