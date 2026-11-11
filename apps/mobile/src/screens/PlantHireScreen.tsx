import React, { useEffect, useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, API_URL, loadSession } from '../lib/api';
import { cached } from '../sync/cache';
import { fmtDate, isPlant, loadAccess, perCurrency, type Access, type Client, type DaysWorked, type Deployment, type Machine, type Payment } from '../lib/finance';
import type { RootStackParamList } from '../navigation';
import { Action, Button } from '../ui';
import { BalanceText, DateField, Picker, TopTabs } from '../ui/finance';
import { DaysCard, DeploymentCard, PaymentCard } from '../ui/financeCards';
import { colors } from '../ui/theme';
import { Body, Empty, useLoad } from './FinanceScreen';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Tab = 'machines' | 'days' | 'payments' | 'summary';
type SummaryRow = { client: { id: string; name: string }; daysWorked: number; billed: Record<string, number>; received: Record<string, number>; outstanding: Record<string, number>; lastPaymentDate: string | null; activeMachines: number };
type Row = { reviewStatus: string; resubmitted: boolean; createdById: string };

/**
 * Plant Hire Supervisor module (client spec §11.3): which plant machine is with which client, days worked, payments
 * received and a per-client summary. Every entry is reviewed by the Finance Manager or Admin; a rejected entry of your
 * own can be corrected once.
 */
export default function PlantHireScreen() {
  const [tab, setTab] = useState<Tab>('machines');
  const [access, setAccess] = useState<Access | null>(null);
  const [me, setMe] = useState<string | undefined>();
  useEffect(() => { loadAccess().then(setAccess).catch(() => {}); loadSession().then((x) => setMe(x?.user.id)); }, []);
  const correctable = (r: Row) => !!access && (access.write || (r.reviewStatus === 'REJECTED' && !r.resubmitted && r.createdById === me));
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View style={s.tabs}>
        <TopTabs tabs={[{ key: 'machines', label: 'Machine & client' }, { key: 'days', label: 'Days worked' }, { key: 'payments', label: 'Payments' }, { key: 'summary', label: 'Summary' }]} value={tab} onChange={setTab} />
      </View>
      {access && tab === 'machines' && <MachinesTab access={access} correctable={correctable} />}
      {access && tab === 'days' && <DaysTab correctable={correctable} access={access} />}
      {access && tab === 'payments' && <PaymentsTab access={access} />}
      {access && tab === 'summary' && <SummaryTab />}
    </View>
  );
}

const ReviewNote = ({ access }: { access: Access }) => (access.write ? null : <Text style={s.note}>Everything you save is reviewed by the Finance Manager or Admin. Approved entries are locked; a rejected entry can be corrected once.</Text>);

function MachinesTab({ access, correctable }: { access: Access; correctable: (r: Row) => boolean }) {
  const nav = useNavigation<Nav>();
  const { data, error, offline, refreshControl } = useLoad<Deployment[]>('finance.deployments', '/finance/deployments');
  const rows = data?.filter((d) => isPlant(d.asset.category));
  return (
    <Body refreshControl={refreshControl} offline={offline} error={error}>
      <Button title="+ Assign machine to client" onPress={() => nav.navigate('DeploymentForm', {})} />
      <ReviewNote access={access} />
      {rows?.map((d) => <DeploymentCard key={d.id} d={d} actions={correctable(d) ? <Action title={access.write ? 'Edit' : 'Correct'} onPress={() => nav.navigate('DeploymentForm', { initial: d })} /> : undefined} />)}
      {rows && !rows.length && <Empty text="No plant machines on hire yet." />}
    </Body>
  );
}

function DaysTab({ access, correctable }: { access: Access; correctable: (r: Row) => boolean }) {
  const nav = useNavigation<Nav>();
  const { data, error, offline, refreshControl } = useLoad<DaysWorked[]>('finance.days', '/finance/days-worked');
  const rows = data?.filter((d) => isPlant(d.deployment.asset.category));
  return (
    <Body refreshControl={refreshControl} offline={offline} error={error}>
      <Button title="+ Record days worked" onPress={() => nav.navigate('DaysWorkedForm', {})} />
      <ReviewNote access={access} />
      {rows?.map((d) => <DaysCard key={d.id} d={d} actions={correctable(d) ? <Action title={access.write ? 'Edit' : 'Correct'} onPress={() => nav.navigate('DaysWorkedForm', { initial: d })} /> : undefined} />)}
      {rows && !rows.length && <Empty text="No days recorded yet." />}
    </Body>
  );
}

function PaymentsTab({ access }: { access: Access }) {
  const nav = useNavigation<Nav>();
  const { data, error, offline, refreshControl } = useLoad<Payment[]>('finance.payments', '/finance/payments');
  return (
    <Body refreshControl={refreshControl} offline={offline} error={error}>
      <Button title="+ Record payment" onPress={() => nav.navigate('PaymentForm', {})} />
      <ReviewNote access={access} />
      {data?.map((p) => <PaymentCard key={p.id} p={p} />)}
      {data && !data.length && <Empty text="No payments yet." />}
    </Body>
  );
}

/** Outstanding balances per client (spec §11.3 tab 4), filterable by client, machine and dates; shareable as CSV. */
function SummaryTab() {
  const [clients, setClients] = useState<Client[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [f, setF] = useState({ clientId: '', assetId: '', from: '', to: '' });
  const ok = (d: string) => !d || /^\d{4}-\d{2}-\d{2}$/.test(d);
  const qs = Object.entries(f).filter(([, v]) => v && ok(v)).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const { data, error, setError, offline, refreshControl } = useLoad<SummaryRow[]>(`finance.summary.${qs}`, `/finance/summary${qs ? `?${qs}` : ''}`);
  useEffect(() => {
    cached('finance.clients', () => api<Client[]>('/finance/clients')).then((r) => setClients(r.data)).catch(() => {});
    cached('finance.machines', () => api<Machine[]>('/finance/machines')).then((r) => setMachines(r.data.filter((m) => isPlant(m.category)))).catch(() => {});
  }, []);
  async function shareCsv() {
    try {
      await api('/finance/access'); // refreshes an expired access token before the raw fetch below
      const sess = await loadSession();
      const res = await fetch(`${API_URL}/finance/summary.csv${qs ? `?${qs}` : ''}`, { headers: { Authorization: `Bearer ${sess?.accessToken}` } });
      if (!res.ok) throw new Error('Could not export — pull down to refresh and try again.');
      await Share.share({ title: 'Plant hire client summary', message: await res.text() });
    } catch (e) { setError((e as Error).message); }
  }
  return (
    <Body refreshControl={refreshControl} offline={offline} error={error}>
      <Picker label="Client" value={f.clientId} allowNone="All clients" options={clients.map((c) => ({ v: c.id, l: c.name }))} onChange={(v) => setF({ ...f, clientId: v })} />
      <Picker label="Machine" value={f.assetId} allowNone="All machines" options={machines.map((m) => ({ v: m.id, l: `${m.assetNumber} — ${m.name}` }))} onChange={(v) => setF({ ...f, assetId: v })} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <DateField label="From" value={f.from} onChange={(v) => setF({ ...f, from: v })} quick={false} />
        <DateField label="To" value={f.to} onChange={(v) => setF({ ...f, to: v })} quick={false} />
      </View>
      <Button variant="ghost" title="Share as CSV" onPress={shareCsv} />
      {data?.map((r) => (
        <View key={r.client.id} style={s.card}>
          <Text style={s.title}>{r.client.name}</Text>
          <Text style={s.meta}>{r.daysWorked} days worked · {r.activeMachines} machine{r.activeMachines === 1 ? '' : 's'} on hire · last payment {fmtDate(r.lastPaymentDate)}</Text>
          <View style={s.nums}>
            <View style={{ flex: 1 }}><Text style={s.pLabel}>Billed</Text><Text style={s.pValue}>{perCurrency(r.billed)}</Text></View>
            <View style={{ flex: 1 }}><Text style={s.pLabel}>Received</Text><Text style={s.pValue}>{perCurrency(r.received)}</Text></View>
          </View>
          <Text style={s.pLabel}>Outstanding</Text>
          {Object.entries(r.outstanding).map(([c, v]) => <BalanceText key={c} v={v} c={c} style={{ fontSize: 14 }} />)}
          {!Object.keys(r.outstanding).length && <Text style={s.meta}>—</Text>}
        </View>
      ))}
      {data && !data.length && <Empty text="No plant hire activity for these filters." />}
      <Text style={s.note}>Billed = billable days worked × daily rate. Amounts in different currencies are shown separately, never added together.</Text>
    </Body>
  );
}

const s = StyleSheet.create({
  tabs: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line },
  note: { color: colors.muted, fontSize: 12.5 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, padding: 12, gap: 4 },
  title: { fontSize: 15, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 13, color: colors.muted },
  nums: { flexDirection: 'row', gap: 12, marginTop: 4 },
  pLabel: { fontSize: 11, color: colors.muted },
  pValue: { fontSize: 14, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
});
