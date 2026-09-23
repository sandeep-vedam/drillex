import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { can, type PermissionMatrix } from '@drillex/shared';
import { api, loadSession } from '../lib/api';
import { cached } from '../sync/cache';
import { Button, Card, Eyebrow, Field } from '../ui';
import { colors } from '../ui/theme';

type R = { id: string; title: string; periodStart: string; periodEnd: string; generatedAt: string; pdfUrl?: string; xlsxUrl?: string };
type ReportType = { type: string; title: string };
const iso = (d: Date) => d.toISOString().slice(0, 10);
const presets = (): [string, string, string][] => {
  const now = new Date(); const y = now.getFullYear(), m = now.getMonth();
  return [
    ['This month', iso(new Date(Date.UTC(y, m, 1))), iso(now)],
    ['Last month', iso(new Date(Date.UTC(y, m - 1, 1))), iso(new Date(Date.UTC(y, m, 0)))],
    ['7 days', iso(new Date(now.getTime() - 6 * 864e5)), iso(now)],
    ['90 days', iso(new Date(now.getTime() - 89 * 864e5)), iso(now)],
  ];
};

/** Report archive on mobile: view/share generated files, plus generate + email for whoever holds report:generate (SRS §8.1). */
export default function ReportsScreen() {
  const [rows, setRows] = useState<R[]>([]); const [refreshing, setRefreshing] = useState(false);
  const [types, setTypes] = useState<ReportType[]>([]); const [type, setType] = useState('');
  const [period, setPeriod] = useState(presets()[0]);
  const [canGenerate, setCanGenerate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [emailing, setEmailing] = useState<string | null>(null);
  const [emailTo, setEmailTo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => { try { const r = await cached('reports', () => api<R[]>('/reports')); setRows(r.data); } catch {} }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    Promise.all([loadSession(), cached('permissions', () => api<PermissionMatrix>('/roles/matrix'))]).then(([sess, m]) => {
      setCanGenerate(!!sess?.user.role && !!can(m.data, sess.user.role, 'report:generate'));
    }).catch(() => {});
    api<ReportType[]>('/reports/types').then((t) => { setTypes(t); setType((x) => x || t[0]?.type || ''); }).catch(() => {});
  }, []);

  async function generate() {
    if (!type) return;
    setBusy(true); setError(null);
    try {
      const r = await api<R>('/reports/generate', { method: 'POST', body: JSON.stringify({ type, from: period[1], to: period[2] }) });
      Alert.alert('Report generated', `${r.title} — PDF and Excel are in the archive below.`);
      load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function sendEmail(r: R) {
    const to = emailTo.split(',').map((s) => s.trim()).filter(Boolean);
    if (!to.length) return;
    try {
      const res = await api<{ delivered: boolean }>(`/reports/${r.id}/email`, { method: 'POST', body: JSON.stringify({ to }) });
      Alert.alert(res.delivered ? 'Email sent' : 'Email queued', res.delivered ? undefined : 'SMTP not configured on this server — logged only.');
      setEmailing(null); setEmailTo('');
    } catch (e) { setError((e as Error).message); }
  }

  return (
    <FlatList style={{ backgroundColor: colors.canvas }} contentContainerStyle={{ padding: 16, gap: 10 }} data={rows} keyExtractor={(r) => r.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 4 }}>
          {canGenerate && types.length > 0 && (
            <Card style={{ gap: 10 }}>
              <Eyebrow>Generate a report</Eyebrow>
              <View style={s.typeList}>
                {types.map((t) => (
                  <Pressable key={t.type} onPress={() => setType(t.type)} style={[s.typeRow, type === t.type && s.typeRowOn]}>
                    <Text style={[s.typeText, type === t.type && s.typeTextOn]}>{t.title}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {presets().map(([l, f, t]) => (
                  <Pressable key={l} onPress={() => setPeriod([l, f, t])} style={[s.presetBtn, period[0] === l && s.presetBtnOn]}>
                    <Text style={[s.presetText, period[0] === l && s.presetTextOn]}>{l}</Text>
                  </Pressable>
                ))}
              </View>
              {error && <Text style={s.err}>{error}</Text>}
              <Button title={busy ? 'Generating…' : 'Generate PDF + Excel'} onPress={generate} disabled={busy || !type} />
            </Card>
          )}
          <Eyebrow>Monthly &amp; custom reports</Eyebrow>
        </View>
      }
      ListEmptyComponent={<Card><Text style={{ color: colors.muted }}>No reports generated yet.</Text></Card>}
      renderItem={({ item }) => (
        <Card style={{ gap: 4 }}>
          <Text style={s.title}>{item.title}</Text>
          <Text style={s.meta}>{item.periodStart.slice(0, 10)} → {item.periodEnd.slice(0, 10)} · generated {new Date(item.generatedAt).toLocaleDateString()}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
            {item.pdfUrl && <Pressable style={s.btn} onPress={() => Linking.openURL(item.pdfUrl!)}><Text style={s.btnText}>Open PDF</Text></Pressable>}
            {item.xlsxUrl && <Pressable style={[s.btn, s.ghost]} onPress={() => Linking.openURL(item.xlsxUrl!)}><Text style={[s.btnText, { color: colors.navy800 }]}>Excel</Text></Pressable>}
            {canGenerate && <Pressable style={[s.btn, s.ghost]} onPress={() => { setEmailing(emailing === item.id ? null : item.id); setEmailTo(''); }}><Text style={[s.btnText, { color: colors.navy800 }]}>Email</Text></Pressable>}
          </View>
          {emailing === item.id && (
            <View style={{ gap: 8, marginTop: 4 }}>
              <Field label="Send to" hint="comma-separated" autoCapitalize="none" keyboardType="email-address" value={emailTo} onChangeText={setEmailTo} placeholder="ops@example.com" />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable style={s.btn} onPress={() => sendEmail(item)}><Text style={s.btnText}>Send</Text></Pressable>
                <Pressable style={[s.btn, s.ghost]} onPress={() => setEmailing(null)}><Text style={[s.btnText, { color: colors.navy800 }]}>Cancel</Text></Pressable>
              </View>
            </View>
          )}
        </Card>
      )} />
  );
}
const s = StyleSheet.create({
  title: { fontSize: 16, fontWeight: '700', color: colors.ink }, meta: { color: colors.muted, fontSize: 12 },
  btn: { backgroundColor: colors.navy800, paddingHorizontal: 14, paddingVertical: 9 }, ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.line },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  typeList: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  typeRow: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  typeRowOn: { backgroundColor: colors.navy100 },
  typeText: { fontSize: 13, color: colors.ink },
  typeTextOn: { fontWeight: '700', color: colors.navy800 },
  presetBtn: { borderWidth: 1, borderColor: colors.line, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.surface },
  presetBtnOn: { backgroundColor: colors.navy800, borderColor: colors.navy800 },
  presetText: { fontSize: 12, fontWeight: '700', color: colors.muted },
  presetTextOn: { color: '#fff' },
  err: { color: colors.crit, fontSize: 13, fontWeight: '600' },
});
