import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RequestPriorities, RequestPriorityLabel, RequestSchema, RequestTypeLabel, RequestTypes } from '@drillex/shared';
import { api, loadSession } from '../lib/api';
import { cached } from '../sync/cache';
import { enqueue, uuid } from '../sync/outbox';
import { PhotoPicker, Photo } from '../ui/PhotoPicker';
import type { RootStackParamList } from '../navigation';
import type { Asset } from './AssetsScreen';
import { Button, Card, Eyebrow } from '../ui';
import { Section, Segmented } from '../ui/form';
import { colors } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'RequestNew'>;

/**
 * New request (client spec §4A tab 7): type, priority, details and an optional photo. Machine and site come from the
 * person's assignment; date and submitter are filled in by the server. Works offline — queued and sent with signal.
 */
export default function RequestNewScreen({ navigation }: Props) {
  const [type, setType] = useState<(typeof RequestTypes)[number]>('CONSUMABLES');
  const [priority, setPriority] = useState<(typeof RequestPriorities)[number]>('MEDIUM');
  const [details, setDetails] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [mine, setMine] = useState<Asset[]>([]);
  const [assetId, setAssetId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    // Your own machines only: the request is about the machine you work on.
    Promise.all([cached('assets', () => api<Asset[]>('/assets')), loadSession()]).then(([a, sess]) => {
      const own = a.data.filter((x) => x.operators?.some((o) => o.userId === sess?.user.id));
      setMine(own); if (own.length) setAssetId(own[0].id);
    }).catch(() => {});
  }, []);

  async function submit() {
    setError(null);
    const id = uuid();
    const payload = { id, type, priority, details: details.trim(), assetId };
    const parsed = RequestSchema.safeParse(payload);
    if (!parsed.success) { setError(parsed.error.issues[0].path[0] === 'details' ? 'Describe what you need (at least a few words).' : parsed.error.issues[0].message); return; }
    setBusy(true);
    try {
      const machine = mine.find((m) => m.id === assetId)?.assetNumber;
      await enqueue('request', payload, `${RequestTypeLabel[type]} request${machine ? ` · ${machine}` : ''}`);
      for (const p of photos) await enqueue('attachment', { id: uuid(), ownerType: 'Request', ownerId: id, kind: 'PHOTO', contentType: p.type, base64: p.base64 }, 'Request · photo');
      Alert.alert('Request saved', 'It goes to the Operations Manager, Finance Manager and Admin as soon as you have signal. Their replies appear under Requests.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Card stripe={colors.navy700} style={{ paddingLeft: 18 }}><Eyebrow>New request · {new Date().toLocaleDateString()}</Eyebrow><Text style={s.lead}>Goes to the Operations Manager, Finance Manager and Admin.</Text></Card>
        <Section title="Request type">
          <View style={s.chips}>{RequestTypes.map((t) => <Pressable key={t} onPress={() => setType(t)} style={[s.chip, type === t && s.chipOn]}><Text style={[s.chipText, type === t && { color: '#fff' }]}>{RequestTypeLabel[t]}</Text></Pressable>)}</View>
        </Section>
        <Segmented label="Priority" value={priority} options={RequestPriorities.map((p) => ({ v: p, l: RequestPriorityLabel[p] }))} onChange={setPriority} tone={(v) => (v === 'URGENT' ? colors.crit : v === 'MEDIUM' ? colors.hazard : colors.navy800)} />
        {mine.length > 1 && (
          <Section title="Machine">
            <View style={s.chips}>{mine.map((m) => <Pressable key={m.id} onPress={() => setAssetId(m.id)} style={[s.chip, assetId === m.id && s.chipOn]}><Text style={[s.chipText, assetId === m.id && { color: '#fff' }]}>{m.assetNumber}</Text></Pressable>)}</View>
          </Section>
        )}
        {mine.length === 1 && <Text style={s.meta}>Machine: {mine[0].assetNumber} · {mine[0].name}</Text>}
        <Section title="Request details">
          <TextInput style={s.multi} value={details} onChangeText={setDetails} placeholder="What is needed, how many, and by when" placeholderTextColor="#9AA6B3" multiline />
        </Section>
        <Section title="Attachment (optional)"><PhotoPicker photos={photos} onChange={setPhotos} max={3} label="Photo, e.g. of a damaged part" /></Section>
        {error && <Text style={s.err}>{error}</Text>}
        <Button title={busy ? 'Saving…' : 'Send request'} onPress={submit} disabled={busy} />
        <Text style={s.help}>Works offline — saved on this phone and sent when you have signal.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const s = StyleSheet.create({
  lead: { color: colors.muted, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 9 },
  chipOn: { backgroundColor: colors.navy800, borderColor: colors.navy800 },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.ink },
  multi: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 12, minHeight: 120, textAlignVertical: 'top', color: colors.ink, fontSize: 15 },
  meta: { color: colors.muted, fontSize: 13 },
  err: { color: colors.crit, borderLeftWidth: 2, borderLeftColor: colors.crit, paddingLeft: 10 },
  help: { color: colors.muted, fontSize: 12, textAlign: 'center' },
});
