import React, { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { DailyReadingSchema, readingAlerts, fuelConsumed, DEFAULT_ALERT_THRESHOLD } from '@drillex/shared';
import { api } from '../lib/api';
import { cached } from '../sync/cache';
import { enqueue, uuid } from '../sync/outbox';
import { SignaturePad } from '../ui/SignaturePad';
import { PhotoPicker, Photo } from '../ui/PhotoPicker';
import type { RootStackParamList } from '../navigation';
import { Button, Card, Eyebrow } from '../ui';
import { NumberField, Rating, Section, Segmented, Toggle } from '../ui/form';
import { colors } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'DailyReading'>;
const LEVELS = [{ v: 'OK', l: 'OK' }, { v: 'LOW', l: 'Low' }, { v: 'ADD', l: 'Add' }, { v: 'CHANGE_REQUIRED', l: 'Change' }] as const;
const levelTone = (v: string) => (v === 'OK' ? colors.ok : v === 'CHANGE_REQUIRED' ? colors.crit : colors.hazard);
const TYRES = ['FL', 'FR', 'RL', 'RR'];

export default function DailyReadingScreen({ route, navigation }: Props) {
  const { assetId, assetNumber, assetName } = route.params;
  const [f, setF] = useState({
    hourMeter: '', fuelStart: '', fuelEnd: '', engineOil: 'OK', hydraulicOil: 'OK', coolant: 'OK', airFilter: 'OK', battery: 'OK',
    tyres: Object.fromEntries(TYRES.map((t) => [t, ''])) as Record<string, string>,
    warningLights: false, warningLightsNote: '', unusualNoises: false, unusualNoisesNote: '', leaks: false, leaksNote: '',
    preStartChecklistDone: false, conditionRating: 0, notes: '',
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);

  const consumed = useMemo(() => (f.fuelStart && f.fuelEnd ? fuelConsumed(Number(f.fuelStart), Number(f.fuelEnd)) : null), [f.fuelStart, f.fuelEnd]);
  // The server decides; this mirrors its admin-configured threshold (SRS §5.3) so the preview tells the operator the same thing.
  const [threshold, setThreshold] = useState(DEFAULT_ALERT_THRESHOLD);
  useEffect(() => { cached('settings.operations', () => api<{ readingAlertThreshold: number }>('/settings/operations')).then((r) => setThreshold(r.data.readingAlertThreshold)).catch(() => {}); }, []);
  const alerts = readingAlerts({ warningLights: f.warningLights, leaks: f.leaks, unusualNoises: f.unusualNoises, conditionRating: f.conditionRating || 5 }, threshold);

  async function submit() {
    setError(null);
    const readingId = uuid(); const sigId = signature ? uuid() : undefined;
    const payload = {
      id: readingId, assetId, date: new Date().toISOString().slice(0, 10), signatureAttachmentId: sigId,
      hourMeter: Number(f.hourMeter), fuelStart: Number(f.fuelStart), fuelEnd: Number(f.fuelEnd),
      engineOil: f.engineOil, hydraulicOil: f.hydraulicOil, coolant: f.coolant, airFilter: f.airFilter, battery: f.battery,
      tyrePressures: Object.fromEntries(Object.entries(f.tyres).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)])),
      warningLights: f.warningLights, warningLightsNote: f.warningLightsNote || undefined,
      unusualNoises: f.unusualNoises, unusualNoisesNote: f.unusualNoisesNote || undefined,
      leaks: f.leaks, leaksNote: f.leaksNote || undefined,
      preStartChecklistDone: f.preStartChecklistDone, conditionRating: f.conditionRating, notes: f.notes || undefined,
    };
    const parsed = DailyReadingSchema.safeParse(payload);
    if (!parsed.success) { const first = parsed.error.issues[0]; setError(`${first.path.join('.') || 'Form'}: ${first.message}`); return; }
    if (!f.hourMeter || !f.fuelStart || !f.fuelEnd) { setError('Hour meter and fuel levels are required.'); return; }
    if (!f.conditionRating) { setError('Please rate the machine condition.'); return; }
    if (!signature) { setError('Please sign the reading.'); return; }
    setBusy(true);
    try {
      // Attachments first, then the record — all idempotent by client UUID; synced in order when online.
      // Queue the record before its attachments: an attachment cannot be stored until its owner exists.
      await enqueue('daily_reading', payload, `${assetNumber} · daily reading ${payload.date}`);
      await enqueue('attachment', { id: sigId, ownerType: 'DailyReading', ownerId: readingId, kind: 'SIGNATURE', contentType: 'image/png', base64: signature.replace(/^data:image\/png;base64,/, '') }, `${assetNumber} · signature`);
      for (const p of photos) await enqueue('attachment', { id: uuid(), ownerType: 'DailyReading', ownerId: readingId, kind: 'PHOTO', contentType: p.type, base64: p.base64 }, `${assetNumber} · photo`);
      Alert.alert('Reading saved', alerts.length ? `Supervisor and maintenance will be alerted (${alerts.length} flag${alerts.length > 1 ? 's' : ''}). It will sync automatically.` : 'Saved on this device and will sync automatically.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Card stripe={colors.navy700} style={{ paddingLeft: 18 }}>
          <Eyebrow>Daily readings · {new Date().toLocaleDateString()}</Eyebrow>
          <Text style={s.asset}>{assetNumber}</Text><Text style={s.assetName}>{assetName}</Text>
        </Card>

        <Section title="Meters & fuel">
          <NumberField label="Hour meter / odometer" value={f.hourMeter} onChange={(v) => set('hourMeter', v)} unit="h" />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <NumberField label="Fuel start of day" value={f.fuelStart} onChange={(v) => set('fuelStart', v)} unit="L / %" />
            <NumberField label="Fuel end of day" value={f.fuelEnd} onChange={(v) => set('fuelEnd', v)} unit="L / %" />
          </View>
          {consumed !== null && <Text style={s.calc}>Fuel consumed (auto): <Text style={{ fontWeight: '800', color: colors.ink }}>{consumed}</Text></Text>}
        </Section>

        <Section title="Fluids & filters">
          <Segmented label="Engine oil" value={f.engineOil} options={LEVELS as never} onChange={(v) => set('engineOil', v)} tone={levelTone} />
          <Segmented label="Hydraulic oil" value={f.hydraulicOil} options={LEVELS as never} onChange={(v) => set('hydraulicOil', v)} tone={levelTone} />
          <Segmented label="Coolant" value={f.coolant} options={LEVELS as never} onChange={(v) => set('coolant', v)} tone={levelTone} />
          <Segmented label="Air filter" value={f.airFilter} options={[{ v: 'OK', l: 'OK' }, { v: 'BLOCKED', l: 'Blocked' }, { v: 'CHANGED', l: 'Changed' }]} onChange={(v) => set('airFilter', v)} tone={(v) => (v === 'BLOCKED' ? colors.crit : colors.ok)} />
          <Segmented label="Battery" value={f.battery} options={[{ v: 'OK', l: 'OK' }, { v: 'WEAK', l: 'Weak' }, { v: 'FLAT', l: 'Flat' }]} onChange={(v) => set('battery', v)} tone={(v) => (v === 'OK' ? colors.ok : v === 'WEAK' ? colors.hazard : colors.crit)} />
        </Section>

        <Section title="Tyre pressures">
          <View style={{ flexDirection: 'row', gap: 8 }}>{TYRES.map((t) => <NumberField key={t} label={t} value={f.tyres[t]} onChange={(v) => set('tyres', { ...f.tyres, [t]: v })} unit="psi" placeholder="—" />)}</View>
        </Section>

        <Section title="Issues">
          <Toggle label="Warning lights active" value={f.warningLights} onChange={(v) => set('warningLights', v)} note={f.warningLightsNote} onNote={(v) => set('warningLightsNote', v)} notePlaceholder="Which lights?" />
          <Toggle label="Unusual noises or vibrations" value={f.unusualNoises} onChange={(v) => set('unusualNoises', v)} note={f.unusualNoisesNote} onNote={(v) => set('unusualNoisesNote', v)} />
          <Toggle label="Leaks observed" value={f.leaks} onChange={(v) => set('leaks', v)} note={f.leaksNote} onNote={(v) => set('leaksNote', v)} notePlaceholder="Location and fluid type" />
          <Toggle label="Pre-start checklist completed" value={f.preStartChecklistDone} onChange={(v) => set('preStartChecklistDone', v)} />
        </Section>

        <Section title="Condition">
          <Rating value={f.conditionRating} onChange={(v) => set('conditionRating', v)} />
          <TextInput style={s.notes} value={f.notes} onChangeText={(v) => set('notes', v)} placeholder="Operator notes / observations" placeholderTextColor="#9AA6B3" multiline />
        </Section>

        <Section title="Photos & sign-off">
          <PhotoPicker photos={photos} onChange={setPhotos} max={5} label="Photos of any issues" />
          <SignaturePad value={signature} onChange={setSignature} />
        </Section>

        {alerts.length > 0 && <View style={s.alertBox}><Text style={s.alertTitle}>This reading will alert the supervisor &amp; maintenance team</Text><Text style={s.alertBody}>{alerts.join(' · ').replace(/_/g, ' ').toLowerCase()}</Text></View>}
        {error && <Text style={s.err}>{error}</Text>}
        <Button title={busy ? 'Submitting…' : 'Sign & submit reading'} onPress={submit} disabled={busy} />
        <Text style={s.help}>Works offline — saved on this device and synced when you have signal. Submission is final; edits require a supervisor unlock.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const s = StyleSheet.create({
  asset: { fontFamily: 'Menlo', fontSize: 24, fontWeight: '800', color: colors.navy800, marginTop: 4 }, assetName: { color: colors.muted },
  calc: { color: colors.muted, fontSize: 13 },
  notes: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 12, minHeight: 80, textAlignVertical: 'top', color: colors.ink },
  alertBox: { borderLeftWidth: 4, borderLeftColor: colors.crit, backgroundColor: '#C2342A12', padding: 12 },
  alertTitle: { fontWeight: '700', color: colors.crit }, alertBody: { color: colors.ink, fontSize: 13, marginTop: 2, textTransform: 'capitalize' },
  err: { color: colors.crit, borderLeftWidth: 2, borderLeftColor: colors.crit, paddingLeft: 10 },
  help: { color: colors.muted, fontSize: 12, textAlign: 'center' },
});
