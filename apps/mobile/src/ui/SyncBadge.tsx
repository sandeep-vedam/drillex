import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { flush, subscribe, SyncState } from '../sync/outbox';
import { colors } from './theme';

/** Always-visible sync status (SRS §9.2). Tap to retry. */
export function SyncBadge({ onPress }: { onPress?: () => void }) {
  const [s, setS] = useState<SyncState>({ online: true, syncing: false, pending: 0, failed: 0 });
  useEffect(() => subscribe(setS), []);
  const tone = s.failed ? colors.crit : !s.online ? colors.steel : s.pending || s.syncing ? colors.hazard : colors.ok;
  const label = s.failed ? `${s.failed} failed` : s.syncing ? 'Syncing…' : !s.online ? (s.pending ? `Offline · ${s.pending} queued` : 'Offline') : s.pending ? `${s.pending} pending` : 'Synced';
  return (
    <Pressable onPress={onPress ?? (() => void flush())} style={[st.wrap, { borderColor: tone }]} accessibilityLabel={`Sync status: ${label}`}>
      <View style={[st.dot, { backgroundColor: tone }]} /><Text style={[st.text, { color: tone }]}>{label}</Text>
    </Pressable>
  );
}
const st = StyleSheet.create({ wrap: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: 'rgba(255,255,255,.9)' }, dot: { width: 7, height: 7, borderRadius: 4 }, text: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 } });
