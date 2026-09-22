import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AssetCategories, AssetPrefix, type AssetCategory } from '@drillex/shared';
import { api } from '../lib/api';
import type { RootStackParamList } from '../navigation';
import { Button, Field } from '../ui';
import { Section, Segmented } from '../ui/form';
import { colors } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'AssetNew'>;
type Opt = { id: string; name: string; employeeId?: string };

const today = () => new Date().toISOString().slice(0, 10);
const CATEGORY_LABEL: Record<AssetCategory, string> = { DRILLING: 'Drilling', HAULAGE: 'Haulage', COMPRESSOR: 'Compressor', ANCILLARY: 'Ancillary', OTHER: 'Other' };

export default function AssetNewScreen({ navigation }: Props) {
  const [sites, setSites] = useState<Opt[]>([]);
  const [ops, setOps] = useState<Opt[]>([]);
  const [f, setF] = useState({
    name: '', category: 'DRILLING' as AssetCategory, make: '', model: '', serialNumber: '',
    yearOfManufacture: String(new Date().getFullYear()), commissionedAt: today(), siteId: '', operatorIds: [] as string[], notes: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    api<Opt[]>('/sites').then((s) => { setSites(s); setF((x) => ({ ...x, siteId: x.siteId || s[0]?.id || '' })); }).catch(() => {});
    api<Opt[]>('/users/lookup?role=OPERATOR').then(setOps).catch(() => {});
  }, []);

  function validate() {
    const year = Number(f.yearOfManufacture);
    if (f.name.trim().length < 1) return 'Give the asset a name.';
    if (!f.make.trim() || !f.model.trim()) return 'Make and model are both required.';
    if (!f.serialNumber.trim()) return 'Serial number is required.';
    if (!Number.isInteger(year) || year < 1950 || year > 2100) return 'Year of manufacture must be between 1950 and 2100.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.commissionedAt)) return 'Commissioned date must look like 2026-09-22.';
    if (!f.siteId) return 'Pick a site.';
    if (!f.operatorIds.length) return 'Assign at least one operator — only assigned operators can log against this machine.';
    return null;
  }

  /**
   * Posted straight to the API rather than queued in the outbox: the asset number is assigned server-side and
   * never reused, so it cannot be handed out offline. Needs a connection.
   */
  async function submit() {
    const bad = validate();
    if (bad) { setError(bad); return; }
    setBusy(true); setError(null);
    try {
      const created = await api<{ assetNumber: string }>('/assets', {
        method: 'POST',
        body: JSON.stringify({ ...f, yearOfManufacture: Number(f.yearOfManufacture), notes: f.notes.trim() || undefined }),
      });
      Alert.alert('Asset registered', `${created.assetNumber} · ${f.name}`, [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Text style={s.lead}>The number is assigned automatically as <Text style={s.mono}>{AssetPrefix[f.category]}-###</Text> and can never change.</Text>

        <Section title="Machine">
          <Field label="Asset name" placeholder="Drill Rig #3" value={f.name} onChangeText={(v) => set('name', v)} />
          <Segmented label="Category" value={f.category} options={AssetCategories.map((c) => ({ v: c, l: CATEGORY_LABEL[c] }))} onChange={(v) => set('category', v)} />
          <Field label="Make" placeholder="Sandvik" value={f.make} onChangeText={(v) => set('make', v)} />
          <Field label="Model" placeholder="DP1500i" value={f.model} onChangeText={(v) => set('model', v)} />
          <Field label="Serial number" autoCapitalize="characters" value={f.serialNumber} onChangeText={(v) => set('serialNumber', v)} />
          <Field label="Year of manufacture" keyboardType="number-pad" value={f.yearOfManufacture} onChangeText={(v) => set('yearOfManufacture', v)} />
          <Field label="Date commissioned" hint="YYYY-MM-DD" placeholder={today()} value={f.commissionedAt} onChangeText={(v) => set('commissionedAt', v)} />
          {sites.length > 1 && <Segmented label="Site" value={f.siteId} options={sites.map((x) => ({ v: x.id, l: x.name }))} onChange={(v) => set('siteId', v)} />}
        </Section>

        <Section title="Assigned operators">
          <Text style={s.hint}>Only these employees can submit readings or shift reports for this machine.</Text>
          <View style={s.list}>
            {ops.map((o) => {
              const on = f.operatorIds.includes(o.id);
              return (
                <Pressable key={o.id} onPress={() => set('operatorIds', on ? f.operatorIds.filter((x) => x !== o.id) : [...f.operatorIds, o.id])} style={[s.opRow, on && { backgroundColor: colors.navy100 }]}>
                  <View style={[s.box, on && { backgroundColor: colors.navy800, borderColor: colors.navy800 }]}>{on && <Text style={s.tick}>✓</Text>}</View>
                  <Text style={s.opId}>{o.employeeId}</Text>
                  <Text style={s.opName}>{o.name}</Text>
                </Pressable>
              );
            })}
            {!ops.length && <Text style={s.empty}>No operators found. Create one in the web app first.</Text>}
          </View>
        </Section>

        <Section title="Notes">
          <Field label="Notes" placeholder="Anything worth recording" multiline value={f.notes} onChangeText={(v) => set('notes', v)} />
        </Section>

        {error && <Text style={s.err}>{error}</Text>}
        <Button title={busy ? 'Registering…' : 'Register asset'} onPress={submit} disabled={busy} />
        <Text style={s.hint}>Needs a connection — unlike readings, this one cannot be queued offline.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  lead: { color: colors.muted, fontSize: 13 },
  mono: { fontFamily: 'Menlo', color: colors.ink },
  hint: { color: colors.muted, fontSize: 12 },
  list: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  opRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  box: { width: 20, height: 20, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  tick: { color: '#fff', fontSize: 13, fontWeight: '800', lineHeight: 16 },
  opId: { fontFamily: 'Menlo', fontSize: 13, color: colors.navy800, fontWeight: '700' },
  opName: { color: colors.muted, fontSize: 14 },
  empty: { padding: 12, color: colors.muted, fontSize: 13 },
  err: { color: colors.crit, fontSize: 13, fontWeight: '600' },
});
