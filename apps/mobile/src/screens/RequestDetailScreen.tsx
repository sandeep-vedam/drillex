import React, { useCallback, useEffect, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { can, requestNumber, RequestPriorityLabel, RequestStatusLabel, RequestTypeLabel, type PermissionMatrix, type RequestStatus } from '@drillex/shared';
import { api, loadSession } from '../lib/api';
import { cached } from '../sync/cache';
import type { RootStackParamList } from '../navigation';
import { Button, Card, Eyebrow } from '../ui';
import { colors } from '../ui/theme';
import { PRIORITY_COLOR, STATUS_COLOR, type RequestRow } from './RequestsScreen';

type Props = NativeStackScreenProps<RootStackParamList, 'RequestDetail'>;
type Detail = Omit<RequestRow, 'replies'> & { replies: { id: string; body: string; status: RequestStatus | null; createdAt: string; author: { employeeId: string; name: string } }[]; attachments?: { id: string; kind: string; url: string }[] };

/** One request with its replies; the office moves it Received → In Progress → Resolved (client spec §4A tab 7). */
export default function RequestDetailScreen({ route }: Props) {
  const { id } = route.params;
  const [r, setR] = useState<Detail | null>(null);
  const [manage, setManage] = useState(false);
  const [selfId, setSelfId] = useState<string | undefined>();
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api<Detail>(`/requests/${id}`).then(setR).catch((e) => setError((e as Error).message)), [id]);
  useEffect(() => {
    load();
    Promise.all([cached('permissions', () => api<PermissionMatrix>('/roles/matrix')), loadSession()]).then(([p, sess]) => { setManage(!!can(p.data, sess?.user.role, 'request:manage')); setSelfId(sess?.user.id); }).catch(() => {});
  }, [load]);

  async function send(status?: RequestStatus) {
    setBusy(true); setError(null);
    try { setR(await api<Detail>(`/requests/${id}/replies`, { method: 'POST', body: JSON.stringify({ body: reply.trim(), status }) })); setReply(''); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  if (!r) return <View style={{ flex: 1, backgroundColor: colors.canvas, padding: 16 }}>{error ? <Text style={s.err}>{error}</Text> : <Text style={s.meta}>Loading…</Text>}</View>;
  const canReply = manage || r.createdBy.id === selfId;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Card stripe={STATUS_COLOR[r.status]} style={{ paddingLeft: 18, gap: 6 }}>
          <Eyebrow>{RequestTypeLabel[r.type]} · <Text style={{ color: PRIORITY_COLOR[r.priority] }}>{RequestPriorityLabel[r.priority]}</Text></Eyebrow>
          <Text style={s.num}>{requestNumber(r.number)}</Text>
          <Text style={[s.status, { color: STATUS_COLOR[r.status] }]}>{RequestStatusLabel[r.status]}</Text>
          <Text style={s.meta}>{r.createdBy.employeeId} {r.createdBy.name}{r.asset ? ` · ${r.asset.assetNumber}` : ''} · {new Date(r.createdAt).toLocaleString()}</Text>
          <Text style={s.body}>{r.details}</Text>
          {!!r.attachments?.length && <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>{r.attachments.map((a) => <Image key={a.id} source={{ uri: a.url }} style={s.photo} />)}</View>}
        </Card>
        {r.replies.map((x) => (
          <View key={x.id} style={[s.reply, x.author.employeeId !== r.createdBy.employeeId && { borderLeftColor: colors.navy700 }]}>
            <Text style={s.meta}>{x.author.employeeId} {x.author.name} · {new Date(x.createdAt).toLocaleString()}{x.status ? ` · moved to ${RequestStatusLabel[x.status]}` : ''}</Text>
            {!!x.body && <Text style={s.body}>{x.body}</Text>}
          </View>
        ))}
        {!r.replies.length && <Text style={s.meta}>No replies yet.</Text>}
        {canReply && (
          <View style={{ gap: 10 }}>
            <TextInput style={s.multi} value={reply} onChangeText={setReply} placeholder={manage ? 'Reply to the requester…' : 'Add a follow-up…'} placeholderTextColor="#9AA6B3" multiline />
            {error && <Text style={s.err}>{error}</Text>}
            <Button title={busy ? 'Sending…' : 'Send reply'} onPress={() => send()} disabled={busy || !reply.trim()} />
            {manage && r.status === 'RECEIVED' && <Button title="Mark in progress" variant="ghost" onPress={() => send('IN_PROGRESS')} disabled={busy} />}
            {manage && r.status !== 'RESOLVED' && <Button title="Resolve" variant="ghost" onPress={() => send('RESOLVED')} disabled={busy} />}
            {manage && r.status === 'RESOLVED' && <Button title="Reopen" variant="ghost" onPress={() => send('IN_PROGRESS')} disabled={busy} />}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const s = StyleSheet.create({
  num: { fontFamily: 'Menlo', fontSize: 24, fontWeight: '800', color: colors.navy800 },
  status: { fontWeight: '800', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.6 },
  meta: { color: colors.muted, fontSize: 12 },
  body: { color: colors.ink, fontSize: 15, lineHeight: 21 },
  photo: { width: 90, height: 90, backgroundColor: colors.line },
  reply: { borderLeftWidth: 3, borderLeftColor: colors.line, paddingLeft: 12, gap: 2 },
  multi: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 12, minHeight: 90, textAlignVertical: 'top', color: colors.ink, fontSize: 15 },
  err: { color: colors.crit, borderLeftWidth: 2, borderLeftColor: colors.crit, paddingLeft: 10 },
});
