import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Image, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, loadSession } from '../lib/api';
import { can, type PermissionMatrix } from '@drillex/shared';
import { cached } from '../sync/cache';
import { uuid } from '../sync/outbox';
import { SignaturePad } from '../ui/SignaturePad';
import { Action, Button, Card, Eyebrow } from '../ui';
import { colors } from '../ui/theme';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'JobCards'>;
type JCFull = Omit<JC, 'parts'> & { reportedFault?: string; hourMeter?: string; toolsUsed?: string; conditionBefore?: number; conditionAfter?: number; testResult?: string; nextAction?: string; parts: { id: string; quantity: number; part?: { partNo: string; name: string } }[]; attachments?: { id: string; kind: string; url: string }[] };
type JC = { id: string; jobNo: string; date: string; jobType: string; workPerformed: string; status: string; approvedAt?: string; techSignatureId?: string | null; labourHours?: string; asset: { assetNumber: string; name: string }; parts: { quantity: number }[] };
const TONE: Record<string, string> = { OPEN: colors.navy700, IN_PROGRESS: colors.hazard, AWAITING_PARTS: colors.warn, COMPLETED: colors.ok };
const TYPE: Record<string, string> = { SCHEDULED_SERVICE: 'Scheduled service', BREAKDOWN_REPAIR: 'Breakdown repair', MODIFICATION: 'Modification', INSPECTION: 'Inspection' };
/** The same six filters the web offers, including the sign-off queue — "To approve" is completed but
 *  not yet approved, which is a state no single status value expresses. */
const TABS: [string, string][] = [['ALL', 'All'], ['OPEN', 'Open'], ['IN_PROGRESS', 'Working'], ['AWAITING_PARTS', 'Parts'], ['APPROVAL', 'To approve'], ['COMPLETED', 'Done']];
const countFor = (rows: JC[], k: string) =>
  k === 'ALL' ? rows.length
  : k === 'APPROVAL' ? rows.filter((r) => r.status === 'COMPLETED' && !r.approvedAt).length
  : rows.filter((r) => r.status === k).length;

export default function JobCardsScreen({ navigation }: Props) {
  const [rows, setRows] = useState<JC[]>([]); const [refreshing, setRefreshing] = useState(false); const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<JCFull | null>(null);
  const [tab, setTab] = useState('ALL');
  const [matrix, setMatrix] = useState<PermissionMatrix | null>(null); const [role, setRole] = useState<string | undefined>(); const [busy, setBusy] = useState(false);
  const [finishing, setFinishing] = useState<JC | null>(null); const [signature, setSignature] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const [r, perms, sess] = await Promise.all([cached('jobcards', () => api<JC[]>('/job-cards')), cached('permissions', () => api<PermissionMatrix>('/roles/matrix')), loadSession()]);
      setRows(r.data); setMatrix(perms.data); setRole(sess?.user.role);
      setError(r.fromCache ? 'Offline — showing last synced list.' : null);
    } catch (e) { setError((e as Error).message); }
  }, []);
  const canApprove = !!role && !!matrix && !!can(matrix, role, 'job_card:approve');

  async function openCard(c: JC) {
    setSel(c as JCFull);
    try {
      const [full, atts] = await Promise.all([
        api<JCFull>(`/job-cards/${c.id}`),
        api<{ id: string; kind: string; url: string }[]>(`/attachments?ownerType=JobCard&ownerId=${c.id}`).catch(() => []),
      ]);
      setSel({ ...full, attachments: atts });
    } catch (e) { setError((e as Error).message); }
  }
  const canEdit = !!role && !!matrix && !!can(matrix, role, 'job_card:create');

  /** The state a card can move to next; the web offers the same set from its detail panel. */
  const NEXT: Record<string, { status: string; label: string }[]> = {
    OPEN: [{ status: 'IN_PROGRESS', label: 'Start work' }, { status: 'AWAITING_PARTS', label: 'Waiting on parts' }],
    IN_PROGRESS: [{ status: 'AWAITING_PARTS', label: 'Waiting on parts' }, { status: 'COMPLETED', label: 'Finished' }],
    AWAITING_PARTS: [{ status: 'IN_PROGRESS', label: 'Parts arrived' }, { status: 'COMPLETED', label: 'Finished' }],
    COMPLETED: [],
  };
  async function setStatus(c: JC, status: string) {
    // Completing needs the technician's signature (SRS §7.6); a card signed when it was created can go straight through.
    if (status === 'COMPLETED' && !c.techSignatureId) { setSignature(null); setFinishing(c); return; }
    setBusy(true); setError(null);
    try { await api(`/job-cards/${c.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); await load(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  /** Uploads the signature against the card, then marks it completed — the server checks the signature is on file. */
  async function signAndFinish() {
    if (!finishing || !signature) return;
    setBusy(true); setError(null);
    try {
      const sigId = uuid();
      await api('/attachments', { method: 'POST', body: JSON.stringify({ id: sigId, ownerType: 'JobCard', ownerId: finishing.id, kind: 'SIGNATURE', contentType: 'image/png', base64: signature.replace(/^data:image\/png;base64,/, '') }) });
      await api(`/job-cards/${finishing.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'COMPLETED', techSignatureAttachmentId: sigId }) });
      setFinishing(null); await load();
    } catch (e) { Alert.alert('Could not complete the job card', (e as Error).message); } finally { setBusy(false); }
  }

  /** Sign-off is final, so confirm before posting it. */
  function confirmApprove(c: JC) {
    Alert.alert('Approve job card?', `${c.jobNo} on ${c.asset.assetNumber} will be signed off as correct.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve', onPress: async () => {
          setBusy(true); setError(null);
          try { await api(`/job-cards/${c.id}/approve`, { method: 'POST' }); await load(); }
          catch (e) { setError((e as Error).message); } finally { setBusy(false); }
        } },
    ]);
  }
  const shown = tab === 'ALL' ? rows
    : tab === 'APPROVAL' ? rows.filter((r) => r.status === 'COMPLETED' && !r.approvedAt)
    : rows.filter((r) => r.status === tab);
  useEffect(() => { const u = navigation.addListener('focus', load); return u; }, [navigation, load]);
  return (
    <>
    <FlatList style={{ backgroundColor: colors.canvas }} contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }} data={shown} keyExtractor={(r) => r.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      ListHeaderComponent={
        <View style={{ gap: 10, marginBottom: 4 }}>
          <Button title="+ New job card" onPress={() => navigation.navigate('JobCardNew', {})} />
          {error && <Text style={{ color: colors.hazard, fontSize: 12 }}>{error}</Text>}
          <Eyebrow>{canApprove ? 'Job cards' : 'My job cards'}</Eyebrow>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={s.tabs}>
              {TABS.map(([k, l]) => (
                <Pressable key={k} onPress={() => setTab(k)} style={[s.tab, tab === k && s.tabOn]}>
                  <Text style={[s.tabText, tab === k && s.tabTextOn]}>{l} {countFor(rows, k)}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>
      }
      ListEmptyComponent={<Card><Text style={{ color: colors.muted }}>{tab === 'ALL' ? 'No job cards yet.' : 'Nothing in this list.'}</Text></Card>}
      renderItem={({ item }) => (
        <Card stripe={TONE[item.status]} style={{ paddingLeft: 18, gap: 4 }}>
          <Pressable onPress={() => openCard(item)} accessibilityRole="button">
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={s.num}>{item.jobNo}</Text><Text style={[s.badge, { color: item.approvedAt ? colors.ok : TONE[item.status] }]}>{item.approvedAt ? 'APPROVED' : item.status.replace('_', ' ')}</Text></View>
          <Text style={s.asset}>{item.asset.assetNumber} <Text style={{ color: colors.muted, fontWeight: '400' }}>{item.asset.name} · {TYPE[item.jobType]}</Text></Text>
          <Text numberOfLines={2} style={s.work}>{item.workPerformed}</Text>
          <Text style={s.meta}>{new Date(item.date).toLocaleDateString()}{item.labourHours ? ` · ${Number(item.labourHours)} h labour` : ''}{item.parts.length ? ` · ${item.parts.length} part line(s)` : ''}</Text>
          </Pressable>
          {canEdit && !item.approvedAt && (NEXT[item.status] ?? []).length > 0 && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {(NEXT[item.status] ?? []).map((n) => (
                <Action key={n.status} title={n.label} onPress={() => setStatus(item, n.status)} disabled={busy} />
              ))}
            </View>
          )}
          {canApprove && item.status === 'COMPLETED' && !item.approvedAt && (
            <Pressable onPress={() => confirmApprove(item)} disabled={busy} style={({ pressed }) => [s.approve, pressed && { opacity: 0.6 }]}>
              <Text style={s.approveText}>{busy ? 'Approving…' : 'Approve'}</Text>
            </Pressable>
          )}
        </Card>
      )} />

    <Modal visible={!!finishing} animationType="slide" transparent onRequestClose={() => setFinishing(null)}>
      <View style={s.backdrop}>
        <View style={[s.sheet, { padding: 16, gap: 12, paddingBottom: 28 }]}>
          <View style={s.sheetTop}>
            <View><Eyebrow>Sign off</Eyebrow><Text style={s.sheetTitle}>{finishing?.jobNo}</Text></View>
            <Pressable onPress={() => setFinishing(null)} hitSlop={10}><Text style={s.close}>Cancel</Text></Pressable>
          </View>
          <Text style={{ color: colors.muted }}>The technician signs to confirm the work is finished. It then goes to a supervisor for approval.</Text>
          <SignaturePad value={signature} onChange={setSignature} label="Technician signature" />
          <Button title={busy ? 'Saving…' : 'Sign & mark completed'} onPress={signAndFinish} disabled={busy || !signature} />
        </View>
      </View>
    </Modal>

    <Modal visible={!!sel} animationType="slide" transparent onRequestClose={() => setSel(null)}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 28 }}>
            {sel && (
              <>
                <View style={s.sheetTop}>
                  <View><Eyebrow>{sel.asset.assetNumber} · {TYPE[sel.jobType] ?? sel.jobType}</Eyebrow><Text style={s.sheetTitle}>{sel.jobNo}</Text></View>
                  <Pressable onPress={() => setSel(null)} hitSlop={10}><Text style={s.close}>Close</Text></Pressable>
                </View>

                {!!sel.attachments?.length && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {sel.attachments.map((a) => (
                      <Image key={a.id} source={{ uri: a.url }} style={[s.photo, a.kind === 'SIGNATURE' && { backgroundColor: '#fff' }]} resizeMode={a.kind === 'SIGNATURE' ? 'contain' : 'cover'} />
                    ))}
                  </ScrollView>
                )}

                <View style={{ borderTopWidth: 1, borderTopColor: colors.line }}>
                  <D k="Date" v={new Date(sel.date).toLocaleDateString()} />
                  <D k="Status" v={(sel.approvedAt ? 'Approved' : sel.status.replace('_', ' ').toLowerCase())} />
                  {sel.reportedFault ? <D k="Reported fault" v={sel.reportedFault} /> : null}
                  <D k="Work done" v={sel.workPerformed} />
                  {sel.hourMeter ? <D k="Hour meter" v={`${Number(sel.hourMeter)} h`} /> : null}
                  {sel.labourHours ? <D k="Labour" v={`${Number(sel.labourHours)} h`} /> : null}
                  {sel.toolsUsed ? <D k="Tools used" v={sel.toolsUsed} /> : null}
                  {sel.testResult ? <D k="Test result" v={sel.testResult} /> : null}
                  {sel.nextAction ? <D k="Next action" v={sel.nextAction} /> : null}
                </View>

                {!!sel.parts?.length && (
                  <View style={{ gap: 3 }}>
                    <Eyebrow>Parts used</Eyebrow>
                    {sel.parts.map((pl) => (
                      <Text key={pl.id} style={s.partLine}>{pl.quantity} × {pl.part ? `${pl.part.partNo} — ${pl.part.name}` : 'part'}</Text>
                    ))}
                  </View>
                )}
                {!sel.parts?.length && <Text style={s.meta}>No parts recorded against this card.</Text>}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
    </>
  );
}
function D({ k, v }: { k: string; v: string }) {
  return (
    <View style={s.detail}>
      <Text style={s.dk}>{k}</Text>
      <Text style={s.dv}>{v}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(11,27,48,.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.canvas, maxHeight: '90%', borderTopWidth: 3, borderTopColor: colors.hazard },
  sheetTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  sheetTitle: { fontSize: 19, fontWeight: '700', color: colors.ink, marginTop: 3, fontFamily: 'Menlo' },
  close: { color: colors.navy700, fontWeight: '700', fontSize: 13 },
  photo: { width: 104, height: 104, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  detail: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.line },
  dk: { color: colors.muted, fontSize: 13, flexShrink: 0 },
  dv: { color: colors.ink, fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  partLine: { fontSize: 13.5, color: colors.ink }, num: { fontFamily: 'Menlo', fontWeight: '800', color: colors.navy800 }, badge: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 }, asset: { fontFamily: 'Menlo', fontWeight: '700', color: colors.ink, fontSize: 13 }, work: { color: colors.ink, fontSize: 14 }, meta: { color: colors.muted, fontSize: 12 }, approve: { marginTop: 8, backgroundColor: colors.navy800, paddingVertical: 10, alignItems: 'center' }, approveText: { color: '#fff', fontWeight: '700', fontSize: 14, letterSpacing: 0.4 },
  tabs: { flexDirection: 'row', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  tab: { paddingVertical: 8, paddingHorizontal: 11, alignItems: 'center' },
  tabOn: { backgroundColor: colors.navy800 },
  tabText: { fontSize: 11, fontWeight: '700', color: colors.muted, letterSpacing: 0.4 },
  tabTextOn: { color: '#fff' },
});
