import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  BitConditions, BrakeFluidLevels, CHECK_LABELS, CheckLevels, CRITICAL_ANSWERS, criticalChecks, DailyReadingSchema, dailyFormFor, DEFAULT_ALERT_THRESHOLD,
  machineUsage, OkFaulty, readingAlerts, TrackConditions, TyreConditions, WARN_ANSWERS, WearConditions,
} from '@drillex/shared';
import { api } from '../lib/api';
import { cached } from '../sync/cache';
import { enqueue, uuid } from '../sync/outbox';
import { SignaturePad } from '../ui/SignaturePad';
import { PhotoPicker, Photo } from '../ui/PhotoPicker';
import { SupervisorModePanel, useSupervisorMode } from '../ui/SupervisorMode';
import type { RootStackParamList } from '../navigation';
import { Button, Card, Eyebrow } from '../ui';
import { NumberField, Rating, Section, Segmented, Toggle } from '../ui/form';
import { colors } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'DailyReading'>;

const LABEL: Record<string, string> = { OK: 'OK', LOW: 'Low', CRITICAL: 'Critical', GOOD: 'Good', FAIR: 'Fair', DAMAGED: 'Damaged', WORN: 'Worn', FLAT: 'Flat', NA: 'N/A', FAULTY: 'Faulty' };
const opts = <T extends string>(list: readonly T[]) => list.map((v) => ({ v, l: LABEL[v] ?? v }));
/** Same rule the server alerts on: Critical / Damaged / Faulty / Flat in red, Low / Fair / Worn in amber. */
const tone = (v: string) => (CRITICAL_ANSWERS.includes(v) ? colors.crit : WARN_ANSWERS.includes(v) ? colors.hazard : v === 'NA' ? colors.steel : colors.ok);

/** Drilling rig condition check (client spec §4A tab 3). */
const RIG_ITEMS = [
  { k: 'engineOil', list: CheckLevels }, { k: 'hydraulicOil', list: CheckLevels }, { k: 'coolant', list: CheckLevels },
  { k: 'gearOil', list: CheckLevels }, { k: 'flushPump', list: CheckLevels }, { k: 'rodCondition', list: WearConditions }, { k: 'bitCondition', list: BitConditions },
] as const;
/** Plant machine readings (client spec §4B tab 2). */
const PLANT_ITEMS = [
  { k: 'coolant', list: CheckLevels }, { k: 'engineOil', list: CheckLevels }, { k: 'gearOil', list: CheckLevels }, { k: 'hydraulicOil', list: CheckLevels },
  { k: 'brakeFluid', list: BrakeFluidLevels }, { k: 'fuelLevel', list: CheckLevels }, { k: 'trackCondition', list: TrackConditions }, { k: 'tyreCondition', list: TyreConditions },
  { k: 'attachmentCondition', list: WearConditions }, { k: 'lights', list: OkFaulty }, { k: 'brakes', list: OkFaulty },
] as const;
const PLANT_HINT: Record<string, string> = { trackCondition: 'Tracked machines', tyreCondition: 'Wheeled machines' };

export default function DailyReadingScreen({ route, navigation }: Props) {
  const { assetId, assetNumber, assetName, category } = route.params;
  const form = dailyFormFor(category ?? 'OTHER');
  const tracked = category === 'EXCAVATOR';
  const items = form === 'RIG' ? RIG_ITEMS : PLANT_ITEMS;
  const [checks, setChecks] = useState<Record<string, string>>(() => Object.fromEntries(items.map((i) => [i.k, i.list[0]])) as Record<string, string>);
  useEffect(() => {
    // A tracked machine has no tyres and a wheeled one no tracks, so start each on the answer that applies.
    if (form === 'PLANT') setChecks((c) => ({ ...c, trackCondition: tracked ? 'GOOD' : 'NA', tyreCondition: tracked ? 'NA' : 'GOOD' }));
  }, [form, tracked]);
  const [f, setF] = useState({ startReading: '', endReading: '', fuelAdded: '', faults: '', warningLights: false, warningLightsNote: '', unusualNoises: false, unusualNoisesNote: '', leaks: false, leaksNote: '', conditionRating: 0 });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const sup = useSupervisorMode(assetId, 'daily_reading:create');

  const readingBad = f.startReading !== '' && f.endReading !== '' && Number(f.endReading) < Number(f.startReading);
  const usage = f.startReading !== '' && f.endReading !== '' && !readingBad ? machineUsage(Number(f.startReading), Number(f.endReading)) : null;
  // The server decides; this mirrors its admin-configured threshold (SRS §5.3) so the preview tells the operator the same thing.
  const [threshold, setThreshold] = useState(DEFAULT_ALERT_THRESHOLD);
  useEffect(() => { cached('settings.operations', () => api<{ readingAlertThreshold: number }>('/settings/operations')).then((r) => setThreshold(r.data.readingAlertThreshold)).catch(() => {}); }, []);
  const alerts = readingAlerts({ ...checks, warningLights: f.warningLights, leaks: f.leaks, unusualNoises: f.unusualNoises, conditionRating: f.conditionRating || 5 }, threshold);
  const critical = criticalChecks(checks);
  const title = form === 'RIG' ? 'Rig condition check' : 'Daily machine readings';

  async function submit() {
    setError(null);
    const supProblem = sup.problem();
    if (supProblem) { setError(supProblem); return; }
    if (form === 'PLANT' && (f.startReading === '' || f.endReading === '')) { setError('Enter the start and end reading.'); return; }
    if (!f.conditionRating) { setError(`Please rate the ${form === 'RIG' ? 'rig' : 'machine'} condition.`); return; }
    const readingId = uuid(); const sigId = signature ? uuid() : undefined;
    const payload = {
      id: readingId, assetId, date: new Date().toISOString().slice(0, 10), signatureAttachmentId: sigId, formType: form, ...checks,
      ...(form === 'PLANT' ? { startReading: Number(f.startReading), endReading: Number(f.endReading), fuelAdded: f.fuelAdded === '' ? undefined : Number(f.fuelAdded) } : {}),
      faults: f.faults.trim() || undefined,
      warningLights: f.warningLights, warningLightsNote: f.warningLightsNote || undefined,
      unusualNoises: f.unusualNoises, unusualNoisesNote: f.unusualNoisesNote || undefined,
      leaks: f.leaks, leaksNote: f.leaksNote || undefined,
      conditionRating: f.conditionRating,
      ...sup.payload(),
    };
    const parsed = DailyReadingSchema.safeParse(payload);
    if (!parsed.success) { const first = parsed.error.issues[0]; setError(`${first.path.join('.') || 'Form'}: ${first.message}`); return; }
    if (!signature) { setError('Please sign to confirm.'); return; }
    setBusy(true);
    const forWhom = sup.on ? ` for ${sup.operatorLabel()}` : '';
    try {
      // Queue the record before its attachments: an attachment cannot be stored until its owner exists. All idempotent by client UUID.
      await enqueue('daily_reading', payload, `${assetNumber} · ${title.toLowerCase()} ${payload.date}${forWhom}`);
      await enqueue('attachment', { id: sigId, ownerType: 'DailyReading', ownerId: readingId, kind: 'SIGNATURE', contentType: 'image/png', base64: signature.replace(/^data:image\/png;base64,/, '') }, `${assetNumber} · signature`);
      for (const p of photos) await enqueue('attachment', { id: uuid(), ownerType: 'DailyReading', ownerId: readingId, kind: 'PHOTO', contentType: p.type, base64: p.base64 }, `${assetNumber} · photo`);
      Alert.alert(`${title} saved`, alerts.length ? `Supervisor and maintenance will be alerted (${alerts.length} flag${alerts.length > 1 ? 's' : ''}). It will sync automatically.` : 'Saved on this device and will sync automatically.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Card stripe={sup.on ? colors.supervisor : colors.navy700} style={{ paddingLeft: 18 }}>
          <Eyebrow>{title} · {new Date().toLocaleDateString()}</Eyebrow>
          <Text style={s.asset}>{assetNumber}</Text><Text style={s.assetName}>{assetName}</Text>
        </Card>

        <SupervisorModePanel state={sup} />

        {form === 'PLANT' && (
          <Section title="Meter">
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <NumberField label="Start reading" value={f.startReading} onChange={(v) => set('startReading', v)} unit="h / km" />
              <NumberField label="End reading" value={f.endReading} onChange={(v) => set('endReading', v)} unit="h / km" />
            </View>
            {readingBad ? <Text style={s.bad}>End reading must be greater than or equal to start reading.</Text>
              : <View style={s.calcCell}><Text style={s.calcLabel}>Hours / distance this shift</Text><Text style={s.calcValue}>{usage ?? '—'}</Text></View>}
          </Section>
        )}

        <Section title={form === 'RIG' ? 'Rig checks' : 'Machine checks'}>
          {items.map((i) => (
            <Segmented key={i.k} label={form === 'PLANT' && PLANT_HINT[i.k] ? `${CHECK_LABELS[i.k]} (${PLANT_HINT[i.k].toLowerCase()})` : CHECK_LABELS[i.k]}
              value={checks[i.k]} options={opts(i.list as readonly string[])} onChange={(v) => setChecks((c) => ({ ...c, [i.k]: v }))} tone={tone} />
          ))}
        </Section>

        {form === 'PLANT' && (
          <Section title="Fuel"><NumberField label="Fuel added" value={f.fuelAdded} onChange={(v) => set('fuelAdded', v)} unit="litres" placeholder="—" /></Section>
        )}

        <Section title="Issues">
          <Toggle label="Warning lights active" value={f.warningLights} onChange={(v) => set('warningLights', v)} note={f.warningLightsNote} onNote={(v) => set('warningLightsNote', v)} notePlaceholder="Which lights?" />
          <Toggle label="Unusual noises or vibrations" value={f.unusualNoises} onChange={(v) => set('unusualNoises', v)} note={f.unusualNoisesNote} onNote={(v) => set('unusualNoisesNote', v)} />
          <Toggle label="Leaks observed" value={f.leaks} onChange={(v) => set('leaks', v)} note={f.leaksNote} onNote={(v) => set('leaksNote', v)} notePlaceholder="Location and fluid type" />
        </Section>

        <Section title="Condition">
          <Rating value={f.conditionRating} onChange={(v) => set('conditionRating', v)} />
          <TextInput style={s.notes} value={f.faults} onChangeText={(v) => set('faults', v)} placeholder={form === 'RIG' ? 'Faults / defects noted' : 'Faults reported'} placeholderTextColor="#9AA6B3" multiline />
        </Section>

        <Section title="Photos & sign-off">
          <PhotoPicker photos={photos} onChange={setPhotos} max={5} label="Photos of any issues" />
          <SignaturePad value={signature} onChange={setSignature} />
        </Section>

        {alerts.length > 0 && <View style={s.alertBox}><Text style={s.alertTitle}>This will alert the supervisor &amp; maintenance team</Text><Text style={s.alertBody}>{alerts.map((a) => (a === 'CRITICAL_CHECK' ? `critical: ${critical.join(', ').toLowerCase()}` : a.replace(/_/g, ' ').toLowerCase())).join(' · ')}</Text></View>}
        {error && <Text style={s.err}>{error}</Text>}
        <Button title={busy ? 'Submitting…' : sup.on ? 'Sign & submit for operator' : 'Sign & confirm'} onPress={submit} disabled={busy || readingBad} />
        <Text style={s.help}>Works offline — saved on this device and synced when you have signal. Submission is final; edits require a supervisor unlock.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const s = StyleSheet.create({
  asset: { fontFamily: 'Menlo', fontSize: 24, fontWeight: '800', color: colors.navy800, marginTop: 4 }, assetName: { color: colors.muted },
  calcCell: { backgroundColor: colors.navy100, paddingHorizontal: 12, paddingVertical: 8 },
  calcLabel: { fontSize: 11, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.8 },
  calcValue: { fontSize: 18, fontWeight: '800', color: colors.ink, fontVariant: ['tabular-nums'] },
  bad: { color: colors.crit, fontSize: 13, fontWeight: '600' },
  notes: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 12, minHeight: 80, textAlignVertical: 'top', color: colors.ink },
  alertBox: { borderLeftWidth: 4, borderLeftColor: colors.crit, backgroundColor: '#C2342A12', padding: 12 },
  alertTitle: { fontWeight: '700', color: colors.crit }, alertBody: { color: colors.ink, fontSize: 13, marginTop: 2 },
  err: { color: colors.crit, borderLeftWidth: 2, borderLeftColor: colors.crit, paddingLeft: 10 },
  help: { color: colors.muted, fontSize: 12, textAlign: 'center' },
});
