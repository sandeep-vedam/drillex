import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { OperationsSettings } from '@drillex/shared';
import { api } from '../lib/api';
import { Button, Eyebrow } from '../ui';
import { Segmented } from '../ui/form';
import { colors } from '../ui/theme';

/** Admin policy: when a machine check raises a maintenance review (SRS §5.3) and whether repairs need sign-off (SRS §7.6). */
export default function OperationsSettingsScreen() {
  const [v, setV] = useState<OperationsSettings | null>(null);
  const [saved, setSaved] = useState<OperationsSettings | null>(null);
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { api<OperationsSettings>('/settings/operations').then((r) => { setV(r); setSaved(r); }).catch((e) => setError((e as Error).message)); }, []);

  async function save() {
    if (!v) return;
    setBusy(true); setError(null);
    try { const r = await api<OperationsSettings>('/settings/operations', { method: 'PATCH', body: JSON.stringify(v) }); setV(r); setSaved(r); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const dirty = !!v && JSON.stringify(v) !== JSON.stringify(saved);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48, backgroundColor: colors.canvas }}>
      <Eyebrow>Operations</Eyebrow>
      {error && <Text style={s.err}>{error}</Text>}
      {!v && !error && <Text style={{ color: colors.muted }}>Loading…</Text>}
      {v && (
        <>
          <Segmented label="Raise a maintenance review when a machine check is rated at or below" value={String(v.readingAlertThreshold)} options={['1', '2', '3', '4', '5'].map((n) => ({ v: n, l: `${n} ★` }))} onChange={(n) => setV({ ...v, readingAlertThreshold: Number(n) })} />
          <Text style={s.help}>Warning lights, leaks and unusual noises always raise an alert.</Text>
          <Pressable onPress={() => setV({ ...v, jobCardApprovalRequired: !v.jobCardApprovalRequired })} style={s.row} accessibilityRole="checkbox" accessibilityState={{ checked: v.jobCardApprovalRequired }}>
            <View style={[s.box, v.jobCardApprovalRequired && { backgroundColor: colors.navy800, borderColor: colors.navy800 }]}>{v.jobCardApprovalRequired && <Text style={s.tick}>✓</Text>}</View>
            <View style={{ flex: 1 }}><Text style={s.label}>Completed job cards need supervisor approval</Text><Text style={s.help}>When on, a machine stays under maintenance until its completed job card is approved.</Text></View>
          </Pressable>
          <Button title={busy ? 'Saving…' : 'Save'} onPress={save} disabled={busy || !dirty} />
        </>
      )}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  err: { color: colors.crit, fontSize: 13, fontWeight: '600' }, help: { color: colors.muted, fontSize: 12 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 12 },
  box: { width: 20, height: 20, marginTop: 2, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  tick: { color: '#fff', fontSize: 13, fontWeight: '800', lineHeight: 16 }, label: { fontSize: 14, fontWeight: '700', color: colors.ink },
});
