import React, { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { colors, font } from './theme';

export function Eyebrow({ children, light }: { children: ReactNode; light?: boolean }) {
  return <Text style={[s.eyebrow, light && { color: 'rgba(255,255,255,.55)' }]}>{children}</Text>;
}
export function Mark({ size = 36 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, backgroundColor: colors.hazard, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.navy900, fontWeight: '900', fontSize: size * 0.62, lineHeight: size * 0.72 }}>D</Text>
    </View>
  );
}
export function Field({ label, hint, secureTextEntry, style, ...rest }: TextInputProps & { label: string; hint?: string }) {
  const [shown, setShown] = useState(false);
  const secure = !!secureTextEntry;
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}{hint ? <Text style={{ color: colors.muted, fontWeight: '400' }}>  {hint}</Text> : null}</Text>
      <View>
        <TextInput placeholderTextColor="#9AA6B3" secureTextEntry={secure && !shown} {...rest} style={[s.input, secure && { paddingRight: 52 }, style]} />
        {secure && (
          <Pressable
            onPress={() => setShown((v) => !v)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={shown ? 'Hide password' : 'Show password'}
            style={s.eyeBtn}
          >
            <Eye off={!shown} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

/** Drawn from plain views — the app has no SVG or icon-font dependency. */
function Eye({ off }: { off: boolean }) {
  return (
    <View style={{ width: 22, height: 16, alignItems: 'center', justifyContent: 'center' }}>
      <View style={s.eyeLens} />
      <View style={s.eyePupil} />
      {off && <View style={s.eyeSlash} />}
    </View>
  );
}
export function Button({ title, onPress, disabled, variant = 'primary' }: { title: string; onPress: () => void; disabled?: boolean; variant?: 'primary' | 'ghost' }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={({ pressed }) => [s.btn, variant === 'ghost' && s.btnGhost, (pressed || disabled) && { opacity: 0.6 }]}>
      <Text style={[s.btnText, variant === 'ghost' && { color: colors.navy800 }]}>{title}</Text>
    </Pressable>
  );
}
export function Card({ children, style, stripe }: { children: ReactNode; style?: ViewStyle; stripe?: string }) {
  return (
    <View style={[s.card, style]}>
      {stripe ? <View style={[s.stripe, { backgroundColor: stripe }]} /> : null}
      {children}
    </View>
  );
}
const STATUS: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: 'Active', color: colors.ok }, UNDER_MAINTENANCE: { label: 'Under maintenance', color: colors.hazard },
  IDLE: { label: 'Idle', color: colors.steel }, DECOMMISSIONED: { label: 'Decommissioned', color: colors.crit },
};
export function StatusChip({ status }: { status: string }) {
  const m = STATUS[status] ?? { label: status, color: colors.steel };
  return (
    <View style={[s.chip, { backgroundColor: m.color + '1A' }]}>
      <View style={{ width: 6, height: 6, backgroundColor: m.color }} />
      <Text style={{ color: m.color, fontSize: 11, fontWeight: '700', letterSpacing: 0.4 }}>{m.label}</Text>
    </View>
  );
}
export function Stat({ label, value, tone = colors.navy700 }: { label: string; value: string | number; tone?: string }) {
  return (
    <Card stripe={tone} style={{ flex: 1, paddingLeft: 18 }}>
      <Eyebrow>{label}</Eyebrow>
      <Text style={s.statValue}>{value}</Text>
    </Card>
  );
}

/**
 * Compact two-up navigation tile. The home screen offers up to fourteen destinations to an admin; as
 * full-width cards that was a wall of near-identical rows, so they go two to a line instead, with the
 * accent carried on a top rule rather than a side stripe to keep the tile short.
 */
export function Tile({ title, sub, tone, onPress }: { title: string; sub?: string; tone: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={sub ? `${title}. ${sub}` : title}
      style={({ pressed }) => [s.tile, pressed && { backgroundColor: colors.navy100 }]}
    >
      <View style={[s.tileRule, { backgroundColor: tone }]} />
      <Text style={s.tileTitle} numberOfLines={2}>{title}</Text>
      {sub ? <Text style={s.tileSub} numberOfLines={2}>{sub}</Text> : null}
    </Pressable>
  );
}

/** A status line that is deliberately not a button — it reports, it does not navigate. */
export function StatusLine({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <View style={s.statusLine}>
      <View style={[s.dot, { backgroundColor: tone }]} />
      <Text style={s.statusLabel}>{label}</Text>
      <Text style={[s.statusValue, { color: tone }]}>{value}</Text>
    </View>
  );
}

/**
 * Inline row action. These were bare <Text onPress> before, which gave a tap target only as tall as the
 * text — easy to miss with a gloved hand. This keeps the same quiet look but pads out to a real target.
 */
export function Action({ title, onPress, tone, disabled }: { title: string; onPress: () => void; tone?: string; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      hitSlop={6}
      style={({ pressed }) => [s.action, pressed && { backgroundColor: colors.navy100 }, disabled && { opacity: 0.4 }]}
    >
      <Text style={[s.actionText, tone ? { color: tone } : null]}>{title}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  action: { minHeight: 40, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: colors.line, justifyContent: 'center', alignItems: 'center' },
  actionText: { color: colors.navy700, fontWeight: '700', fontSize: 13 },
  tile: { flex: 1, minHeight: 78, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, paddingTop: 11, paddingBottom: 12, gap: 3, justifyContent: 'flex-start' },
  tileRule: { position: 'absolute', left: 0, right: 0, top: 0, height: 3 },
  tileTitle: { fontSize: 14, fontWeight: '700', color: colors.ink, lineHeight: 18 },
  tileSub: { fontSize: 11.5, color: colors.muted, lineHeight: 15 },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.line },
  dot: { width: 8, height: 8 },
  statusLabel: { flex: 1, fontSize: 13.5, color: colors.ink, fontWeight: '600' },
  statusValue: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },

  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.6, textTransform: 'uppercase', color: colors.muted },
  label: { fontSize: 13, fontWeight: '600', color: colors.ink },
  eyeBtn: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 48, alignItems: 'center', justifyContent: 'center' },
  eyeLens: { width: 21, height: 13, borderWidth: 1.6, borderColor: colors.muted, borderRadius: 9 },
  eyePupil: { position: 'absolute', width: 6.5, height: 6.5, borderRadius: 3.25, backgroundColor: colors.muted },
  eyeSlash: { position: 'absolute', width: 24, height: 1.6, backgroundColor: colors.muted, transform: [{ rotate: '-45deg' }] },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, color: colors.ink },
  btn: { backgroundColor: colors.navy800, paddingVertical: 15, alignItems: 'center' },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.line },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16, letterSpacing: 0.4 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, padding: 14, shadowColor: colors.navy900, shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2, overflow: 'hidden' },
  stripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  statValue: { fontSize: 34, color: colors.ink, marginTop: 6, fontVariant: ['tabular-nums'], ...font.display },
});
