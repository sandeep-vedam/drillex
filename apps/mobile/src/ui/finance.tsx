import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CreditStatusColor, CreditStatusLabel, ReviewStatusLabel } from '@drillex/shared';
import { amount, isoDay, type Badge as BadgeKey, type Review } from '../lib/finance';
import { colors } from './theme';

/** Finance header colour from the client spec (§6, §7 "Finance Header" token). */
export const FINANCE_HEADER = '#0D3060';

/** Credit urgency badge, spec §6.2 colours. Text is darkened a step so it stays readable on its tint. */
export function UrgencyBadge({ badge, daysRemaining }: { badge: BadgeKey; daysRemaining?: number | null }) {
  const c = CreditStatusColor[badge];
  const days = daysRemaining != null && badge !== 'PAID' && badge !== 'CASH_DUE' ? ` · ${daysRemaining <= 0 ? `${Math.abs(daysRemaining)}d over` : `${daysRemaining}d`}` : '';
  return (
    <View style={[s.badge, { backgroundColor: `${c}1F` }]}>
      <View style={{ width: 6, height: 6, backgroundColor: c }} />
      <Text style={[s.badgeText, { color: TEXT_ON_TINT[c] ?? c }]}>{CreditStatusLabel[badge].toUpperCase()}{days}</Text>
    </View>
  );
}
const TEXT_ON_TINT: Record<string, string> = { '#EF4444': '#B91C1C', '#F97316': '#C2410C', '#F59E0B': '#92400E', '#22C55E': '#15803D' };

export function ReviewChip({ r }: { r: Pick<Review, 'reviewStatus'> }) {
  const c = r.reviewStatus === 'APPROVED' ? colors.ok : r.reviewStatus === 'REJECTED' ? colors.crit : colors.hazard;
  return <View style={[s.badge, { backgroundColor: `${c}1A` }]}><Text style={[s.badgeText, { color: c }]}>{ReviewStatusLabel[r.reviewStatus]}</Text></View>;
}

/** Owed (red), settled, or in credit when the client has paid ahead. */
export function BalanceText({ v, c, style }: { v: number; c: string; style?: object }) {
  if (v > 0) return <Text style={[s.bal, { color: colors.crit, fontWeight: '700' }, style]}>{amount(v, c)} owed</Text>;
  if (v < 0) return <Text style={[s.bal, { color: colors.ok }, style]}>{amount(-v, c)} in credit</Text>;
  return <Text style={[s.bal, { color: colors.muted }, style]}>Settled</Text>;
}

export function Rejected({ reason }: { reason: string | null }) {
  return <View style={s.rejected}><Text style={{ color: colors.ink }}><Text style={{ fontWeight: '800', color: colors.crit }}>Rejected: </Text>{reason ?? 'no reason given'}</Text></View>;
}

/** Top tabs on the dark finance header (spec §6: a top-tab interface, not the operator bottom bar). Scrolls sideways on narrow phones. */
export function TopTabs<T extends string>({ tabs, value, onChange, dark }: { tabs: { key: T; label: string; count?: number }[]; value: T; onChange: (k: T) => void; dark?: boolean }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8 }}>
      {tabs.map((t) => {
        const on = t.key === value;
        return (
          <Pressable key={t.key} onPress={() => onChange(t.key)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={[s.tab, on && { borderBottomColor: dark ? colors.gold : colors.navy800 }]}>
            <Text style={[s.tabText, { color: dark ? (on ? '#fff' : 'rgba(255,255,255,.65)') : on ? colors.navy800 : colors.muted }]}>
              {t.label}{t.count ? <Text style={{ color: dark ? colors.gold : colors.hazard }}> {t.count}</Text> : null}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function Kpi({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <View style={s.kpi}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={[s.kpiValue, tone ? { color: tone } : null]} adjustsFontSizeToFit numberOfLines={3}>{value}</Text>
    </View>
  );
}

export type Option<T extends string = string> = { v: T; l: string; sub?: string; disabled?: boolean };

/**
 * A dropdown for long lists (machines, clients, deployments): tap to open a searchable list. Plain chips do not scale
 * past a handful of choices, and the app has no native picker dependency.
 */
export function Picker<T extends string>({ label, value, options, onChange, placeholder = 'Choose…', required, disabled, allowNone }: { label: string; value: T | ''; options: Option<T>[]; onChange: (v: T | '') => void; placeholder?: string; required?: boolean; disabled?: boolean; allowNone?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const insets = useSafeAreaInsets();
  const current = options.find((o) => o.v === value);
  const list = useMemo(() => { const n = q.trim().toLowerCase(); return n ? options.filter((o) => `${o.l} ${o.sub ?? ''}`.toLowerCase().includes(n)) : options; }, [q, options]);
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}{required ? <Text style={{ color: colors.crit }}> *</Text> : null}</Text>
      <Pressable disabled={disabled} onPress={() => { setQ(''); setOpen(true); }} accessibilityRole="button" accessibilityLabel={`${label}: ${current?.l ?? placeholder}`} style={[s.select, disabled && { opacity: 0.5 }]}>
        <Text style={[s.selectText, !current && { color: '#9AA6B3' }]} numberOfLines={1}>{current ? current.l : value === '' && allowNone ? allowNone : placeholder}</Text>
        <Text style={s.chev}>▾</Text>
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: insets.top }}>
          <View style={s.sheetHead}>
            <Text style={s.sheetTitle}>{label}</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={10} accessibilityRole="button"><Text style={{ color: '#fff', fontWeight: '700' }}>Close</Text></Pressable>
          </View>
          {options.length > 7 && <TextInput style={s.search} value={q} onChangeText={setQ} placeholder="Search…" placeholderTextColor="#9AA6B3" autoFocus />}
          <FlatList
            data={allowNone ? [{ v: '' as T, l: allowNone }, ...list] : list}
            keyExtractor={(o) => o.v || '_none'}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            ListEmptyComponent={<Text style={{ padding: 16, color: colors.muted }}>Nothing matches.</Text>}
            renderItem={({ item }) => (
              <Pressable disabled={item.disabled} onPress={() => { onChange(item.v); setOpen(false); }} style={({ pressed }) => [s.option, item.v === value && { backgroundColor: colors.navy100 }, pressed && { backgroundColor: colors.navy100 }, item.disabled && { opacity: 0.45 }]}>
                <Text style={s.optionText}>{item.l}</Text>
                {item.sub ? <Text style={s.optionSub}>{item.sub}</Text> : null}
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}

/** Date as YYYY-MM-DD, with one-tap Today / Yesterday since most entries are for one of those. */
export function DateField({ label, value, onChange, required, quick = true }: { label: string; value: string; onChange: (v: string) => void; required?: boolean; quick?: boolean }) {
  const today = isoDay();
  const yesterday = isoDay(new Date(Date.now() - 864e5));
  const bad = !!value && !/^\d{4}-\d{2}-\d{2}$/.test(value);
  return (
    <View style={{ gap: 6, flex: 1 }}>
      <Text style={s.label}>{label}{required ? <Text style={{ color: colors.crit }}> *</Text> : null}</Text>
      <TextInput style={[s.input, bad && { borderColor: colors.crit }]} value={value} onChangeText={(t) => onChange(t.replace(/[^\d-]/g, '').slice(0, 10))} placeholder="YYYY-MM-DD" placeholderTextColor="#9AA6B3" keyboardType="numbers-and-punctuation" maxLength={10} />
      {quick && (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {[{ v: today, l: 'Today' }, { v: yesterday, l: 'Yesterday' }].map((d) => (
            <Pressable key={d.l} onPress={() => onChange(d.v)} style={[s.quick, value === d.v && { backgroundColor: colors.navy800, borderColor: colors.navy800 }]}><Text style={[s.quickText, value === d.v && { color: '#fff' }]}>{d.l}</Text></Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

export function TextArea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput style={[s.input, { minHeight: 72, textAlignVertical: 'top' }]} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#9AA6B3" multiline />
    </View>
  );
}

const s = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 7, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  bal: { fontSize: 13, fontVariant: ['tabular-nums'] },
  rejected: { borderLeftWidth: 4, borderLeftColor: colors.crit, backgroundColor: '#C2342A0D', paddingHorizontal: 12, paddingVertical: 10 },
  tab: { paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabText: { fontSize: 14, fontWeight: '700' },
  kpi: { flexBasis: '47%', flexGrow: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, padding: 12, gap: 4 },
  kpiLabel: { fontSize: 10.5, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: colors.muted },
  kpiValue: { fontSize: 20, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
  label: { fontSize: 13, fontWeight: '600', color: colors.ink },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.ink },
  select: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 13, minHeight: 50 },
  selectText: { flex: 1, fontSize: 16, color: colors.ink },
  chev: { color: colors.muted, fontSize: 14, marginLeft: 8 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.navy900, paddingHorizontal: 16, paddingVertical: 14 },
  sheetTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  search: { margin: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 11, fontSize: 16, color: colors.ink },
  option: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.surface },
  optionText: { fontSize: 16, color: colors.ink, fontWeight: '600' },
  optionSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  quick: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 7 },
  quickText: { fontSize: 13, fontWeight: '600', color: colors.ink },
});
