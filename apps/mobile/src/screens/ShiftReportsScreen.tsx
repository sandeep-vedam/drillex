import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, loadSession } from '../lib/api';
import { can, type PermissionMatrix } from '@drillex/shared';
import { cached } from '../sync/cache';
import { Button, Card, Eyebrow } from '../ui';
import { colors } from '../ui/theme';

type Chem = { id: string; name?: string; quantity: string; unit: string };
export type Report = {
  id: string; date: string; shift: 'DAY' | 'NIGHT'; holeRef: string; startDepth: string; endDepth: string;
  totalMeters: string; holesCompleted: number; holeDiameterMm: string; rockType: string; penetrationRate: string;
  downtimeHours: string; downtimeReason?: string;
  status: 'SUBMITTED' | 'APPROVED' | 'UNLOCKED'; submittedAt: string; approvedAt?: string;
  asset: { assetNumber: string; name: string }; user: { employeeId: string; name: string };
  site?: { name: string }; chemicals?: Chem[];
};

const TABS: [string, string][] = [['ALL', 'All'], ['SUBMITTED', 'Awaiting'], ['APPROVED', 'Approved'], ['UNLOCKED', 'Unlocked']];
const TONE: Record<string, string> = { SUBMITTED: colors.hazard, APPROVED: colors.ok, UNLOCKED: colors.crit };
const LABEL: Record<string, string> = { SUBMITTED: 'Awaiting approval', APPROVED: 'Approved', UNLOCKED: 'Unlocked' };

/**
 * Supervisor/manager approval queue — the counterpart of the web Shift production page. A supervisor is
 * usually on site rather than at a desk, so approving has to work from the handset.
 */
export default function ShiftReportsScreen() {
  const [rows, setRows] = useState<Report[]>([]);
  const [tab, setTab] = useState('ALL');
  const [sel, setSel] = useState<Report | null>(null);
  const [matrix, setMatrix] = useState<PermissionMatrix | null>(null);
  const [role, setRole] = useState<string | undefined>();
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unlockFor, setUnlockFor] = useState<Report | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    try {
      const [r, perms, sess] = await Promise.all([
        api<Report[]>('/shift-reports'),
        cached('permissions', () => api<PermissionMatrix>('/roles/matrix')),
        loadSession(),
      ]);
      setRows(r); setMatrix(perms.data); setRole(sess?.user.role); setError(null);
      setSel((cur) => (cur ? r.find((x) => x.id === cur.id) ?? null : null));
    } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const allow = (p: Parameters<typeof can>[2]) => !!role && !!matrix && !!can(matrix, role, p);
  const canApprove = allow('shift_report:approve');
  const canUnlock = allow('shift_report:unlock');
  const list = useMemo(() => rows.filter((r) => tab === 'ALL' || r.status === tab), [rows, tab]);

  async function approve(r: Report) {
    setBusy(true); setError(null);
    try { await api(`/shift-reports/${r.id}/approve`, { method: 'POST' }); await load(); setSel(null); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function doUnlock() {
    if (!unlockFor || !reason.trim()) return;
    setBusy(true); setError(null);
    try {
      await api(`/shift-reports/${unlockFor.id}/unlock`, { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) });
      setUnlockFor(null); setReason(''); await load(); setSel(null);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <>
      <FlatList
        style={{ backgroundColor: colors.canvas }}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
        data={list}
        keyExtractor={(r) => r.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListHeaderComponent={
          <View style={{ gap: 10, marginBottom: 4 }}>
            <Eyebrow>Shift production</Eyebrow>
            <View style={s.tabs}>
              {TABS.map(([k, l]) => {
                const n = k === 'ALL' ? rows.length : rows.filter((r) => r.status === k).length;
                return (
                  <Pressable key={k} onPress={() => setTab(k)} style={[s.tab, tab === k && s.tabOn]}>
                    <Text style={[s.tabText, tab === k && s.tabTextOn]}>{l} {n}</Text>
                  </Pressable>
                );
              })}
            </View>
            {error && <Text style={s.err}>{error}</Text>}
          </View>
        }
        ListEmptyComponent={<Card><Text style={{ color: colors.muted }}>Nothing in this list.</Text></Card>}
        renderItem={({ item }) => (
          <Pressable onPress={() => setSel(item)}>
            <Card stripe={TONE[item.status]} style={{ paddingLeft: 18, gap: 4 }}>
              <View style={s.rowTop}>
                <Text style={s.num}>{item.asset.assetNumber}</Text>
                <Text style={[s.status, { color: TONE[item.status] }]}>{LABEL[item.status]}</Text>
              </View>
              <Text style={s.meta}>{item.shift === 'DAY' ? 'Day' : 'Night'} shift · {new Date(item.date).toLocaleDateString()} · hole {item.holeRef}</Text>
              <Text style={s.metres}>{item.totalMeters} m · {item.holesCompleted} hole(s)</Text>
              <Text style={s.by}>Submitted by {item.user.employeeId}</Text>
            </Card>
          </Pressable>
        )}
      />

      {/* Detail sheet — the figures a supervisor needs before signing off, then the actions. */}
      <Modal visible={!!sel} animationType="slide" onRequestClose={() => setSel(null)} transparent>
        <View style={s.backdrop}>
          <View style={s.sheet}>
            {sel && (
              <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 28 }}>
                <View style={s.rowTop}>
                  <View>
                    <Eyebrow>{sel.asset.assetNumber} · {sel.asset.name}</Eyebrow>
                    <Text style={s.sheetTitle}>{sel.shift === 'DAY' ? 'Day' : 'Night'} shift · {new Date(sel.date).toLocaleDateString()}</Text>
                  </View>
                  <Pressable onPress={() => setSel(null)} hitSlop={10}><Text style={s.close}>Close</Text></Pressable>
                </View>

                <Text style={[s.status, { color: TONE[sel.status], fontSize: 13 }]}>{LABEL[sel.status]}</Text>

                <View style={s.grid}>
                  <Detail k="Total drilled" v={`${sel.totalMeters} m`} strong />
                  <Detail k="Holes completed" v={String(sel.holesCompleted)} />
                  <Detail k="Hole reference" v={sel.holeRef} />
                  <Detail k="Start depth" v={`${sel.startDepth} m`} />
                  <Detail k="End depth" v={`${sel.endDepth} m`} />
                  <Detail k="Hole diameter" v={`${sel.holeDiameterMm} mm`} />
                  <Detail k="Penetration rate" v={`${sel.penetrationRate} m/h`} />
                  <Detail k="Rock type" v={sel.rockType} />
                  <Detail k="Downtime" v={`${sel.downtimeHours} h`} />
                  {sel.downtimeReason ? <Detail k="Downtime reason" v={sel.downtimeReason} /> : null}
                  <Detail k="Submitted by" v={`${sel.user.employeeId} — ${sel.user.name}`} />
                  <Detail k="Submitted" v={new Date(sel.submittedAt).toLocaleString()} />
                  {sel.approvedAt ? <Detail k="Approved" v={new Date(sel.approvedAt).toLocaleString()} /> : null}
                </View>

                {!!sel.chemicals?.length && (
                  <View style={{ gap: 4 }}>
                    <Eyebrow>Consumables</Eyebrow>
                    {sel.chemicals.map((c) => (
                      <Text key={c.id} style={s.chem}>{c.name ?? 'Item'} — {c.quantity} {c.unit.toLowerCase()}</Text>
                    ))}
                  </View>
                )}

                <Text style={s.note}>Total drilled is worked out from the start and end depths — it is never typed in by the operator.</Text>

                {sel.status === 'SUBMITTED' && canApprove && (
                  <Button title={busy ? 'Approving…' : 'Approve'} onPress={() => approve(sel)} disabled={busy} />
                )}
                {sel.status !== 'UNLOCKED' && canUnlock && (
                  <Button title="Unlock for correction" variant="ghost" onPress={() => { setUnlockFor(sel); setReason(''); }} disabled={busy} />
                )}
                {sel.status === 'UNLOCKED' && (
                  <Text style={[s.note, { color: colors.hazard }]}>Unlocked — waiting for the driller to resubmit.</Text>
                )}
                {!canApprove && !canUnlock && (
                  <Text style={s.note}>You can read this report but not approve it. Approval is a supervisor or manager task.</Text>
                )}
                {error && <Text style={s.err}>{error}</Text>}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Unlocking is audited, so the reason is required rather than optional. */}
      <Modal visible={!!unlockFor} animationType="fade" transparent onRequestClose={() => setUnlockFor(null)}>
        <View style={s.backdrop}>
          <View style={s.dialog}>
            <Eyebrow>Unlock for correction</Eyebrow>
            <Text style={s.dialogText}>
              {unlockFor ? `${unlockFor.asset.assetNumber} · ${unlockFor.shift === 'DAY' ? 'day' : 'night'} shift · ${new Date(unlockFor.date).toLocaleDateString()}` : ''}
            </Text>
            <Text style={s.hint}>The reason is recorded in the audit trail.</Text>
            <TextInput
              style={s.input}
              value={reason}
              onChangeText={setReason}
              placeholder="Why is this being sent back?"
              placeholderTextColor="#9AA6B3"
              multiline
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><Button title="Cancel" variant="ghost" onPress={() => { setUnlockFor(null); setReason(''); }} /></View>
              <View style={{ flex: 1 }}><Button title={busy ? 'Unlocking…' : 'Unlock'} onPress={doUnlock} disabled={busy || !reason.trim()} /></View>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function Detail({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <View style={s.detail}>
      <Text style={s.dk}>{k}</Text>
      <Text style={[s.dv, strong && { fontSize: 16, fontWeight: '700', color: colors.navy800 }]}>{v}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  tabs: { flexDirection: 'row', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center' },
  tabOn: { backgroundColor: colors.navy800 },
  tabText: { fontSize: 11, fontWeight: '700', color: colors.muted, letterSpacing: 0.4 },
  tabTextOn: { color: '#fff' },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  num: { fontSize: 16, fontWeight: '700', color: colors.ink },
  status: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  meta: { color: colors.muted, fontSize: 13 },
  metres: { color: colors.ink, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'], marginTop: 2 },
  by: { color: colors.muted, fontSize: 12 },
  err: { color: colors.crit, fontSize: 13, fontWeight: '600' },
  backdrop: { flex: 1, backgroundColor: 'rgba(11,27,48,.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.canvas, maxHeight: '90%', borderTopWidth: 3, borderTopColor: colors.hazard },
  sheetTitle: { fontSize: 19, fontWeight: '700', color: colors.ink, marginTop: 3 },
  close: { color: colors.navy700, fontWeight: '700', fontSize: 13 },
  grid: { borderTopWidth: 1, borderTopColor: colors.line },
  detail: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.line },
  dk: { color: colors.muted, fontSize: 13, flexShrink: 0 },
  dv: { color: colors.ink, fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'right', fontVariant: ['tabular-nums'] },
  chem: { color: colors.ink, fontSize: 13 },
  note: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  dialog: { backgroundColor: colors.surface, margin: 16, padding: 16, gap: 8, borderWidth: 1, borderColor: colors.line },
  dialogText: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  hint: { color: colors.muted, fontSize: 12 },
  input: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 11, fontSize: 15, color: colors.ink, minHeight: 68, textAlignVertical: 'top' },
});
