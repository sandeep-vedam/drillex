import React, { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, Image } from 'react-native';
import SignatureScreen, { SignatureViewRef } from 'react-native-signature-canvas';
import { colors } from './theme';

/** Operator digital signature (SRS §4.2/§5.2). Returns a PNG data URL. */
export function SignaturePad({ value, onChange, label = 'Operator signature' }: { value: string | null; onChange: (dataUrl: string | null) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<SignatureViewRef>(null);
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <Pressable onPress={() => setOpen(true)} style={[s.box, value && { borderColor: colors.ok }]}>
        {value ? <Image source={{ uri: value }} style={{ width: '100%', height: 96 }} resizeMode="contain" /> : <Text style={{ color: colors.muted }}>Tap to sign</Text>}
      </Pressable>
      {value && <Pressable onPress={() => onChange(null)}><Text style={{ color: colors.crit, fontWeight: '700', fontSize: 12 }}>Clear signature</Text></Pressable>}
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: colors.canvas }}>
          <View style={s.modalHead}><Text style={s.modalTitle}>Sign below</Text><Pressable onPress={() => setOpen(false)}><Text style={{ color: colors.muted, fontWeight: '700' }}>Cancel</Text></Pressable></View>
          <View style={{ flex: 1, margin: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff' }}>
            <SignatureScreen ref={ref} onOK={(sig) => { onChange(sig); setOpen(false); }} onEmpty={() => {}} descriptionText="" webStyle={`.m-signature-pad--footer {display:none} .m-signature-pad {box-shadow:none;border:0} body,html {background:#fff}`} backgroundColor="#fff" penColor="#0B1B30" />
          </View>
          <View style={{ flexDirection: 'row', gap: 10, padding: 16 }}>
            <Pressable onPress={() => ref.current?.clearSignature()} style={[s.btn, s.btnGhost]}><Text style={[s.btnText, { color: colors.navy800 }]}>Clear</Text></Pressable>
            <Pressable onPress={() => ref.current?.readSignature()} style={s.btn}><Text style={s.btnText}>Use signature</Text></Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
const s = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: colors.ink },
  box: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line, backgroundColor: colors.surface, minHeight: 100, alignItems: 'center', justifyContent: 'center', padding: 8 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, paddingTop: 56 }, modalTitle: { fontSize: 20, fontWeight: '800', color: colors.navy800 },
  btn: { flex: 1, backgroundColor: colors.navy800, paddingVertical: 14, alignItems: 'center' }, btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.line }, btnText: { color: '#fff', fontWeight: '700' },
});
