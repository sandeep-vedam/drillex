import React, { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { DaysWorkedSchema, WorkShiftLabel, WorkShifts } from '@drillex/shared';
import { api } from '../lib/api';
import { cached } from '../sync/cache';
import { fmtDate, iso, isoDay, isPlant, loadAccess, saveOrQueue, type Access, type Deployment } from '../lib/finance';
import type { RootStackParamList } from '../navigation';
import { Button, Card, Eyebrow, Field } from '../ui';
import { NumberField, Segmented } from '../ui/form';
import { DateField, Picker, Rejected, TextArea } from '../ui/finance';
import { colors } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'DaysWorkedForm'>;

/** Days worked (spec §11.3 tab 2): one record per machine per shift per day, for billing. Works offline. */
export default function DaysWorkedFormScreen({ navigation, route }: Props) {
  const initial = route.params?.initial;
  const [access, setAccess] = useState<Access | null>(null);
  const [deps, setDeps] = useState<Deployment[]>([]);
  const [operators, setOperators] = useState<{ employeeId: string; name: string }[]>([]);
  const [f, setF] = useState(() => initial
    ? { deploymentId: initial.deploymentId, workDate: iso(initial.workDate), shift: initial.shift as string, hoursWorked: String(Number(initial.hoursWorked)), standbyHours: String(Number(initial.standbyHours)), operatorEmployeeId: initial.operatorEmployeeId, billable: initial.billable, productionNotes: initial.productionNotes ?? '' }
    : { deploymentId: '', workDate: isoDay(), shift: 'FULL_DAY', hoursWorked: '', standbyHours: '0', operatorEmployeeId: '', billable: true, productionNotes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    loadAccess().then((a) => {
      setAccess(a);
      // Cached so a supervisor out of signal can still pick the machine on hire.
      cached('finance.deployments.active', () => api<Deployment[]>('/finance/deployments?active=1'))
        .then((r) => setDeps(a.plantOnly ? r.data.filter((d) => isPlant(d.asset.category)) : r.data)).catch(() => {});
    }).catch(() => {});
    cached('finance.operators', () => api<{ employeeId: string; name: string }[]>('/users/lookup?role=OPERATOR')).then((r) => setOperators(r.data)).catch(() => {});
  }, []);
  const dep = deps.find((d) => d.id === f.deploymentId) ?? (initial?.deploymentId === f.deploymentId ? initial?.deployment : undefined);
  const opMatches = useMemo(() => {
    const q = f.operatorEmployeeId.trim().toUpperCase();
    return operators.filter((o) => !q || (o.employeeId.includes(q) && o.employeeId !== q) || o.name.toUpperCase().includes(q)).slice(0, 6);
  }, [f.operatorEmployeeId, operators]);

  async function save() {
    setError(null);
    const body = { deploymentId: f.deploymentId, workDate: f.workDate, shift: f.shift, hoursWorked: Number(f.hoursWorked), standbyHours: Number(f.standbyHours || 0), operatorEmployeeId: f.operatorEmployeeId.trim().toUpperCase(), billable: f.billable, productionNotes: f.productionNotes.trim() || undefined };
    if (!body.deploymentId) { setError('Choose the machine on hire.'); return; }
    if (f.hoursWorked === '') { setError('Enter the hours worked.'); return; }
    if (f.workDate > isoDay()) { setError('The date cannot be in the future.'); return; }
    if (dep && f.workDate < iso(dep.startDate)) { setError(`This machine went on hire on ${fmtDate(dep.startDate)}.`); return; }
    const parsed = DaysWorkedSchema.safeParse(body);
    if (!parsed.success) { const i = parsed.error.issues[0]; setError(`${LABEL[String(i.path[0])] ?? String(i.path[0])}: ${i.message}`); return; }
    setBusy(true);
    try {
      const what = `${dep?.asset.assetNumber ?? 'Machine'} · ${fmtDate(f.workDate)} ${WorkShiftLabel[f.shift as keyof typeof WorkShiftLabel]}`;
      if (initial) {
        await api(`/finance/days-worked/${initial.id}`, { method: 'PATCH', body: JSON.stringify(body) });
        Alert.alert('Saved', access?.write ? 'Days worked updated.' : 'Sent back for review.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
      } else {
        const r = await saveOrQueue('finance_days', '/finance/days-worked', body, `Days worked · ${what}`);
        Alert.alert(r === 'queued' ? 'Saved on this phone' : 'Saved', r === 'queued' ? 'No signal — it will be sent automatically when you are back online.' : access?.write ? `${what} recorded.` : `${what} sent to the Finance Manager for review.`, [
          { text: 'Add another', onPress: () => setF((x) => ({ ...x, hoursWorked: '', standbyHours: '0', productionNotes: '' })) },
          { text: 'Done', onPress: () => navigation.goBack() },
        ]);
      }
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Card stripe={colors.navy700} style={{ paddingLeft: 18 }}>
          <Eyebrow>Days worked</Eyebrow>
          <Text style={s.lead}>{access?.write ? 'Saved as approved.' : 'Saved for review by the Finance Manager. Works without signal.'}</Text>
        </Card>
        {initial?.reviewStatus === 'REJECTED' && <Rejected reason={initial.rejectionReason} />}
        <Picker label="Machine on hire" required value={f.deploymentId} onChange={(v) => set('deploymentId', v)}
          options={deps.map((d) => ({ v: d.id, l: `${d.asset.assetNumber} — ${d.client.name}`, sub: `${d.site} · since ${fmtDate(d.startDate)}` }))}
          placeholder={deps.length ? 'Choose…' : 'No machines on hire yet'} />
        {dep && <Text style={s.meta}>{dep.asset.name} · {dep.client.name} · {dep.site}</Text>}
        <DateField label="Date" required value={f.workDate} onChange={(v) => set('workDate', v)} />
        <Segmented label="Shift" value={f.shift} options={WorkShifts.map((x) => ({ v: x, l: WorkShiftLabel[x] }))} onChange={(v) => set('shift', v)} />
        <View style={s.row}>
          <NumberField label="Hours worked * (0–12)" value={f.hoursWorked} onChange={(v) => set('hoursWorked', v)} unit="h" />
          <NumberField label="Standby (0–12)" value={f.standbyHours} onChange={(v) => set('standbyHours', v)} unit="h" />
        </View>
        <View style={{ gap: 6 }}>
          <Field label="Operator on shift *" hint="employee ID" value={f.operatorEmployeeId} onChangeText={(t) => set('operatorEmployeeId', t.toUpperCase())} autoCapitalize="characters" autoCorrect={false} placeholder="e.g. OPR002" />
          {opMatches.length > 0 && <View style={s.suggest}>{opMatches.map((o) => <Pressable key={o.employeeId} onPress={() => set('operatorEmployeeId', o.employeeId)} style={s.sugBtn}><Text style={s.sugText}>{o.employeeId}</Text><Text style={s.sugSub}>{o.name}</Text></Pressable>)}</View>}
        </View>
        <View style={s.switchRow}>
          <View style={{ flex: 1 }}><Text style={s.switchLabel}>Billable</Text><Text style={s.meta}>Counts towards the client's bill</Text></View>
          <Switch value={f.billable} onValueChange={(v) => set('billable', v)} trackColor={{ true: colors.ok, false: colors.line }} thumbColor="#fff" />
        </View>
        <TextArea label="Production notes" value={f.productionNotes} onChange={(v) => set('productionNotes', v)} />
        {error && <Text style={s.err}>{error}</Text>}
        <Button title={busy ? 'Saving…' : initial?.reviewStatus === 'REJECTED' && !access?.write ? 'Correct & resubmit' : 'Save'} onPress={save} disabled={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const LABEL: Record<string, string> = { deploymentId: 'Machine', workDate: 'Date', hoursWorked: 'Hours worked', standbyHours: 'Standby hours', operatorEmployeeId: 'Operator' };
const s = StyleSheet.create({
  lead: { color: colors.muted, marginTop: 4 },
  meta: { color: colors.muted, fontSize: 13 },
  row: { flexDirection: 'row', gap: 10 },
  suggest: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  sugBtn: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.navy100, paddingHorizontal: 10, paddingVertical: 6 },
  sugText: { color: colors.navy800, fontWeight: '700', fontSize: 13 },
  sugSub: { color: colors.muted, fontSize: 11 },
  switchRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 12 },
  switchLabel: { fontSize: 15, fontWeight: '600', color: colors.ink },
  err: { color: colors.crit, borderLeftWidth: 2, borderLeftColor: colors.crit, paddingLeft: 10 },
});
