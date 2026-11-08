import React, { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BitSizeHoleMm, BitSizes, ChemicalUnitLabel, ChemicalUnits, engineHours, penetrationRate, ShiftReportSchema, totalMetersDrilled, type ChemicalUnit } from '@drillex/shared';
import { api } from '../lib/api';
import { enqueue, uuid } from '../sync/outbox';
import { cached } from '../sync/cache';
import { SignaturePad } from '../ui/SignaturePad';
import { SupervisorModePanel, useSupervisorMode } from '../ui/SupervisorMode';
import type { RootStackParamList } from '../navigation';
import { Button, Card, Eyebrow } from '../ui';
import { NumberField, Section, Segmented } from '../ui/form';
import { colors } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ShiftReport'>;
type Chemical = { id: string; name: string; defaultUnit: ChemicalUnit };
type Row = { key: number; name: string; quantity: string; unit: ChemicalUnit; purpose: string; stockOnHand: string };
const ROCK = ['Granite', 'Basalt', 'Sandstone', 'Limestone', 'Shale', 'Quartzite', 'Other'];
const DOWNTIME = ['None', 'Mechanical breakdown', 'Waiting on blast', 'Weather', 'No water / fuel', 'Operator break', 'Other'];
const BIT_OPTIONS = [...BitSizes, 'Other'] as const;
/** Pre-filled on a new report (client spec §9.1) — a quantity still has to be entered for a line to be sent. */
const DEFAULT_CHEMICALS: { name: string; unit: ChemicalUnit }[] = [{ name: 'Drilling Foam HDF-200', unit: 'LITRES' }, { name: 'Dust Suppressant', unit: 'LITRES' }];
let rowKey = 1;
const newRow = (name = '', unit: ChemicalUnit = 'LITRES'): Row => ({ key: rowKey++, name, quantity: '', unit, purpose: '', stockOnHand: '' });
type ExistingReport = {
  userId: string; date: string; siteId: string; shift: 'DAY' | 'NIGHT'; holeRef: string; startDepth: string; endDepth: string; holesCompleted: number; holeDiameterMm: string; rockType: string;
  startHourMeter: string | null; endHourMeter: string | null; bitNumber: string | null; bitSize: string | null; remarks: string | null;
  downtimeHours: string | null; downtimeReason: string | null; user: { employeeId: string; name: string };
  chemicals: { name: string | null; chemical: { name: string } | null; quantity: string; unit: ChemicalUnit; purpose: string | null; stockOnHand: string | null }[];
};
const num = (v: string | null | undefined) => (v == null ? '' : String(Number(v)));

export default function ShiftReportScreen({ route, navigation }: Props) {
  const { assetId, assetNumber, assetName, siteId, correctId } = route.params;
  // Correcting an unlocked report (SRS §4.5): the same form, filled from the report, resubmitted in place.
  const [original, setOriginal] = useState<{ date: string; siteId: string; userId: string; operator: string } | null>(null);
  const [chems, setChems] = useState<Chemical[]>([]);
  const [meter, setMeter] = useState<{ lastEndMeter: number | null; cumulativeHours: number } | null>(null);
  const [f, setF] = useState({
    shift: (new Date().getHours() >= 6 && new Date().getHours() < 18 ? 'DAY' : 'NIGHT') as 'DAY' | 'NIGHT',
    startHourMeter: '', endHourMeter: '', holeRef: '', bitNumber: '', bitSize: '' as string, startDepth: '', endDepth: '', holesCompleted: '', holeDiameterMm: '',
    rockType: 'Granite', rockOther: '', downtimeHours: '0', downtimeReason: 'None', downtimeOther: '', remarks: '',
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const [rows, setRows] = useState<Row[]>(() => (correctId ? [] : DEFAULT_CHEMICALS.map((c) => newRow(c.name, c.unit))));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const sup = useSupervisorMode(assetId, 'shift_report:create');

  useEffect(() => { cached('chemicals', () => api<Chemical[]>('/chemicals')).then((r) => setChems(r.data)).catch(() => {}); }, []);
  // Where this shift starts and the running total so far (client spec §4A). Offline it falls back to the last value seen.
  useEffect(() => {
    cached(`meter.${assetId}`, () => api<{ lastEndMeter: number | null; cumulativeHours: number }>(`/shift-reports/meter?assetId=${assetId}`))
      .then((r) => { setMeter(r.data); if (!correctId && r.data.lastEndMeter != null) setF((x) => (x.startHourMeter ? x : { ...x, startHourMeter: String(r.data.lastEndMeter) })); })
      .catch(() => {});
  }, [assetId, correctId]);
  useEffect(() => {
    if (!correctId) return;
    api<ExistingReport>(`/shift-reports/${correctId}`).then((r) => {
      const known = (list: readonly string[], v: string | null) => (v == null ? null : list.includes(v) ? v : 'Other');
      const rock = known(ROCK, r.rockType) ?? 'Granite'; const down = known(DOWNTIME, r.downtimeReason) ?? 'None';
      setOriginal({ date: r.date.slice(0, 10), siteId: r.siteId, userId: r.userId, operator: r.user.employeeId });
      setF({ shift: r.shift, startHourMeter: num(r.startHourMeter), endHourMeter: num(r.endHourMeter), holeRef: r.holeRef, bitNumber: r.bitNumber ?? '', bitSize: r.bitSize ?? '',
        startDepth: num(r.startDepth), endDepth: num(r.endDepth), holesCompleted: String(r.holesCompleted), holeDiameterMm: num(r.holeDiameterMm), rockType: rock, rockOther: rock === 'Other' ? r.rockType : '',
        downtimeHours: num(r.downtimeHours ?? '0'), downtimeReason: down, downtimeOther: down === 'Other' ? r.downtimeReason ?? '' : '', remarks: r.remarks ?? '' });
      setRows(r.chemicals.map((c) => ({ key: rowKey++, name: c.name ?? c.chemical?.name ?? '', quantity: num(c.quantity), unit: c.unit, purpose: c.purpose ?? '', stockOnHand: num(c.stockOnHand) })));
    }).catch((e) => setError(`Could not load the report: ${(e as Error).message}`));
  }, [correctId]);

  const total = useMemo(() => (f.startDepth && f.endDepth ? totalMetersDrilled(Number(f.startDepth), Number(f.endDepth)) : null), [f.startDepth, f.endDepth]);
  const depthBad = f.startDepth !== '' && f.endDepth !== '' && Number(f.endDepth) < Number(f.startDepth);
  const meterBad = f.startHourMeter !== '' && f.endHourMeter !== '' && Number(f.endHourMeter) < Number(f.startHourMeter);
  const hours = f.startHourMeter !== '' && f.endHourMeter !== '' && !meterBad ? engineHours(Number(f.startHourMeter), Number(f.endHourMeter)) : null;
  // A correction's own hours are already inside the server's running total, so only a new report adds to it.
  const cumulative = meter ? Math.round((meter.cumulativeHours + (correctId ? 0 : hours ?? 0)) * 10) / 10 : null;
  const pen = total !== null && hours !== null ? penetrationRate(total, hours) : null;
  const setRow = (k: number, patch: Partial<Row>) => setRows((r) => r.map((x) => (x.key === k ? { ...x, ...patch } : x)));
  const pickBit = (b: string) => setF((x) => ({ ...x, bitSize: b, holeDiameterMm: b in BitSizeHoleMm ? String(BitSizeHoleMm[b as keyof typeof BitSizeHoleMm]) : x.holeDiameterMm }));
  const bitChoice = f.bitSize === '' ? '' : (BitSizes as readonly string[]).includes(f.bitSize) ? f.bitSize : 'Other';
  // Correcting someone else's report needs a reason, like entering it for them (client spec §9.3).
  const correctingForOperator = !!correctId && !!original && !!sup.selfId && original.userId !== sup.selfId;

  async function submit() {
    setError(null);
    if (correctId && !original) { setError('The report is still loading.'); return; }
    const supProblem = correctId ? (correctingForOperator && sup.reason.trim().length < 3 ? 'Give the reason for the supervisor entry.' : null) : sup.problem();
    if (supProblem) { setError(supProblem); return; }
    if (f.startHourMeter === '' || f.endHourMeter === '') { setError('Enter the start and end hour meter.'); return; }
    const reportId = correctId ?? uuid(); const sigId = signature ? uuid() : undefined;
    const payload = {
      ...(correctId ? {} : { id: reportId }), signatureAttachmentId: sigId, assetId, siteId: original?.siteId ?? siteId, date: original?.date ?? new Date().toISOString().slice(0, 10), shift: f.shift,
      startHourMeter: Number(f.startHourMeter), endHourMeter: Number(f.endHourMeter),
      holeRef: f.holeRef, bitNumber: f.bitNumber.trim() || undefined, bitSize: f.bitSize.trim() || undefined,
      startDepth: Number(f.startDepth), endDepth: Number(f.endDepth), holesCompleted: Number(f.holesCompleted), holeDiameterMm: Number(f.holeDiameterMm),
      rockType: f.rockType === 'Other' ? f.rockOther : f.rockType, downtimeHours: Number(f.downtimeHours || 0),
      downtimeReason: f.downtimeReason === 'None' ? undefined : f.downtimeReason === 'Other' ? f.downtimeOther : f.downtimeReason,
      remarks: f.remarks.trim() || undefined,
      chemicals: rows.filter((r) => r.name.trim() && r.quantity !== '').map((r) => ({ name: r.name.trim(), quantity: Number(r.quantity), unit: r.unit, purpose: r.purpose || undefined, stockOnHand: r.stockOnHand === '' ? undefined : Number(r.stockOnHand) })),
      ...(correctId ? (correctingForOperator ? { supervisorReason: sup.reason.trim() } : {}) : sup.payload()),
    };
    const parsed = ShiftReportSchema.safeParse(payload);
    if (!parsed.success) { const i = parsed.error.issues[0]; setError(`${i.path.join('.') || 'Form'}: ${i.message}`); return; }
    if (!signature) { setError('Please sign the report.'); return; }
    setBusy(true);
    const forWhom = sup.on && !correctId ? ` for ${sup.operatorLabel()}` : '';
    if (correctId) {
      // A correction edits a report already on the server, so it goes straight there rather than through the offline queue.
      try {
        await api('/attachments', { method: 'POST', body: JSON.stringify({ id: sigId, ownerType: 'ShiftReport', ownerId: correctId, kind: 'SIGNATURE', contentType: 'image/png', base64: signature.replace(/^data:image\/png;base64,/, '') }) });
        await api(`/shift-reports/${correctId}`, { method: 'PATCH', body: JSON.stringify(payload) });
        Alert.alert('Correction sent', `${total ?? 0} m recorded. It will be approved again.`, [{ text: 'OK', onPress: () => navigation.goBack() }]);
      } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
      return;
    }
    try {
      // Queue the record before its attachments: an attachment cannot be stored until its owner exists.
      await enqueue('shift_report', payload, `${assetNumber} · ${f.shift.toLowerCase()} shift ${payload.date}${forWhom}`);
      await enqueue('attachment', { id: sigId, ownerType: 'ShiftReport', ownerId: reportId, kind: 'SIGNATURE', contentType: 'image/png', base64: signature.replace(/^data:image\/png;base64,/, '') }, `${assetNumber} · signature`);
      Alert.alert('Shift report saved', `${total ?? 0} m recorded${forWhom}. It will sync and be sent for approval.`, [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Card stripe={sup.on ? colors.supervisor : colors.hazard} style={{ paddingLeft: 18 }}>
          <Eyebrow>{correctId ? `Correction · ${original ? new Date(original.date).toLocaleDateString() : '…'}` : `Shift production · ${new Date().toLocaleDateString()}`}</Eyebrow>
          <Text style={s.asset}>{assetNumber}</Text><Text style={s.assetName}>{assetName}</Text>
          {correctId && original && <Text style={s.assetName}>Operator: {original.operator}</Text>}
        </Card>

        {correctId ? (correctingForOperator && (
          <View style={{ gap: 10 }}>
            <View style={s.banner}><Text style={s.bannerText}>SUPERVISOR MODE — Correcting on behalf of {original?.operator}</Text></View>
            <View style={s.reasonBox}><Text style={s.label}>Reason for Supervisor Entry <Text style={{ color: colors.crit }}>*</Text></Text>
              <TextInput style={s.multi} value={sup.reason} onChangeText={sup.setReason} placeholder="Why you are correcting this report" placeholderTextColor="#9AA6B3" multiline /></View>
          </View>
        )) : <SupervisorModePanel state={sup} />}

        <Segmented label="Shift" value={f.shift} options={[{ v: 'DAY', l: '☀ Day' }, { v: 'NIGHT', l: '☾ Night' }]} onChange={(v) => set('shift', v)} tone={(v) => (v === 'DAY' ? colors.warn : colors.navy800)} />

        <Section title="Engine hours">
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <NumberField label="Start meter" value={f.startHourMeter} onChange={(v) => set('startHourMeter', v)} unit="h" />
            <NumberField label="End meter" value={f.endHourMeter} onChange={(v) => set('endHourMeter', v)} unit="h" />
          </View>
          {meterBad ? <Text style={s.bad}>End meter must be greater than or equal to start meter.</Text> : (
            <View style={s.calcRow}>
              <View style={s.calcCell}><Text style={s.calcLabel}>This shift</Text><Text style={s.calcValue}>{hours ?? '—'} h</Text></View>
              <View style={s.calcCell}><Text style={s.calcLabel}>Cumulative</Text><Text style={s.calcValue}>{cumulative ?? '—'} h</Text></View>
            </View>
          )}
        </Section>

        <Section title="Drilling production">
          <View style={{ gap: 6 }}><Text style={s.label}>Hole ID / drill string</Text><TextInput style={s.text} value={f.holeRef} onChangeText={(v) => set('holeRef', v)} placeholder="e.g. BB-14 / H-203" placeholderTextColor="#9AA6B3" autoCapitalize="characters" /></View>
          <View style={{ gap: 6 }}><Text style={s.label}>Bit number</Text><TextInput style={s.text} value={f.bitNumber} onChangeText={(v) => set('bitNumber', v)} placeholder="e.g. BT-042" placeholderTextColor="#9AA6B3" autoCapitalize="characters" /></View>
          <View style={{ gap: 6 }}><Text style={s.label}>Bit size</Text>
            <View style={s.chips}>{BIT_OPTIONS.map((b) => <Pressable key={b} onPress={() => (b === 'Other' ? set('bitSize', bitChoice === 'Other' ? f.bitSize : 'Other') : pickBit(b))} style={[s.chip, bitChoice === b && s.chipOn]}><Text style={[s.chipText, bitChoice === b && { color: '#fff' }]}>{b}</Text></Pressable>)}</View>
            {bitChoice === 'Other' && <TextInput style={s.text} value={f.bitSize === 'Other' ? '' : f.bitSize} onChangeText={(v) => set('bitSize', v || 'Other')} placeholder="Bit size, e.g. 165 mm RC" placeholderTextColor="#9AA6B3" />}
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <NumberField label="Depth start" value={f.startDepth} onChange={(v) => set('startDepth', v)} unit="m" />
            <NumberField label="Depth end" value={f.endDepth} onChange={(v) => set('endDepth', v)} unit="m" />
          </View>
          {depthBad ? <Text style={s.bad}>End depth must be greater than or equal to start depth.</Text> : (
            <View style={s.calcRow}>
              <View style={s.calcCell}><Text style={s.calcLabel}>Metres drilled</Text><Text style={s.calcValue}>{total ?? '—'} m</Text></View>
              <View style={s.calcCell}><Text style={s.calcLabel}>Penetration rate</Text><Text style={s.calcValue}>{pen ?? '—'} m/h</Text></View>
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <NumberField label="Holes completed" value={f.holesCompleted} onChange={(v) => set('holesCompleted', v)} />
            <NumberField label="Hole diameter" value={f.holeDiameterMm} onChange={(v) => set('holeDiameterMm', v)} unit="mm" />
          </View>
          <View style={{ gap: 6 }}><Text style={s.label}>Rock type / formation</Text><View style={s.chips}>{ROCK.map((r) => <Pressable key={r} onPress={() => set('rockType', r)} style={[s.chip, f.rockType === r && s.chipOn]}><Text style={[s.chipText, f.rockType === r && { color: '#fff' }]}>{r}</Text></Pressable>)}</View>
            {f.rockType === 'Other' && <TextInput style={s.text} value={f.rockOther} onChangeText={(v) => set('rockOther', v)} placeholder="Describe formation" placeholderTextColor="#9AA6B3" />}</View>
        </Section>

        <Section title="Downtime">
          <NumberField label="Downtime" value={f.downtimeHours} onChange={(v) => set('downtimeHours', v)} unit="hours" />
          {Number(f.downtimeHours) > 0 && <View style={{ gap: 6 }}><Text style={s.label}>Reason</Text><View style={s.chips}>{DOWNTIME.filter((d) => d !== 'None').map((r) => <Pressable key={r} onPress={() => set('downtimeReason', r)} style={[s.chip, f.downtimeReason === r && { backgroundColor: colors.hazard, borderColor: colors.hazard }]}><Text style={[s.chipText, f.downtimeReason === r && { color: '#fff' }]}>{r}</Text></Pressable>)}</View>
            {f.downtimeReason === 'Other' && <TextInput style={s.text} value={f.downtimeOther} onChangeText={(v) => set('downtimeOther', v)} placeholder="Describe" placeholderTextColor="#9AA6B3" />}</View>}
        </Section>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
          <Text style={s.section}>Polymers &amp; chemicals</Text>
          <View style={s.badge}><Text style={s.badgeText}>{rows.length} {rows.length === 1 ? 'item' : 'items'}</Text></View>
        </View>
        {rows.map((r, i) => (
          <Card key={r.key} style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={s.rowTitle}>Entry {i + 1}</Text><Pressable onPress={() => setRows((x) => x.filter((y) => y.key !== r.key))} hitSlop={8}><Text style={{ color: colors.crit, fontWeight: '700' }}>Remove</Text></Pressable></View>
            <View style={{ gap: 6 }}><Text style={s.label}>Chemical / polymer name</Text>
              <TextInput style={s.text} value={r.name} onChangeText={(v) => setRow(r.key, { name: v })} placeholder="e.g. Bentonite, CAP 21" placeholderTextColor="#9AA6B3" />
              {!r.name.trim() && chems.length > 0 && <View style={s.chips}>{chems.map((c) => <Pressable key={c.id} onPress={() => setRow(r.key, { name: c.name, unit: c.defaultUnit })} style={s.chip}><Text style={s.chipText}>{c.name}</Text></Pressable>)}</View>}
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <NumberField label="Quantity used" value={r.quantity} onChange={(v) => setRow(r.key, { quantity: v })} unit={ChemicalUnitLabel[r.unit]} />
              <NumberField label="Stock on hand" value={r.stockOnHand} onChange={(v) => setRow(r.key, { stockOnHand: v })} unit={ChemicalUnitLabel[r.unit]} placeholder="—" />
            </View>
            <Segmented label="Unit" value={r.unit} options={ChemicalUnits.map((u) => ({ v: u, l: ChemicalUnitLabel[u] }))} onChange={(v) => setRow(r.key, { unit: v })} />
            <TextInput style={s.text} value={r.purpose} onChangeText={(v) => setRow(r.key, { purpose: v })} placeholder="Purpose / application" placeholderTextColor="#9AA6B3" />
          </Card>
        ))}
        <Button title="+ Add chemical" onPress={() => setRows((x) => [...x, newRow()])} variant="ghost" />

        <Section title="Shift remarks">
          <TextInput style={s.multi} value={f.remarks} onChangeText={(v) => set('remarks', v)} placeholder="Anything the next shift or the office should know" placeholderTextColor="#9AA6B3" multiline />
        </Section>

        <Section title="Sign-off"><SignaturePad value={signature} onChange={setSignature} /></Section>
        {error && <Text style={s.err}>{error}</Text>}
        <Button title={busy ? 'Saving…' : correctId ? 'Sign & resubmit' : sup.on ? 'Sign & submit for operator' : 'Sign & submit shift report'} onPress={submit} disabled={busy || depthBad || meterBad || (!!correctId && !original)} />
        <Text style={s.help}>Works offline — saved on this device and synced when you have signal. Submission is final; corrections require a supervisor unlock and are audit-logged.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const s = StyleSheet.create({
  asset: { fontFamily: 'Menlo', fontSize: 24, fontWeight: '800', color: colors.navy800, marginTop: 4 }, assetName: { color: colors.muted },
  section: { fontSize: 11, fontWeight: '700', letterSpacing: 1.6, textTransform: 'uppercase', color: colors.muted },
  label: { fontSize: 13, fontWeight: '600', color: colors.ink },
  text: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16, color: colors.ink },
  multi: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 12, minHeight: 88, textAlignVertical: 'top', color: colors.ink, fontSize: 15 },
  calcRow: { flexDirection: 'row', gap: 10 },
  calcCell: { flex: 1, backgroundColor: colors.navy100, paddingHorizontal: 12, paddingVertical: 8 },
  calcLabel: { fontSize: 11, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.8 },
  calcValue: { fontSize: 18, fontWeight: '800', color: colors.ink, fontVariant: ['tabular-nums'] },
  bad: { color: colors.crit, fontSize: 13, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 7 },
  chipOn: { backgroundColor: colors.navy800, borderColor: colors.navy800 },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.ink },
  badge: { backgroundColor: colors.navy800, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  rowTitle: { fontWeight: '700', color: colors.navy800 },
  banner: { backgroundColor: colors.supervisor, paddingVertical: 10, paddingHorizontal: 12 },
  bannerText: { color: colors.ink, fontWeight: '800', letterSpacing: 0.5, fontSize: 13 },
  reasonBox: { gap: 8, backgroundColor: colors.surface, padding: 12, borderWidth: 2, borderColor: colors.supervisor },
  err: { color: colors.crit, borderLeftWidth: 2, borderLeftColor: colors.crit, paddingLeft: 10 },
  help: { color: colors.muted, fontSize: 12, textAlign: 'center' },
});
