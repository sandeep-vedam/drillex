import React, { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ShiftReportSchema, totalMetersDrilled } from '@drillex/shared';
import { api } from '../lib/api';
import { enqueue, uuid } from '../sync/outbox';
import { cached } from '../sync/cache';
import { SignaturePad } from '../ui/SignaturePad';
import type { RootStackParamList } from '../navigation';
import { Button, Card, Eyebrow } from '../ui';
import { NumberField, Section, Segmented } from '../ui/form';
import { colors } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ShiftReport'>;
type Chemical = { id: string; name: string; defaultUnit: 'LITRES' | 'KG' | 'BAGS' };
type Row = { key: number; chemicalId: string; quantity: string; unit: 'LITRES' | 'KG' | 'BAGS'; purpose: string; stockOnHand: string };
const ROCK = ['Granite', 'Basalt', 'Sandstone', 'Limestone', 'Shale', 'Quartzite', 'Other'];
const DOWNTIME = ['None', 'Mechanical breakdown', 'Waiting on blast', 'Weather', 'No water / fuel', 'Operator break', 'Other'];
let rowKey = 1;

export default function ShiftReportScreen({ route, navigation }: Props) {
  const { assetId, assetNumber, assetName, siteId } = route.params;
  const [chems, setChems] = useState<Chemical[]>([]);
  const [f, setF] = useState({ shift: (new Date().getHours() >= 6 && new Date().getHours() < 18 ? 'DAY' : 'NIGHT') as 'DAY' | 'NIGHT', holeRef: '', startDepth: '', endDepth: '', holesCompleted: '', holeDiameterMm: '', rockType: 'Granite', rockOther: '', penetrationRate: '', downtimeHours: '0', downtimeReason: 'None', downtimeOther: '' });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  useEffect(() => { cached('chemicals', () => api<Chemical[]>('/chemicals')).then((r) => setChems(r.data)).catch(() => {}); }, []);

  const total = useMemo(() => (f.startDepth && f.endDepth ? totalMetersDrilled(Number(f.startDepth), Number(f.endDepth)) : null), [f.startDepth, f.endDepth]);
  const depthBad = f.startDepth !== '' && f.endDepth !== '' && Number(f.endDepth) < Number(f.startDepth);
  const addRow = () => { const c = chems[0]; setRows((r) => [...r, { key: rowKey++, chemicalId: c?.id ?? '', quantity: '', unit: c?.defaultUnit ?? 'LITRES', purpose: '', stockOnHand: '' }]); };
  const setRow = (k: number, patch: Partial<Row>) => setRows((r) => r.map((x) => (x.key === k ? { ...x, ...patch } : x)));

  async function submit() {
    setError(null);
    const reportId = uuid(); const sigId = signature ? uuid() : undefined;
    const payload = {
      id: reportId, signatureAttachmentId: sigId, assetId, siteId, date: new Date().toISOString().slice(0, 10), shift: f.shift, holeRef: f.holeRef,
      startDepth: Number(f.startDepth), endDepth: Number(f.endDepth), holesCompleted: Number(f.holesCompleted), holeDiameterMm: Number(f.holeDiameterMm),
      rockType: f.rockType === 'Other' ? f.rockOther : f.rockType, penetrationRate: Number(f.penetrationRate), downtimeHours: Number(f.downtimeHours || 0),
      downtimeReason: f.downtimeReason === 'None' ? undefined : f.downtimeReason === 'Other' ? f.downtimeOther : f.downtimeReason,
      chemicals: rows.filter((r) => r.chemicalId && r.quantity !== '').map((r) => ({ chemicalId: r.chemicalId, quantity: Number(r.quantity), unit: r.unit, purpose: r.purpose || undefined, stockOnHand: r.stockOnHand === '' ? undefined : Number(r.stockOnHand) })),
    };
    const parsed = ShiftReportSchema.safeParse(payload);
    if (!parsed.success) { const i = parsed.error.issues[0]; setError(`${i.path.join('.') || 'Form'}: ${i.message}`); return; }
    if (!signature) { setError('Please sign the report.'); return; }
    setBusy(true);
    try {
      // Queue the record before its attachments: an attachment cannot be stored until its owner exists.
      await enqueue('shift_report', payload, `${assetNumber} · ${f.shift.toLowerCase()} shift ${payload.date}`);
      await enqueue('attachment', { id: sigId, ownerType: 'ShiftReport', ownerId: reportId, kind: 'SIGNATURE', contentType: 'image/png', base64: signature.replace(/^data:image\/png;base64,/, '') }, `${assetNumber} · signature`);
      Alert.alert('Shift report saved', `${total ?? 0} m recorded. It will sync and your supervisor will be asked to approve it.`, [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Card stripe={colors.hazard} style={{ paddingLeft: 18 }}>
          <Eyebrow>Shift production · {new Date().toLocaleDateString()}</Eyebrow>
          <Text style={s.asset}>{assetNumber}</Text><Text style={s.assetName}>{assetName}</Text>
        </Card>
        <Segmented label="Shift" value={f.shift} options={[{ v: 'DAY', l: '☀ Day' }, { v: 'NIGHT', l: '☾ Night' }]} onChange={(v) => set('shift', v)} tone={(v) => (v === 'DAY' ? colors.warn : colors.navy800)} />

        <Section title="Production">
          <View style={{ gap: 6 }}><Text style={s.label}>Hole ID / blast block reference</Text><TextInput style={s.text} value={f.holeRef} onChangeText={(v) => set('holeRef', v)} placeholder="e.g. BB-14 / H-203" placeholderTextColor="#9AA6B3" autoCapitalize="characters" /></View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <NumberField label="Start depth" value={f.startDepth} onChange={(v) => set('startDepth', v)} unit="m" />
            <NumberField label="End depth" value={f.endDepth} onChange={(v) => set('endDepth', v)} unit="m" />
          </View>
          {depthBad ? <Text style={s.bad}>End depth must be greater than or equal to start depth.</Text> : total !== null && <Text style={s.calc}>Total meters drilled (auto): <Text style={{ fontWeight: '800', color: colors.ink }}>{total} m</Text></Text>}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <NumberField label="Holes completed" value={f.holesCompleted} onChange={(v) => set('holesCompleted', v)} />
            <NumberField label="Hole diameter" value={f.holeDiameterMm} onChange={(v) => set('holeDiameterMm', v)} unit="mm" />
            <NumberField label="Penetration" value={f.penetrationRate} onChange={(v) => set('penetrationRate', v)} unit="m/h" />
          </View>
          <View style={{ gap: 6 }}><Text style={s.label}>Rock type / formation</Text><View style={s.chips}>{ROCK.map((r) => <Pressable key={r} onPress={() => set('rockType', r)} style={[s.chip, f.rockType === r && s.chipOn]}><Text style={[s.chipText, f.rockType === r && { color: '#fff' }]}>{r}</Text></Pressable>)}</View>
            {f.rockType === 'Other' && <TextInput style={s.text} value={f.rockOther} onChangeText={(v) => set('rockOther', v)} placeholder="Describe formation" placeholderTextColor="#9AA6B3" />}</View>
        </Section>

        <Section title="Downtime">
          <NumberField label="Downtime" value={f.downtimeHours} onChange={(v) => set('downtimeHours', v)} unit="hours" />
          {Number(f.downtimeHours) > 0 && <View style={{ gap: 6 }}><Text style={s.label}>Reason</Text><View style={s.chips}>{DOWNTIME.filter((d) => d !== 'None').map((r) => <Pressable key={r} onPress={() => set('downtimeReason', r)} style={[s.chip, f.downtimeReason === r && { backgroundColor: colors.hazard, borderColor: colors.hazard }]}><Text style={[s.chipText, f.downtimeReason === r && { color: '#fff' }]}>{r}</Text></Pressable>)}</View>
            {f.downtimeReason === 'Other' && <TextInput style={s.text} value={f.downtimeOther} onChangeText={(v) => set('downtimeOther', v)} placeholder="Describe" placeholderTextColor="#9AA6B3" />}</View>}
        </Section>

        <Section title="Chemicals used">
          {rows.map((r, i) => (
            <Card key={r.key} style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={s.rowTitle}>Entry {i + 1}</Text><Pressable onPress={() => setRows((x) => x.filter((y) => y.key !== r.key))} hitSlop={8}><Text style={{ color: colors.crit, fontWeight: '700' }}>Remove</Text></Pressable></View>
              <View style={s.chips}>{chems.map((c) => <Pressable key={c.id} onPress={() => setRow(r.key, { chemicalId: c.id, unit: c.defaultUnit })} style={[s.chip, r.chemicalId === c.id && s.chipOn]}><Text style={[s.chipText, r.chemicalId === c.id && { color: '#fff' }]}>{c.name}</Text></Pressable>)}</View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <NumberField label="Quantity used" value={r.quantity} onChange={(v) => setRow(r.key, { quantity: v })} unit={r.unit.toLowerCase()} />
                <NumberField label="Stock on hand" value={r.stockOnHand} onChange={(v) => setRow(r.key, { stockOnHand: v })} unit={r.unit.toLowerCase()} placeholder="—" />
              </View>
              <Segmented label="Unit" value={r.unit} options={[{ v: 'LITRES', l: 'Litres' }, { v: 'KG', l: 'kg' }, { v: 'BAGS', l: 'Bags' }]} onChange={(v) => setRow(r.key, { unit: v })} />
              <TextInput style={s.text} value={r.purpose} onChangeText={(v) => setRow(r.key, { purpose: v })} placeholder="Purpose / application" placeholderTextColor="#9AA6B3" />
            </Card>
          ))}
          <Button title="+ Add chemical row" onPress={addRow} variant="ghost" />
        </Section>

        <Section title="Sign-off"><SignaturePad value={signature} onChange={setSignature} /></Section>
        {error && <Text style={s.err}>{error}</Text>}
        <Button title={busy ? 'Saving…' : 'Sign & submit shift report'} onPress={submit} disabled={busy || depthBad} />
        <Text style={s.help}>Works offline — saved on this device and synced when you have signal. Submission is final; corrections require a supervisor unlock and are audit-logged.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const s = StyleSheet.create({
  asset: { fontFamily: 'Menlo', fontSize: 24, fontWeight: '800', color: colors.navy800, marginTop: 4 }, assetName: { color: colors.muted },
  label: { fontSize: 13, fontWeight: '600', color: colors.ink },
  text: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16, color: colors.ink },
  calc: { color: colors.muted, fontSize: 13 }, bad: { color: colors.crit, fontSize: 13, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 7 },
  chipOn: { backgroundColor: colors.navy800, borderColor: colors.navy800 },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.ink },
  rowTitle: { fontWeight: '700', color: colors.navy800 },
  err: { color: colors.crit, borderLeftWidth: 2, borderLeftColor: colors.crit, paddingLeft: 10 },
  help: { color: colors.muted, fontSize: 12, textAlign: 'center' },
});
