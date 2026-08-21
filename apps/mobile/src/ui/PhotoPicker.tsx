import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { colors } from './theme';

export type Photo = { uri: string; base64: string; type: string };
/** Up to N photos, compressed client-side for weak site connectivity (SRS §5.2 / §7.2). */
export function PhotoPicker({ photos, onChange, max = 5, label = 'Photos' }: { photos: Photo[]; onChange: (p: Photo[]) => void; max?: number; label?: string }) {
  async function pick(camera: boolean) {
    const opts = { mediaType: 'photo' as const, includeBase64: true, quality: 0.6 as const, maxWidth: 1600, maxHeight: 1600, selectionLimit: max - photos.length };
    const r = camera ? await launchCamera({ ...opts, saveToPhotos: false }) : await launchImageLibrary(opts);
    const next = (r.assets ?? []).filter((a) => a.base64 && a.uri).map((a) => ({ uri: a.uri!, base64: a.base64!, type: a.type ?? 'image/jpeg' }));
    onChange([...photos, ...next].slice(0, max));
  }
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.label}>{label} <Text style={{ color: colors.muted, fontWeight: '400' }}>({photos.length}/{max})</Text></Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {photos.map((p, i) => <Pressable key={p.uri} onLongPress={() => onChange(photos.filter((_, j) => j !== i))}><Image source={{ uri: p.uri }} style={s.thumb} /></Pressable>)}
        {photos.length < max && <>
          <Pressable onPress={() => pick(true)} style={s.add}><Text style={s.addText}>📷{'\n'}Camera</Text></Pressable>
          <Pressable onPress={() => pick(false)} style={s.add}><Text style={s.addText}>🖼{'\n'}Library</Text></Pressable>
        </>}
      </View>
      {photos.length > 0 && <Text style={{ color: colors.muted, fontSize: 11 }}>Long-press a photo to remove it.</Text>}
    </View>
  );
}
const s = StyleSheet.create({ label: { fontSize: 13, fontWeight: '600', color: colors.ink }, thumb: { width: 72, height: 72, borderWidth: 1, borderColor: colors.line }, add: { width: 72, height: 72, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }, addText: { textAlign: 'center', fontSize: 11, color: colors.muted, fontWeight: '600' } });
