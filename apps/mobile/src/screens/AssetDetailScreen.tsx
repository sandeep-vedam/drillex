import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, loadSession } from '../lib/api';
import { AssetStatuses, can, type PermissionMatrix } from '@drillex/shared';
import { cached } from '../sync/cache';
import type { RootStackParamList } from '../navigation';
import { Button, Card, Eyebrow, StatusChip } from '../ui';
import { Section, Segmented } from '../ui/form';
import { PhotoPicker, type Photo } from '../ui/PhotoPicker';
import { colors } from '../ui/theme';
import type { Asset } from './AssetsScreen';

type Props = NativeStackScreenProps<RootStackParamList, 'AssetDetail'>;

const CATEGORY: Record<string, string> = {
  DRILLING: 'Drilling', HAULAGE: 'Haulage', COMPRESSOR: 'Compressor', ANCILLARY: 'Ancillary', OTHER: 'Other',
};
const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Active', UNDER_MAINTENANCE: 'Maintenance', IDLE: 'Idle', DECOMMISSIONED: 'Decommissioned',
};

/**
 * Asset detail and edit, matching the web asset page. The asset number and category are deliberately
 * read-only — the number is derived from the category and is immutable (SRS 3.1).
 */
export default function AssetDetailScreen({ navigation, route }: Props) {
  const initial = route.params.asset;
  const [asset, setAsset] = useState<Asset>(initial);
  const [status, setStatus] = useState(initial.status);
  const [notes, setNotes] = useState(initial.notes ?? '');
  const [matrix, setMatrix] = useState<PermissionMatrix | null>(null);
  const [role, setRole] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(0);
  const [existing, setExisting] = useState<{ id: string; kind: string; url: string }[]>([]);

  const loadAttachments = useCallback(async () => {
    try { setExisting(await api<{ id: string; kind: string; url: string }[]>(`/attachments?ownerType=Asset&ownerId=${initial.id}`)); }
    catch { /* photos are supporting detail, not worth blocking the screen for */ }
  }, [initial.id]);
  useEffect(() => { loadAttachments(); }, [loadAttachments]);

  /** Posted straight to the server rather than queued: this is a desk-side job, not a rig-side one. */
  async function uploadPhotos() {
    if (!photos.length) return;
    setUploading(true); setError(null);
    try {
      for (const ph of photos) {
        await api('/attachments', {
          method: 'POST',
          body: JSON.stringify({ ownerType: 'Asset', ownerId: asset.id, kind: 'PHOTO', contentType: ph.type, base64: ph.base64 }),
        });
      }
      setUploaded(photos.length); setPhotos([]); await loadAttachments();
    } catch (e) { setError((e as Error).message); } finally { setUploading(false); }
  }

  const load = useCallback(async () => {
    try {
      const [fresh, perms, sess] = await Promise.all([
        api<Asset>(`/assets/${initial.id}`),
        cached('permissions', () => api<PermissionMatrix>('/roles/matrix')),
        loadSession(),
      ]);
      setAsset(fresh); setStatus(fresh.status); setNotes(fresh.notes ?? '');
      setMatrix(perms.data); setRole(sess?.user.role);
    } catch (e) { setError((e as Error).message); }
  }, [initial.id]);
  useEffect(() => { load(); }, [load]);

  const canWrite = !!role && !!matrix && !!can(matrix, role, 'asset:write');
  const dirty = status !== asset.status || notes !== (asset.notes ?? '');

  async function save() {
    setBusy(true); setError(null); setSaved(false);
    try {
      // PATCH is partial, so send only what changed rather than echoing the whole record back.
      const body: Record<string, unknown> = {};
      if (status !== asset.status) body.status = status;
      if (notes !== (asset.notes ?? '')) body.notes = notes;
      const updated = await api<Asset>(`/assets/${asset.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      setAsset(updated); setSaved(true);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  function confirmRemove() {
    Alert.alert(
      'Remove this machine?',
      `${asset.assetNumber} will be removed from the register. Its readings and reports are kept.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: async () => {
            setBusy(true); setError(null);
            try { await api(`/assets/${asset.id}`, { method: 'DELETE' }); navigation.goBack(); }
            catch (e) { setError((e as Error).message); setBusy(false); }
          } },
      ],
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: 6 }}>
          <View style={s.rowTop}>
            <Text style={s.num}>{asset.assetNumber}</Text>
            <StatusChip status={asset.status} />
          </View>
          <Text style={s.name}>{asset.name}</Text>
          <Text style={s.meta}>{asset.make} {asset.model}</Text>
        </Card>

        {existing.length > 0 && (
          <Section title="Photos">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {existing.map((a) => (
                <Image key={a.id} source={{ uri: a.url }} style={s.photo} resizeMode="cover" />
              ))}
            </ScrollView>
          </Section>
        )}

        <Section title="Details">
          <View style={{ borderTopWidth: 1, borderTopColor: colors.line }}>
            <Row k="Category" v={CATEGORY[asset.category] ?? asset.category} />
            <Row k="Serial number" v={asset.serialNumber} />
            <Row k="Year built" v={String(asset.yearOfManufacture)} />
            <Row k="Commissioned" v={new Date(asset.commissionedAt).toLocaleDateString()} />
            <Row k="Operators assigned" v={String(asset.operators?.length ?? 0)} />
          </View>
          <Text style={s.note}>The machine number and category cannot be changed — the number is generated from the category and is never reused.</Text>
        </Section>

        {canWrite ? (
          <Section title="Update">
            <Segmented
              label="Status"
              value={status}
              options={AssetStatuses.map((v) => ({ v, l: STATUS_LABEL[v] ?? v })) as never}
              onChange={setStatus}
              tone={(v) => (v === 'ACTIVE' ? colors.ok : v === 'UNDER_MAINTENANCE' ? colors.hazard : v === 'DECOMMISSIONED' ? colors.crit : colors.steel)}
            />
            <View style={{ gap: 6, marginTop: 10 }}>
              <Text style={s.label}>Notes</Text>
              <ScrollView style={{ maxHeight: 140 }} keyboardShouldPersistTaps="handled">
                <NotesInput value={notes} onChange={setNotes} />
              </ScrollView>
            </View>
            {error && <Text style={s.err}>{error}</Text>}
            {saved && !dirty && <Text style={s.ok}>Saved.</Text>}
            <View style={{ gap: 8, marginTop: 14 }}>
              <PhotoPicker photos={photos} onChange={setPhotos} max={5} label="Photos of this machine" />
              {photos.length > 0 && (
                <Button title={uploading ? 'Uploading…' : `Upload ${photos.length} photo${photos.length > 1 ? 's' : ''}`} onPress={uploadPhotos} disabled={uploading} />
              )}
              {uploaded > 0 && photos.length === 0 && <Text style={s.ok}>{uploaded} photo{uploaded > 1 ? 's' : ''} added.</Text>}
            </View>
            <View style={{ gap: 8, marginTop: 10 }}>
              <Button title={busy ? 'Saving…' : 'Save changes'} onPress={save} disabled={busy || !dirty} />
              <Button title="Remove from register" variant="ghost" onPress={confirmRemove} disabled={busy} />
            </View>
          </Section>
        ) : (
          <Text style={s.note}>You can view this machine but not change it. Editing the register is a supervisor or administrator task.</Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={s.detail}>
      <Text style={s.dk}>{k}</Text>
      <Text style={s.dv}>{v}</Text>
    </View>
  );
}

function NotesInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <TextInput
      style={s.notes}
      value={value}
      onChangeText={onChange}
      placeholder="Anything the next person should know about this machine"
      placeholderTextColor="#9AA6B3"
      multiline
    />
  );
}

const s = StyleSheet.create({
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  num: { fontFamily: 'Menlo', fontWeight: '800', color: colors.navy800, fontSize: 15 },
  name: { fontSize: 20, fontWeight: '700', color: colors.ink },
  meta: { color: colors.muted, fontSize: 14 },
  detail: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  dk: { color: colors.muted, fontSize: 13, flexShrink: 0 },
  dv: { color: colors.ink, fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  label: { fontSize: 13, fontWeight: '600', color: colors.ink },
  notes: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 11, fontSize: 15, color: colors.ink, minHeight: 84, textAlignVertical: 'top' },
  photo: { width: 104, height: 104, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  note: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 8 },
  err: { color: colors.crit, fontSize: 13, fontWeight: '600', marginTop: 8 },
  ok: { color: colors.ok, fontSize: 13, fontWeight: '600', marginTop: 8 },
});
