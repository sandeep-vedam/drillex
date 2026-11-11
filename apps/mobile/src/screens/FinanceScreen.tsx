import React, { useCallback, useEffect, useState } from 'react';
import { Alert as RNAlert, Linking, Modal, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CreditStatusColor } from '@drillex/shared';
import { api } from '../lib/api';
import { cached } from '../sync/cache';
import { amount, fmtDate, loadAccess, perCurrency, type Access, type Badge, type DaysWorked, type Deployment, type Payment } from '../lib/finance';
import type { RootStackParamList } from '../navigation';
import { Action, Button } from '../ui';
import { BalanceText, FINANCE_HEADER, Kpi, TopTabs, UrgencyBadge } from '../ui/finance';
import { DaysCard, DeploymentCard, PaymentCard, ReviewActions } from '../ui/financeCards';
import { colors } from '../ui/theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Tab = 'dashboard' | 'mapping' | 'payments' | 'alerts' | 'reports' | 'review';
type Dash = { collectedThisMonth: Record<string, number>; outstanding: Record<string, number>; expiringWithin7Days: number; activeMachines: number; pendingReview: number; deployments: Deployment[] };
type FollowUp = { deploymentId: string; machine: string; machineName: string; client: { id: string; name: string; phone?: string | null; email?: string | null }; site: string; paymentMode: string; badge: Badge; daysRemaining: number | null; expiry: string | null; outstanding: string | null; message: string };
type Monthly = { month: string; from: string; to: string; rows: { deploymentId: string; machine: string; machineName: string; client: string; site: string; daysWorked: number; ratePerDay: number; currency: string; billed: number; received: number; balance: number }[]; totals: { billed: Record<string, number>; received: Record<string, number>; balance: Record<string, number> } };
type Queue = { deployments: Deployment[]; days: DaysWorked[]; payments: Payment[] };

/**
 * Finance Manager module on the phone (client spec §6): its own top-tab interface under the finance-blue header,
 * not the operator layout. Dashboard, machine–client mapping, payments, follow-up alerts, monthly report, review.
 */
export default function FinanceScreen() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [access, setAccess] = useState<Access | null>(null);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { loadAccess().then(setAccess).catch((e) => setError((e as Error).message)); }, []);
  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'dashboard', label: 'Dashboard' }, { key: 'mapping', label: 'Mapping' }, { key: 'payments', label: 'Payments' },
    { key: 'alerts', label: 'Follow-ups' }, { key: 'reports', label: 'Reports' },
    ...(access?.review ? [{ key: 'review' as const, label: 'Review', count: pending }] : []),
  ];
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View style={{ backgroundColor: FINANCE_HEADER }}>
        <Text style={s.headEyebrow}>FINANCE MANAGER · BILLING & COLLECTIONS</Text>
        <TopTabs dark tabs={tabs} value={tab} onChange={setTab} />
      </View>
      {error && <Text style={[s.err, { margin: 16 }]}>{error}</Text>}
      {access && tab === 'dashboard' && <DashboardTab onPending={setPending} />}
      {access && tab === 'mapping' && <MappingTab access={access} />}
      {access && tab === 'payments' && <PaymentsTab access={access} />}
      {access && tab === 'alerts' && <AlertsTab access={access} />}
      {access && tab === 'reports' && <ReportsTab />}
      {access && tab === 'review' && <ReviewTab onPending={setPending} />}
    </View>
  );
}

/** Loads on mount and whenever the screen comes back into view (after saving a form), with pull-to-refresh. */
export function useLoad<T>(key: string, path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    try { const r = await cached(key, () => api<T>(path)); setData(r.data); setOffline(r.fromCache); setError(null); }
    catch (e) { setError((e as Error).message); }
  }, [key, path]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const refresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);
  return { data, error, setError, offline, load, refreshControl: <RefreshControl refreshing={refreshing} onRefresh={refresh} /> };
}

export function Body({ children, refreshControl, offline, error }: { children: React.ReactNode; refreshControl?: React.ReactElement<React.ComponentProps<typeof RefreshControl>>; offline?: boolean; error?: string | null }) {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }} refreshControl={refreshControl} keyboardShouldPersistTaps="handled">
      {offline && <Text style={s.offline}>Offline — showing the last synced figures.</Text>}
      {error && <Text style={s.err}>{error}</Text>}
      {children}
    </ScrollView>
  );
}
export const Empty = ({ text }: { text: string }) => <View style={s.empty}><Text style={{ color: colors.muted, textAlign: 'center' }}>{text}</Text></View>;
export const SectionLabel = ({ text }: { text: string }) => <Text style={s.section}>{text}</Text>;

function DashboardTab({ onPending }: { onPending: (n: number) => void }) {
  const { data: d, error, offline, refreshControl } = useLoad<Dash>('finance.dashboard', '/finance/dashboard');
  useEffect(() => { if (d) onPending(d.pendingReview); }, [d, onPending]);
  return (
    <Body refreshControl={refreshControl} offline={offline} error={error}>
      {!d ? <Text style={{ color: colors.muted }}>Loading…</Text> : (
        <>
          <View style={s.kpis}>
            <Kpi label="Collected this month" value={perCurrency(d.collectedThisMonth)} tone="#15803D" />
            <Kpi label="Outstanding" value={perCurrency(d.outstanding)} tone={Object.keys(d.outstanding).length ? colors.crit : undefined} />
            <Kpi label="Expiring ≤ 7 days" value={d.expiringWithin7Days} tone={d.expiringWithin7Days ? '#C2410C' : undefined} />
            <Kpi label="Active machines" value={d.activeMachines} />
          </View>
          {d.pendingReview > 0 && <Text style={s.pendingNote}>{d.pendingReview} plant hire {d.pendingReview === 1 ? 'entry is' : 'entries are'} waiting for your review — see the Review tab.</Text>}
          <SectionLabel text="Deployments by urgency" />
          {d.deployments.map((x) => <DeploymentCard key={x.id} d={x} urgency />)}
          {!d.deployments.length && <Empty text="No machines on hire yet." />}
        </>
      )}
    </Body>
  );
}

function MappingTab({ access }: { access: Access }) {
  const nav = useNavigation<Nav>();
  const [all, setAll] = useState(false);
  const { data, error, offline, refreshControl } = useLoad<Deployment[]>(`finance.deployments${all ? '' : '.active'}`, `/finance/deployments${all ? '' : '?active=1'}`);
  return (
    <Body refreshControl={refreshControl} offline={offline} error={error}>
      {(access.write || access.psv) && <Button title="+ New mapping" onPress={() => nav.navigate('DeploymentForm', {})} />}
      <View style={s.switchRow}><Text style={{ flex: 1, color: colors.ink }}>Include demobilised and rejected</Text><Switch value={all} onValueChange={setAll} /></View>
      {data?.map((d) => <DeploymentCard key={d.id} d={d} actions={access.write ? <><Action title="Record payment" onPress={() => nav.navigate('PaymentForm', { preset: { clientId: d.clientId, deploymentId: d.id } })} /><Action title="Edit" onPress={() => nav.navigate('DeploymentForm', { initial: d })} /></> : undefined} />)}
      {data && !data.length && <Empty text="No deployments yet." />}
    </Body>
  );
}

function PaymentsTab({ access }: { access: Access }) {
  const nav = useNavigation<Nav>();
  const { data, error, offline, refreshControl } = useLoad<Payment[]>('finance.payments', '/finance/payments');
  return (
    <Body refreshControl={refreshControl} offline={offline} error={error}>
      {(access.write || access.psv) && <Button title="+ Record payment" onPress={() => nav.navigate('PaymentForm', {})} />}
      {data?.map((p) => <PaymentCard key={p.id} p={p} actions={access.write ? <Action title="Correct" onPress={() => nav.navigate('PaymentForm', { initial: p })} /> : undefined} />)}
      {data && !data.length && <Empty text="No payments yet." />}
    </Body>
  );
}

/** Follow-up alerts (spec §6.3 tab 4): a pre-filled reminder the finance manager edits, then sends by WhatsApp or email. */
function AlertsTab({ access }: { access: Access }) {
  const { data, error, setError, offline, load, refreshControl } = useLoad<FollowUp[]>('finance.alerts', '/finance/alerts');
  const [open, setOpen] = useState<FollowUp | null>(null);
  const [msg, setMsg] = useState('');
  const [contact, setContact] = useState({ phone: '', email: '' });
  const insets = useSafeAreaInsets();
  const start = (a: FollowUp) => { setOpen(a); setMsg(a.message); setContact({ phone: a.client.phone ?? '', email: a.client.email ?? '' }); };
  const digits = contact.phone.replace(/[^\d]/g, '');
  async function saveContact() {
    if (!open) return;
    try { await api(`/finance/clients/${open.client.id}`, { method: 'PATCH', body: JSON.stringify({ phone: contact.phone || undefined, email: contact.email || undefined }) }); RNAlert.alert('Saved', `Contact saved for ${open.client.name}.`); load(); }
    catch (e) { setError((e as Error).message); }
  }
  const openUrl = (url: string) => Linking.openURL(url).catch(() => RNAlert.alert('Could not open', 'Is the app installed on this phone?'));
  return (
    <Body refreshControl={refreshControl} offline={offline} error={error}>
      {data?.map((a) => (
        <View key={a.deploymentId} style={[s.alert, { borderLeftColor: CreditStatusColor[a.badge] }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={s.num}>{a.machine}</Text><View style={{ flex: 1 }} /><UrgencyBadge badge={a.badge} daysRemaining={a.daysRemaining} />
          </View>
          <Text style={s.title}>{a.client.name}</Text>
          <Text style={s.meta}>{a.site} · {a.paymentMode === 'CREDIT' ? 'Credit' : 'Cash'}{a.expiry ? ` · expires ${fmtDate(a.expiry)}` : ''}</Text>
          <Text style={[s.meta, a.outstanding ? { color: colors.crit, fontWeight: '700' } : null]}>{a.outstanding ? `${a.outstanding} outstanding` : 'Nothing outstanding'}</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6 }}><Action title="Message client" onPress={() => start(a)} /></View>
        </View>
      ))}
      {data && !data.length && <Empty text="No follow-ups needed — every deployment is paid up." />}
      <Modal visible={!!open} animationType="slide" onRequestClose={() => setOpen(null)}>
        <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: insets.top }}>
          <View style={s.sheetHead}><Text style={s.sheetTitle} numberOfLines={1}>Follow up · {open?.client.name}</Text><Pressable onPress={() => setOpen(null)} hitSlop={10}><Text style={{ color: '#fff', fontWeight: '700' }}>Close</Text></Pressable></View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
            <TextInput style={[s.input, { minHeight: 220, textAlignVertical: 'top', fontSize: 15, lineHeight: 21 }]} value={msg} onChangeText={setMsg} multiline />
            <Text style={s.label}>WhatsApp number</Text>
            <TextInput style={s.input} value={contact.phone} onChangeText={(t) => setContact({ ...contact, phone: t })} placeholder="+260 …" placeholderTextColor="#9AA6B3" keyboardType="phone-pad" />
            <Text style={s.label}>Email</Text>
            <TextInput style={s.input} value={contact.email} onChangeText={(t) => setContact({ ...contact, email: t })} keyboardType="email-address" autoCapitalize="none" />
            {access.write && <Action title="Save contact to client" onPress={saveContact} />}
            <Button title="Send by WhatsApp" disabled={!digits} onPress={() => openUrl(`https://wa.me/${digits}?text=${encodeURIComponent(msg)}`)} />
            <Button variant="ghost" title="Send by email" disabled={!contact.email} onPress={() => openUrl(`mailto:${contact.email}?subject=${encodeURIComponent(`Payment reminder — ${open?.machine ?? ''}`)}&body=${encodeURIComponent(msg)}`)} />
            <Button variant="ghost" title="Share another way" onPress={() => Share.share({ message: msg })} />
          </ScrollView>
        </View>
      </Modal>
    </Body>
  );
}

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthName = (k: string) => new Date(`${k}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Monthly financial report (spec §6.3 tab 5): days worked × rate = billed, against received. PDF / Excel from the server. */
function ReportsTab() {
  const [month, setMonth] = useState(monthKey(new Date()));
  const { data, error, setError, offline, refreshControl } = useLoad<Monthly>(`finance.monthly.${month}`, `/finance/monthly?month=${month}`);
  const [busy, setBusy] = useState(false);
  const shift = (n: number) => { const [y, m] = month.split('-').map(Number); setMonth(monthKey(new Date(y, m - 1 + n, 1))); };
  const isCurrent = month >= monthKey(new Date());
  async function exportFile(kind: 'pdf' | 'xlsx') {
    if (!data) return;
    setBusy(true);
    try {
      const r = await api<{ pdfUrl: string; xlsxUrl: string }>('/reports/generate', { method: 'POST', body: JSON.stringify({ type: 'MONTHLY_FINANCIAL', from: data.from.slice(0, 10), to: data.to.slice(0, 10) }) });
      await Linking.openURL(kind === 'pdf' ? r.pdfUrl : r.xlsxUrl);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const shown = data && data.month === month ? data : null;
  return (
    <Body refreshControl={refreshControl} offline={offline} error={error}>
      <View style={s.monthRow}>
        <Action title="‹ Previous" onPress={() => shift(-1)} />
        <Text style={s.month}>{monthName(month)}</Text>
        <Action title="Next ›" onPress={() => shift(1)} disabled={isCurrent} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><Button variant="ghost" title={busy ? 'Preparing…' : 'PDF'} disabled={busy || !shown} onPress={() => exportFile('pdf')} /></View>
        <View style={{ flex: 1 }}><Button variant="ghost" title={busy ? 'Preparing…' : 'Excel'} disabled={busy || !shown} onPress={() => exportFile('xlsx')} /></View>
      </View>
      {!shown ? <Text style={{ color: colors.muted }}>Loading…</Text> : (
        <>
          {shown.rows.map((r) => (
            <View key={r.deploymentId} style={s.repRow}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'baseline' }}><Text style={s.num}>{r.machine}</Text><Text style={[s.title, { flex: 1 }]} numberOfLines={1}>{r.client}</Text></View>
              <Text style={s.meta}>{r.daysWorked} days × {amount(r.ratePerDay, r.currency)}</Text>
              <View style={s.repNums}>
                <View><Text style={s.pLabel}>Billed</Text><Text style={s.pValue}>{amount(r.billed, r.currency)}</Text></View>
                <View><Text style={s.pLabel}>Received</Text><Text style={s.pValue}>{amount(r.received, r.currency)}</Text></View>
                <View><Text style={s.pLabel}>Balance</Text><BalanceText v={r.balance} c={r.currency} style={{ fontSize: 14 }} /></View>
              </View>
            </View>
          ))}
          {!shown.rows.length && <Empty text="Nothing billed in this month." />}
          {!!shown.rows.length && (
            <View style={[s.repRow, { backgroundColor: colors.navy100 }]}>
              <Text style={s.title}>Totals</Text>
              <Text style={s.meta}>Billed: <Text style={s.tot}>{perCurrency(shown.totals.billed).replace(/\n/g, ' · ')}</Text></Text>
              <Text style={s.meta}>Received: <Text style={s.tot}>{perCurrency(shown.totals.received).replace(/\n/g, ' · ')}</Text></Text>
              <Text style={s.meta}>Balance: <Text style={s.tot}>{perCurrency(shown.totals.balance).replace(/\n/g, ' · ')}</Text></Text>
            </View>
          )}
        </>
      )}
    </Body>
  );
}

/** Entries from the plant hire supervisor waiting for approval (spec §11.4). */
function ReviewTab({ onPending }: { onPending: (n: number) => void }) {
  const { data: q, error, setError, load, refreshControl } = useLoad<Queue>('finance.reviews', '/finance/reviews');
  useEffect(() => { if (q) onPending(q.deployments.length + q.days.length + q.payments.length); }, [q, onPending]);
  const empty = q && !q.deployments.length && !q.days.length && !q.payments.length;
  const actions = (kind: 'deployments' | 'days-worked' | 'payments', id: string) => <ReviewActions kind={kind} id={id} onDone={load} onError={setError} />;
  return (
    <Body refreshControl={refreshControl} error={error}>
      {empty && <Empty text="Nothing is waiting for review." />}
      {!!q?.deployments.length && <SectionLabel text="Machine & client" />}
      {q?.deployments.map((d) => <DeploymentCard key={d.id} d={d} actions={actions('deployments', d.id)} />)}
      {!!q?.days.length && <SectionLabel text="Days worked" />}
      {q?.days.map((d) => <DaysCard key={d.id} d={d} actions={actions('days-worked', d.id)} />)}
      {!!q?.payments.length && <SectionLabel text="Payments" />}
      {q?.payments.map((p) => <PaymentCard key={p.id} p={p} actions={actions('payments', p.id)} />)}
    </Body>
  );
}

const s = StyleSheet.create({
  headEyebrow: { color: 'rgba(255,255,255,.6)', fontSize: 10.5, fontWeight: '700', letterSpacing: 1.4, paddingHorizontal: 16, paddingTop: 10 },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pendingNote: { backgroundColor: '#F59E0B1F', borderLeftWidth: 4, borderLeftColor: '#F59E0B', padding: 10, color: colors.ink },
  section: { fontSize: 11, fontWeight: '700', letterSpacing: 1.6, textTransform: 'uppercase', color: colors.muted, marginTop: 6 },
  empty: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, padding: 24 },
  offline: { color: colors.hazard, fontSize: 12 },
  err: { color: colors.crit, borderLeftWidth: 2, borderLeftColor: colors.crit, paddingLeft: 10 },
  switchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, paddingVertical: 6 },
  alert: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderLeftWidth: 4, padding: 12, gap: 3 },
  num: { fontFamily: 'monospace', fontWeight: '800', color: colors.navy800, fontSize: 14 },
  title: { fontSize: 15, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 13, color: colors.muted },
  label: { fontSize: 13, fontWeight: '600', color: colors.ink },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, paddingVertical: 11, fontSize: 16, color: colors.ink },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: FINANCE_HEADER, paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  sheetTitle: { color: '#fff', fontSize: 17, fontWeight: '700', flex: 1 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  month: { fontSize: 16, fontWeight: '700', color: colors.ink },
  repRow: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, padding: 12, gap: 4 },
  repNums: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 4 },
  pLabel: { fontSize: 11, color: colors.muted },
  pValue: { fontSize: 14, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
  tot: { color: colors.ink, fontWeight: '700' },
});
