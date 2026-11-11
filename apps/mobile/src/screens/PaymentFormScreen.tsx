import React, { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CreditStatusColor, PaymentMethodLabel, PaymentMethods, PaymentSchema, previewCoverage } from '@drillex/shared';
import { api } from '../lib/api';
import { cached } from '../sync/cache';
import { amount, fmtDate, iso, isoDay, isPlant, loadAccess, saveOrQueue, useFinanceSettings, type Access, type Client, type Deployment } from '../lib/finance';
import type { RootStackParamList } from '../navigation';
import { Button, Card, Eyebrow, Field } from '../ui';
import { Chips, NumberField, Segmented } from '../ui/form';
import { DateField, Picker, TextArea, UrgencyBadge } from '../ui/finance';
import { colors } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'PaymentForm'>;

/**
 * Record payment (spec §6.3 tab 3, §11.3 tab 3). For a credit deployment the paid-from date and days covered set the new
 * expiry, previewed live as on the web. Finance staff can correct a payment; a plant hire supervisor's payment is final.
 */
export default function PaymentFormScreen({ navigation, route }: Props) {
  const initial = route.params?.initial;
  const preset = route.params?.preset;
  const settings = useFinanceSettings();
  const [access, setAccess] = useState<Access | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [deps, setDeps] = useState<Deployment[]>([]);
  const [f, setF] = useState(() => initial
    ? { clientId: initial.clientId, deploymentId: initial.deploymentId ?? '', paymentDate: iso(initial.paymentDate), amount: String(Number(initial.amount)), currency: initial.currency, method: initial.method as string, reference: initial.reference ?? '', paidFrom: iso(initial.paidFrom), daysCovered: initial.daysCovered ? String(initial.daysCovered) : '', notes: initial.notes ?? '' }
    : { clientId: preset?.clientId ?? '', deploymentId: preset?.deploymentId ?? '', paymentDate: isoDay(), amount: '', currency: '', method: 'BANK_TRANSFER', reference: '', paidFrom: '', daysCovered: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    loadAccess().then((a) => {
      setAccess(a);
      cached('finance.deployments', () => api<Deployment[]>('/finance/deployments')).then((r) => setDeps(a.plantOnly ? r.data.filter((d) => isPlant(d.asset.category)) : r.data)).catch(() => {});
    }).catch(() => {});
    cached('finance.clients', () => api<Client[]>('/finance/clients')).then((r) => setClients(r.data)).catch(() => {});
  }, []);
  const clientDeps = deps.filter((d) => d.clientId === f.clientId);
  const dep = deps.find((d) => d.id === f.deploymentId);
  const credit = dep?.paymentMode === 'CREDIT';
  const currency = f.currency || dep?.currency || settings.defaultCurrency;
  const needsRef = f.method === 'BANK_TRANSFER' || f.method === 'CHEQUE';
  const preview = useMemo(() => (/^\d{4}-\d{2}-\d{2}$/.test(f.paidFrom) && Number(f.daysCovered) > 0 ? previewCoverage(f.paidFrom, Number(f.daysCovered)) : null), [f.paidFrom, f.daysCovered]);
  // Clients that have something on hire this person can see; a plant hire supervisor only deals with plant clients.
  const clientOptions = (access?.plantOnly ? clients.filter((c) => deps.some((d) => d.clientId === c.id)) : clients).map((c) => ({ v: c.id, l: c.name }));

  async function save() {
    setError(null);
    const body = { clientId: f.clientId, deploymentId: f.deploymentId || undefined, paymentDate: f.paymentDate, amount: Number(f.amount), currency, method: f.method, reference: needsRef ? f.reference.trim() || undefined : undefined, paidFrom: f.paidFrom || undefined, daysCovered: f.daysCovered ? Number(f.daysCovered) : undefined, notes: f.notes.trim() || undefined };
    if (!body.clientId) { setError('Choose the client.'); return; }
    if (!f.amount) { setError('Enter the amount.'); return; }
    if (f.paymentDate > isoDay()) { setError('The payment date cannot be in the future.'); return; }
    if (credit && (!f.paidFrom || !f.daysCovered)) { setError('This is a credit deployment: enter the paid-from date and the days covered.'); return; }
    const parsed = PaymentSchema.safeParse(body);
    if (!parsed.success) { const i = parsed.error.issues[0]; setError(`${LABEL[String(i.path[0])] ?? String(i.path[0])}: ${i.message}`); return; }
    if (!initial && !access?.write) {
      const ok = await new Promise<boolean>((res) => Alert.alert('Save payment?', `${amount(body.amount, currency)} from ${clients.find((c) => c.id === f.clientId)?.name ?? 'client'}.\n\nA saved payment cannot be changed — only the Finance Manager can correct it.`, [{ text: 'Check again', style: 'cancel', onPress: () => res(false) }, { text: 'Save', onPress: () => res(true) }]));
      if (!ok) return;
    }
    setBusy(true);
    try {
      const who = clients.find((c) => c.id === f.clientId)?.name ?? 'client';
      if (initial) {
        await api(`/finance/payments/${initial.id}`, { method: 'PATCH', body: JSON.stringify(body) });
        Alert.alert('Saved', 'Payment corrected.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
      } else {
        const r = await saveOrQueue('finance_payment', '/finance/payments', body, `Payment · ${amount(body.amount, currency)} · ${who}`);
        Alert.alert(r === 'queued' ? 'Saved on this phone' : 'Payment recorded', r === 'queued' ? 'No signal — it will be sent automatically when you are back online.' : access?.write ? `${amount(body.amount, currency)} from ${who}.` : 'Sent to the Finance Manager for review.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
      }
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Card stripe={colors.navy700} style={{ paddingLeft: 18 }}>
          <Eyebrow>{initial ? 'Correct payment' : 'Record payment'}</Eyebrow>
          <Text style={s.lead}>{access?.write ? 'Saved as approved.' : 'Saved for review. A saved payment cannot be changed afterwards.'}</Text>
        </Card>
        <Picker label="Client" required value={f.clientId} options={clientOptions} onChange={(v) => setF((x) => ({ ...x, clientId: v, deploymentId: '' }))} />
        <Picker label="Machine on hire" value={f.deploymentId} disabled={!f.clientId} allowNone="Not linked to a machine" onChange={(v) => set('deploymentId', v)}
          options={clientDeps.map((d) => ({ v: d.id, l: `${d.asset.assetNumber} · ${d.site}`, sub: `${d.paymentMode === 'CREDIT' ? 'Credit' : 'Cash'} · ${amount(d.ratePerDay, d.currency)}/day` }))} />
        <DateField label="Payment date" required value={f.paymentDate} onChange={(v) => set('paymentDate', v)} />
        <NumberField label="Amount *" value={f.amount} onChange={(v) => set('amount', v)} unit={currency} />
        {settings.currencies.length > 1 && <Segmented label="Currency" value={currency} options={settings.currencies.map((c) => ({ v: c, l: c }))} onChange={(v) => set('currency', v)} />}
        <Chips label="Method" value={f.method} options={PaymentMethods.map((m) => ({ v: m, l: PaymentMethodLabel[m] }))} onChange={(v) => set('method', v)} />
        {needsRef && <Field label={f.method === 'CHEQUE' ? 'Cheque number *' : 'Bank reference *'} value={f.reference} onChangeText={(t) => set('reference', t)} autoCapitalize="characters" autoCorrect={false} />}
        {(credit || !!f.paidFrom || !!f.daysCovered) && (
          <View style={s.box}>
            <Text style={s.boxTitle}>CREDIT PERIOD COVERED</Text>
            <DateField label="Paid from" required={credit} value={f.paidFrom} onChange={(v) => set('paidFrom', v)} quick={false} />
            <NumberField label={`Days covered${credit ? ' *' : ''}`} value={f.daysCovered} onChange={(v) => set('daysCovered', v.replace(/\D/g, ''))} unit="days" />
            {preview && (
              <View style={s.preview}>
                <View><Text style={s.pLabel}>Expires</Text><Text style={s.pValue}>{fmtDate(preview.expiry)}</Text></View>
                <View><Text style={s.pLabel}>Days remaining</Text><Text style={[s.pValue, { color: CreditStatusColor[preview.status] }]}>{preview.daysRemaining}</Text></View>
                <UrgencyBadge badge={preview.status} />
              </View>
            )}
          </View>
        )}
        <TextArea label="Notes" value={f.notes} onChange={(v) => set('notes', v)} />
        {error && <Text style={s.err}>{error}</Text>}
        <Button title={busy ? 'Saving…' : 'Save payment'} onPress={save} disabled={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const LABEL: Record<string, string> = { clientId: 'Client', paymentDate: 'Payment date', amount: 'Amount', currency: 'Currency', reference: 'Reference', paidFrom: 'Paid from', daysCovered: 'Days covered' };
const s = StyleSheet.create({
  lead: { color: colors.muted, marginTop: 4 },
  box: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 12, gap: 12 },
  boxTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1.4, color: colors.muted },
  preview: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16, backgroundColor: colors.canvas, padding: 10 },
  pLabel: { fontSize: 11, color: colors.muted },
  pValue: { fontSize: 16, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
  err: { color: colors.crit, borderLeftWidth: 2, borderLeftColor: colors.crit, paddingLeft: 10 },
});
