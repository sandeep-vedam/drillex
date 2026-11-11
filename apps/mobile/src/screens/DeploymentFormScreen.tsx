import React, { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { DeploymentSchema, DeploymentStatuses, DeploymentStatusLabel } from '@drillex/shared';
import { api } from '../lib/api';
import { cached } from '../sync/cache';
import { iso, isoDay, loadAccess, saveOrQueue, useFinanceSettings, type Access, type Client, type Machine } from '../lib/finance';
import type { RootStackParamList } from '../navigation';
import { Button, Card, Eyebrow, Field } from '../ui';
import { Chips, NumberField, Segmented } from '../ui/form';
import { DateField, Picker, Rejected, TextArea } from '../ui/finance';
import { colors } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'DeploymentForm'>;

/** Machine & client (spec §6.1, §11.3 tab 1): which machine is on hire to which client, at what rate. */
export default function DeploymentFormScreen({ navigation, route }: Props) {
  const initial = route.params?.initial;
  const settings = useFinanceSettings();
  const [access, setAccess] = useState<Access | null>(null);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [f, setF] = useState(() => initial
    ? { assetId: initial.assetId, clientName: initial.client.name, site: initial.site, contractRef: initial.contractRef ?? '', startDate: iso(initial.startDate), expectedEndDate: iso(initial.expectedEndDate), ratePerDay: String(Number(initial.ratePerDay)), currency: initial.currency, paymentMode: initial.paymentMode as 'CASH' | 'CREDIT', creditTermDays: initial.creditTermDays ? String(initial.creditTermDays) : '', status: initial.status as string, notes: initial.notes ?? '' }
    : { assetId: '', clientName: '', site: '', contractRef: '', startDate: isoDay(), expectedEndDate: '', ratePerDay: '', currency: '', paymentMode: 'CASH' as 'CASH' | 'CREDIT', creditTermDays: '', status: 'ACTIVE', notes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    loadAccess().then(setAccess).catch(() => {});
    cached('finance.machines', () => api<Machine[]>('/finance/machines')).then((r) => setMachines(r.data)).catch(() => {});
    cached('finance.clients', () => api<Client[]>('/finance/clients')).then((r) => setClients(r.data)).catch(() => {});
  }, []);
  const currency = f.currency || settings.defaultCurrency;
  const matches = useMemo(() => {
    const q = f.clientName.trim().toLowerCase();
    return q ? clients.filter((c) => c.name.toLowerCase().includes(q) && c.name.toLowerCase() !== q).slice(0, 5) : [];
  }, [f.clientName, clients]);
  const isNewClient = !!f.clientName.trim() && !clients.some((c) => c.name.toLowerCase() === f.clientName.trim().toLowerCase());

  async function save() {
    setError(null);
    const body = { assetId: f.assetId, clientName: f.clientName.trim(), site: f.site.trim(), contractRef: f.contractRef.trim() || undefined, startDate: f.startDate, expectedEndDate: f.expectedEndDate || undefined, ratePerDay: Number(f.ratePerDay), currency, paymentMode: f.paymentMode, creditTermDays: f.paymentMode === 'CREDIT' && f.creditTermDays ? Number(f.creditTermDays) : undefined, status: f.status, notes: f.notes.trim() || undefined };
    if (!body.assetId) { setError('Choose the machine.'); return; }
    const parsed = DeploymentSchema.safeParse(body);
    if (!parsed.success) { const i = parsed.error.issues[0]; setError(`${LABEL[String(i.path[0])] ?? String(i.path[0])}: ${i.message}`); return; }
    setBusy(true);
    try {
      const machine = machines.find((m) => m.id === f.assetId)?.assetNumber ?? 'Machine';
      if (initial) {
        await api(`/finance/deployments/${initial.id}`, { method: 'PATCH', body: JSON.stringify(body) });
        Alert.alert('Saved', access?.write ? `${machine} updated.` : `${machine} sent back for review.`, [{ text: 'OK', onPress: () => navigation.goBack() }]);
      } else {
        const r = await saveOrQueue('finance_deployment', '/finance/deployments', body, `${machine} → ${body.clientName}`);
        Alert.alert(r === 'queued' ? 'Saved on this phone' : 'Saved', r === 'queued' ? 'No signal — it will be sent automatically when you are back online.' : access?.write ? `${machine} is now on hire to ${body.clientName}.` : 'Sent to the Finance Manager for review.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
      }
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const machineOptions = machines.map((m) => {
    const taken = !!m.deployment && m.deployment.id !== initial?.id;
    return { v: m.id, l: `${m.assetNumber} — ${m.name}`, sub: taken ? `On hire to ${m.deployment!.client.name}` : undefined, disabled: taken };
  });

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Card stripe={colors.navy700} style={{ paddingLeft: 18 }}>
          <Eyebrow>Machine & client</Eyebrow>
          <Text style={s.lead}>{access?.write ? 'Saved as approved.' : 'Saved for review by the Finance Manager. If it is rejected you can correct it once.'}</Text>
        </Card>
        {initial?.reviewStatus === 'REJECTED' && <Rejected reason={initial.rejectionReason} />}
        <Picker label="Machine" required value={f.assetId} options={machineOptions} onChange={(v) => set('assetId', v)} placeholder={access?.plantOnly ? 'Choose a plant machine…' : 'Choose a machine…'} />
        <View style={{ gap: 6 }}>
          <Field label="Client name *" value={f.clientName} onChangeText={(t) => set('clientName', t)} placeholder="Start typing — or a new name adds a client" autoCapitalize="words" />
          {matches.length > 0 && <View style={s.suggest}>{matches.map((c) => <Pressable key={c.id} onPress={() => set('clientName', c.name)} style={s.sugBtn}><Text style={s.sugText}>{c.name}</Text></Pressable>)}</View>}
          {isNewClient && <Text style={s.hint}>New client — it will be added when you save.</Text>}
        </View>
        <Field label="Client site *" value={f.site} onChangeText={(t) => set('site', t)} placeholder="e.g. Pit 3" />
        <Field label="Contract / PO reference" value={f.contractRef} onChangeText={(t) => set('contractRef', t)} autoCapitalize="characters" />
        <View style={s.row}>
          <DateField label="Start date" required value={f.startDate} onChange={(v) => set('startDate', v)} />
          <DateField label="Expected end" value={f.expectedEndDate} onChange={(v) => set('expectedEndDate', v)} quick={false} />
        </View>
        <View style={s.row}>
          <NumberField label="Rate per day *" value={f.ratePerDay} onChange={(v) => set('ratePerDay', v)} unit={currency} />
        </View>
        {settings.currencies.length > 1 && <Segmented label="Currency" value={currency} options={settings.currencies.map((c) => ({ v: c, l: c }))} onChange={(v) => set('currency', v)} />}
        <Segmented label="Payment mode" value={f.paymentMode} options={[{ v: 'CASH', l: 'Cash' }, { v: 'CREDIT', l: 'Credit' }]} onChange={(v) => set('paymentMode', v)} />
        {f.paymentMode === 'CREDIT' && <NumberField label="Credit term (days) *" value={f.creditTermDays} onChange={(v) => set('creditTermDays', v.replace(/\D/g, ''))} unit="days" />}
        <Chips label="Status" value={f.status} options={DeploymentStatuses.map((x) => ({ v: x, l: DeploymentStatusLabel[x] }))} onChange={(v) => set('status', v)} />
        <TextArea label="Notes" value={f.notes} onChange={(v) => set('notes', v)} />
        {error && <Text style={s.err}>{error}</Text>}
        <Button title={busy ? 'Saving…' : initial?.reviewStatus === 'REJECTED' && !access?.write ? 'Correct & resubmit' : 'Save'} onPress={save} disabled={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const LABEL: Record<string, string> = { clientName: 'Client name', site: 'Client site', startDate: 'Start date', expectedEndDate: 'Expected end', ratePerDay: 'Rate per day', currency: 'Currency', creditTermDays: 'Credit term', assetId: 'Machine' };
const s = StyleSheet.create({
  lead: { color: colors.muted, marginTop: 4 },
  row: { flexDirection: 'row', gap: 10 },
  suggest: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  sugBtn: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.navy100, paddingHorizontal: 10, paddingVertical: 7 },
  sugText: { color: colors.navy800, fontWeight: '600', fontSize: 13 },
  hint: { color: colors.hazard, fontSize: 12 },
  err: { color: colors.crit, borderLeftWidth: 2, borderLeftColor: colors.crit, paddingLeft: 10 },
});
