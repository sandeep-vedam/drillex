import React, { useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CreditStatusColor, DeploymentStatusLabel, PaymentMethodLabel, WorkShiftLabel } from '@drillex/shared';
import { api } from '../lib/api';
import { amount, fmtDate, type DaysWorked, type Deployment, type Payment } from '../lib/finance';
import { Action } from './index';
import { BalanceText, ReviewChip, UrgencyBadge } from './finance';
import { colors } from './theme';

/** One machine on hire. `urgency` shows the credit badge (finance dashboard); otherwise the review state. */
export function DeploymentCard({ d, urgency, actions }: { d: Deployment; urgency?: boolean; actions?: ReactNode }) {
  return (
    <View style={[s.card, urgency && { borderLeftWidth: 4, borderLeftColor: badgeColor(d.badge) }]}>
      <View style={s.top}>
        <Text style={s.num}>{d.asset.assetNumber}</Text>
        {d.status !== 'ACTIVE' && <Text style={s.dim}>{DeploymentStatusLabel[d.status]}</Text>}
        <View style={{ flex: 1 }} />
        {urgency ? <UrgencyBadge badge={d.badge} daysRemaining={d.daysRemaining} /> : <ReviewChip r={d} />}
      </View>
      <Text style={s.title}>{d.client.name}</Text>
      <Text style={s.meta}>{d.site} · {d.paymentMode === 'CREDIT' ? `Credit${d.creditTermDays ? ` ${d.creditTermDays}d` : ''}` : 'Cash'} · {amount(d.ratePerDay, d.currency)}/day</Text>
      <Text style={s.meta}>Since {fmtDate(d.startDate)}{d.expectedEndDate ? ` · until ${fmtDate(d.expectedEndDate)}` : ''} · {d.daysWorked} day{d.daysWorked === 1 ? '' : 's'} worked</Text>
      <View style={s.bottom}>
        <BalanceText v={d.outstanding} c={d.currency} />
        {!urgency && d.expiry ? <Text style={s.meta}>Paid to {fmtDate(d.expiry)}</Text> : null}
      </View>
      {d.reviewStatus === 'REJECTED' && d.rejectionReason ? <Text style={s.reject}>Rejected: {d.rejectionReason}</Text> : null}
      {actions ? <View style={s.actions}>{actions}</View> : null}
    </View>
  );
}

export function PaymentCard({ p, actions }: { p: Payment; actions?: ReactNode }) {
  return (
    <View style={s.card}>
      <View style={s.top}>
        <Text style={s.amount}>{amount(p.amount, p.currency)}</Text>
        <View style={{ flex: 1 }} />
        <ReviewChip r={p} />
      </View>
      <Text style={s.title}>{p.client.name}{p.deployment ? <Text style={s.numInline}>  {p.deployment.asset.assetNumber}</Text> : null}</Text>
      <Text style={s.meta}>{fmtDate(p.paymentDate)} · {PaymentMethodLabel[p.method]}{p.reference ? ` · ${p.reference}` : ''}</Text>
      {p.paidFrom && p.daysCovered ? <Text style={s.meta}>Covers {fmtDate(p.paidFrom)} + {p.daysCovered} days</Text> : null}
      <Text style={s.dim}>Entered by {p.createdBy?.employeeId ?? '—'}</Text>
      {p.reviewStatus === 'REJECTED' && p.rejectionReason ? <Text style={s.reject}>Rejected: {p.rejectionReason}</Text> : null}
      {actions ? <View style={s.actions}>{actions}</View> : null}
    </View>
  );
}

export function DaysCard({ d, actions }: { d: DaysWorked; actions?: ReactNode }) {
  return (
    <View style={s.card}>
      <View style={s.top}>
        <Text style={s.num}>{d.deployment.asset.assetNumber}</Text>
        <Text style={s.meta}>{fmtDate(d.workDate)} · {WorkShiftLabel[d.shift]}</Text>
        <View style={{ flex: 1 }} />
        <ReviewChip r={d} />
      </View>
      <Text style={s.title}>{d.deployment.client.name}</Text>
      <Text style={s.meta}>{Number(d.hoursWorked)} h worked{Number(d.standbyHours) ? ` · ${Number(d.standbyHours)} h standby` : ''} · {d.operatorEmployeeId}{d.billable ? '' : ' · not billable'}</Text>
      {d.productionNotes ? <Text style={s.meta} numberOfLines={2}>{d.productionNotes}</Text> : null}
      <Text style={s.dim}>Entered by {d.createdBy?.employeeId ?? '—'}{d.resubmitted ? ' · corrected after rejection' : ''}</Text>
      {d.reviewStatus === 'REJECTED' && d.rejectionReason ? <Text style={s.reject}>Rejected: {d.rejectionReason}</Text> : null}
      {actions ? <View style={s.actions}>{actions}</View> : null}
    </View>
  );
}

/** Approve / reject a plant hire supervisor's entry (spec §11.4). Rejecting needs a reason the supervisor will see. */
export function ReviewActions({ kind, id, onDone, onError }: { kind: 'deployments' | 'days-worked' | 'payments'; id: string; onDone: () => void; onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  async function decide(decision: 'APPROVE' | 'REJECT') {
    setBusy(true);
    try { await api(`/finance/${kind}/${id}/review`, { method: 'POST', body: JSON.stringify({ decision, reason: decision === 'REJECT' ? reason.trim() : undefined }) }); setRejecting(false); onDone(); }
    catch (e) { onError((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <>
      <Action title="Approve" tone={colors.ok} onPress={() => decide('APPROVE')} disabled={busy} />
      <Action title="Reject" tone={colors.crit} onPress={() => { setReason(''); setRejecting(true); }} disabled={busy} />
      <Modal visible={rejecting} transparent animationType="fade" onRequestClose={() => setRejecting(false)}>
        <View style={s.backdrop}>
          <View style={s.dialog}>
            <Text style={s.dTitle}>Reason for rejecting</Text>
            <Text style={s.meta}>The plant hire supervisor sees this and can correct the entry once.</Text>
            <TextInput style={s.dInput} value={reason} onChangeText={setReason} multiline autoFocus placeholder="e.g. Wrong date — the machine was on standby" placeholderTextColor="#9AA6B3" />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
              <Pressable onPress={() => setRejecting(false)} style={s.dBtn}><Text style={{ color: colors.navy800, fontWeight: '700' }}>Cancel</Text></Pressable>
              <Pressable onPress={() => decide('REJECT')} disabled={busy || reason.trim().length < 3} style={[s.dBtn, { backgroundColor: colors.crit, borderColor: colors.crit }, (busy || reason.trim().length < 3) && { opacity: 0.5 }]}><Text style={{ color: '#fff', fontWeight: '700' }}>Reject</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const badgeColor = (b: Deployment['badge']) => CreditStatusColor[b] ?? colors.line;

const s = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, padding: 12, gap: 3 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  num: { fontFamily: 'monospace', fontWeight: '800', color: colors.navy800, fontSize: 14 },
  numInline: { fontFamily: 'monospace', fontWeight: '700', color: colors.navy800, fontSize: 13 },
  amount: { fontSize: 17, fontWeight: '800', color: colors.ink, fontVariant: ['tabular-nums'] },
  title: { fontSize: 15, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 13, color: colors.muted },
  dim: { fontSize: 12, color: colors.muted },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  reject: { fontSize: 12.5, color: colors.crit, marginTop: 4 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
  backdrop: { flex: 1, backgroundColor: 'rgba(6,31,56,.55)', justifyContent: 'center', padding: 20 },
  dialog: { backgroundColor: colors.surface, padding: 16, gap: 10 },
  dTitle: { fontSize: 17, fontWeight: '700', color: colors.ink },
  dInput: { borderWidth: 1, borderColor: colors.line, padding: 10, minHeight: 80, textAlignVertical: 'top', color: colors.ink, fontSize: 15 },
  dBtn: { borderWidth: 1, borderColor: colors.line, paddingHorizontal: 16, paddingVertical: 10 },
});
