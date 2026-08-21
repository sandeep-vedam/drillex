import React from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { colors } from './theme';

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={{ gap: 12 }}><Text style={s.section}>{title}</Text>{children}</View>;
}
export function Segmented<T extends string>({ label, value, options, onChange, tone }: { label: string; value: T; options: { v: T; l: string }[]; onChange: (v: T) => void; tone?: (v: T) => string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <View style={s.seg}>
        {options.map((o) => { const on = o.v === value; const c = tone?.(o.v) ?? colors.navy800; return (
          <Pressable key={o.v} onPress={() => onChange(o.v)} style={[s.segBtn, on && { backgroundColor: c }]}><Text style={[s.segText, on && { color: '#fff' }]}>{o.l}</Text></Pressable>
        ); })}
      </View>
    </View>
  );
}
export function NumberField({ label, value, onChange, unit, placeholder }: { label: string; value: string; onChange: (v: string) => void; unit?: string; placeholder?: string }) {
  return (
    <View style={{ gap: 6, flex: 1 }}>
      <Text style={s.label}>{label}</Text>
      <View style={s.numWrap}><TextInput style={s.num} keyboardType="decimal-pad" value={value} onChangeText={onChange} placeholder={placeholder ?? '0'} placeholderTextColor="#9AA6B3" />{unit && <Text style={s.unit}>{unit}</Text>}</View>
    </View>
  );
}
export function Toggle({ label, value, onChange, note, onNote, notePlaceholder }: { label: string; value: boolean; onChange: (v: boolean) => void; note?: string; onNote?: (v: string) => void; notePlaceholder?: string }) {
  return (
    <View style={[s.toggle, value && { borderColor: colors.crit, backgroundColor: '#C2342A0D' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={[s.toggleLabel, value && { color: colors.crit }]}>{label}</Text>
        <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.crit, false: colors.line }} thumbColor="#fff" />
      </View>
      {value && onNote && <TextInput style={s.note} value={note} onChangeText={onNote} placeholder={notePlaceholder ?? 'Describe…'} placeholderTextColor="#9AA6B3" multiline />}
    </View>
  );
}
export function Rating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const label = ['', 'Poor', 'Fair', 'OK', 'Good', 'Excellent'][value] ?? '';
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>Machine condition rating <Text style={{ color: value <= 2 ? colors.crit : colors.muted, fontWeight: '400' }}>— {label}</Text></Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[1, 2, 3, 4, 5].map((n) => <Pressable key={n} onPress={() => onChange(n)} style={[s.star, n <= value && { backgroundColor: value <= 2 ? colors.crit : value === 3 ? colors.warn : colors.ok, borderColor: 'transparent' }]}><Text style={[s.starText, n <= value && { color: '#fff' }]}>{n}</Text></Pressable>)}
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  section: { fontSize: 11, fontWeight: '700', letterSpacing: 1.6, textTransform: 'uppercase', color: colors.muted, marginTop: 8 },
  label: { fontSize: 13, fontWeight: '600', color: colors.ink },
  seg: { flexDirection: 'row', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  segBtn: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  segText: { fontSize: 12, fontWeight: '700', color: colors.muted },
  numWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  num: { flex: 1, paddingHorizontal: 12, paddingVertical: 12, fontSize: 18, color: colors.ink, fontVariant: ['tabular-nums'] },
  unit: { paddingHorizontal: 10, color: colors.muted, fontSize: 12, fontWeight: '700' },
  toggle: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 12, gap: 8 },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: colors.ink },
  note: { borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff', padding: 10, minHeight: 56, textAlignVertical: 'top', color: colors.ink },
  star: { flex: 1, aspectRatio: 1, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  starText: { fontWeight: '800', fontSize: 18, color: colors.muted },
});
