import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { JobCardSchema } from '@drillex/shared';
import { api } from '../lib/api';
import { cached } from '../sync/cache';
import { enqueue, uuid } from '../sync/outbox';
import { Button, Card, Eyebrow } from '../ui';
import { NumberField, Rating, Section, Segmented } from '../ui/form';
import { SignaturePad } from '../ui/SignaturePad';
import { PhotoPicker, Photo } from '../ui/PhotoPicker';
import { colors } from '../ui/theme';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'JobCardNew'>;
type Asset = { id: string; assetNumber: string; name: string }; type Part = { id: string; partNo: string; name: string; qtyOnHand: number };
const TYPES = [{ v: 'BREAKDOWN_REPAIR', l: 'Breakdown' }, { v: 'SCHEDULED_SERVICE', l: 'Service' }, { v: 'INSPECTION', l: 'Inspection' }, { v: 'MODIFICATION', l: 'Modification' }] as const;
const STATUSES = [{ v: 'OPEN', l: 'Open' }, { v: 'IN_PROGRESS', l: 'In progress' }, { v: 'AWAITING_PARTS', l: 'Await. parts' }, { v: 'COMPLETED', l: 'Completed' }] as const;

export default function JobCardNewScreen({ route, navigation }: Props) {
  const [assets, setAssets] = useState<Asset[]>([]); const [parts, setParts] = useState<Part[]>([]);
  const [assetId, setAssetId] = useState(route.params?.assetId ?? '');
  const [f, setF] = useState({ jobType: 'BREAKDOWN_REPAIR', reportedFault: '', workPerformed: '', hourMeter: '', labourHours: '', toolsUsed: '', conditionBefore: 0, conditionAfter: 0, testResult: '' as '' | 'PASSED' | 'FAILED' | 'PENDING', nextAction: '', status: 'OPEN' });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const [rows, setRows] = useState<{ partId: string; quantity: string }[]>([]);
  const [before, setBefore] = useState<Photo[]>([]); const [after, setAfter] = useState<Photo[]>([]);
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { cached('assets', () => api<Asset[]>('/assets')).then((r) => { setAssets(r.data); if (!assetId) setAssetId(r.data[0]?.id ?? ''); }).catch(() => {}); cached('parts', () => api<Part[]>('/parts')).then((r) => setParts(r.data)).catch(() => {}); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const asset = assets.find((a) => a.id === assetId);

  async function submit() {
    setError(null);
    const id = uuid(); const sigId = signature ? uuid() : undefined;
    const payload = { id, assetId, date: new Date().toISOString().slice(0, 10), jobType: f.jobType, reportedFault: f.reportedFault || undefined, workPerformed: f.workPerformed, hourMeter: f.hourMeter ? Number(f.hourMeter) : undefined, labourHours: f.labourHours ? Number(f.labourHours) : undefined, toolsUsed: f.toolsUsed || undefined, conditionBefore: f.conditionBefore || undefined, conditionAfter: f.conditionAfter || undefined, testResult: f.testResult || undefined, nextAction: f.nextAction || undefined, status: f.status, parts: rows.filter((r) => r.partId && Number(r.quantity) > 0).map((r) => ({ partId: r.partId, quantity: Number(r.quantity) })), techSignatureAttachmentId: sigId };
    const parsed = JobCardSchema.safeParse(payload);
    if (!parsed.success) { const i = parsed.error.issues[0]; setError(`${i.path.join('.') || 'Form'}: ${i.message}`); return; }
    if (f.status === 'COMPLETED' && !signature) { setError('Sign the job card before marking it completed.'); return; }
    setBusy(true);
    try {
      // Queue the record before its attachments: an attachment cannot be stored until its owner exists.
      await enqueue('job_card', payload, `${asset?.assetNumber} · job card (${f.jobType.toLowerCase().replace('_', ' ')})`);
      if (signature && sigId) await enqueue('attachment', { id: sigId, ownerType: 'JobCard', ownerId: id, kind: 'SIGNATURE', contentType: 'image/png', base64: signature.replace(/^data:image\/png;base64,/, '') }, `${asset?.assetNumber} · job card signature`);
      for (const p of [...before, ...after]) await enqueue('attachment', { id: uuid(), ownerType: 'JobCard', ownerId: id, kind: 'PHOTO', contentType: p.type, base64: p.base64 }, `${asset?.assetNumber} · job card photo`);
      Alert.alert('Job card saved', 'Saved on this device and will sync automatically. The machine is marked Under Maintenance while the job is open.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Card stripe={colors.hazard} style={{ paddingLeft: 18 }}><Eyebrow>New job card · {new Date().toLocaleDateString()}</Eyebrow><Text style={s.h}>{asset ? `${asset.assetNumber}` : 'Select machine'}</Text><Text style={{ color: colors.muted }}>{asset?.name ?? ''}</Text></Card>
        <Section title="Machine">
          <View style={s.chips}>{assets.map((a) => <Pressable key={a.id} onPress={() => setAssetId(a.id)} style={[s.chip, assetId === a.id && s.chipOn]}><Text style={[s.chipText, assetId === a.id && { color: '#fff' }]}>{a.assetNumber}</Text></Pressable>)}</View>
          <Segmented label="Job type" value={f.jobType} options={TYPES as never} onChange={(v) => set('jobType', v)} tone={(v) => (v === 'BREAKDOWN_REPAIR' ? colors.crit : colors.navy800)} />
        </Section>
        <Section title="Work">
          <TextInput style={s.area} value={f.reportedFault} onChangeText={(v) => set('reportedFault', v)} placeholder="Reported fault / work requested" placeholderTextColor="#9AA6B3" multiline />
          <TextInput style={[s.area, { minHeight: 100 }]} value={f.workPerformed} onChangeText={(v) => set('workPerformed', v)} placeholder="Work performed — what was done (required)" placeholderTextColor="#9AA6B3" multiline />
          <View style={{ flexDirection: 'row', gap: 10 }}><NumberField label="Hour meter" value={f.hourMeter} onChange={(v) => set('hourMeter', v)} unit="h" /><NumberField label="Labour hours" value={f.labourHours} onChange={(v) => set('labourHours', v)} unit="h" /></View>
          <TextInput style={s.input} value={f.toolsUsed} onChangeText={(v) => set('toolsUsed', v)} placeholder="Special tools used" placeholderTextColor="#9AA6B3" />
        </Section>
        <Section title="Parts replaced / used">
          {rows.map((r, i) => (
            <Card key={i} style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ fontWeight: '700', color: colors.navy800 }}>Part {i + 1}</Text><Pressable onPress={() => setRows((x) => x.filter((_, j) => j !== i))}><Text style={{ color: colors.crit, fontWeight: '700' }}>Remove</Text></Pressable></View>
              <View style={s.chips}>{parts.map((p) => <Pressable key={p.id} onPress={() => setRows((x) => x.map((y, j) => (j === i ? { ...y, partId: p.id } : y)))} style={[s.chip, r.partId === p.id && s.chipOn]}><Text style={[s.chipText, r.partId === p.id && { color: '#fff' }]}>{p.partNo} <Text style={{ fontWeight: '400' }}>({p.qtyOnHand})</Text></Text></Pressable>)}</View>
              <NumberField label="Quantity" value={r.quantity} onChange={(v) => setRows((x) => x.map((y, j) => (j === i ? { ...y, quantity: v } : y)))} />
            </Card>
          ))}
          <Button title="+ Add part" onPress={() => setRows((x) => [...x, { partId: parts[0]?.id ?? '', quantity: '1' }])} variant="ghost" />
        </Section>
        <Section title="Condition & test">
          <Text style={s.label}>Condition before</Text><Rating value={f.conditionBefore} onChange={(v) => set('conditionBefore', v)} />
          <Text style={s.label}>Condition after</Text><Rating value={f.conditionAfter} onChange={(v) => set('conditionAfter', v)} />
          <Segmented label="Test / inspection after work" value={f.testResult} options={[{ v: '', l: '—' }, { v: 'PASSED', l: 'Passed' }, { v: 'FAILED', l: 'Failed' }, { v: 'PENDING', l: 'Pending' }]} onChange={(v) => set('testResult', v)} tone={(v) => (v === 'PASSED' ? colors.ok : v === 'FAILED' ? colors.crit : colors.navy800)} />
          <TextInput style={s.area} value={f.nextAction} onChangeText={(v) => set('nextAction', v)} placeholder="Next action required (follow-up work)" placeholderTextColor="#9AA6B3" multiline />
        </Section>
        <Section title="Photos & sign-off">
          <PhotoPicker photos={before} onChange={setBefore} max={5} label="Before photos" /><PhotoPicker photos={after} onChange={setAfter} max={5} label="After photos" />
          <SignaturePad value={signature} onChange={setSignature} label="Technician signature" />
          <Segmented label="Job status" value={f.status} options={STATUSES as never} onChange={(v) => set('status', v)} tone={(v) => (v === 'COMPLETED' ? colors.ok : v === 'AWAITING_PARTS' ? colors.warn : colors.navy800)} />
        </Section>
        {error && <Text style={s.err}>{error}</Text>}
        <Button title={busy ? 'Saving…' : 'Save job card'} onPress={submit} disabled={busy || !assetId} />
        <Text style={s.help}>Works offline. Completed job cards go to the supervisor for approval; parts are deducted from inventory.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const s = StyleSheet.create({
  h: { fontFamily: 'Menlo', fontSize: 24, fontWeight: '800', color: colors.navy800, marginTop: 4 }, label: { fontSize: 13, fontWeight: '600', color: colors.ink },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16, color: colors.ink },
  area: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, padding: 12, minHeight: 64, textAlignVertical: 'top', color: colors.ink, fontSize: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, chip: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 7 }, chipOn: { backgroundColor: colors.navy800, borderColor: colors.navy800 }, chipText: { fontSize: 13, fontWeight: '600', color: colors.ink, fontFamily: 'Menlo' },
  err: { color: colors.crit, borderLeftWidth: 2, borderLeftColor: colors.crit, paddingLeft: 10 }, help: { color: colors.muted, fontSize: 12, textAlign: 'center' },
});
