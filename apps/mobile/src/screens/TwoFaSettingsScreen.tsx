import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../lib/api';
import { Button, Eyebrow } from '../ui';
import { colors } from '../ui/theme';

export default function TwoFaSettingsScreen() {
  const [roles, setRoles] = useState<string[] | null>(null);
  const [saved, setSaved] = useState<string[] | null>(null);
  const [allRoles, setAllRoles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ roles: string[]; allRoles: string[] }>('/settings/2fa-roles').then((r) => { setRoles(r.roles); setSaved(r.roles); setAllRoles(r.allRoles); }).catch((e) => setError((e as Error).message));
  }, []);

  function toggle(role: string) {
    if (!roles) return;
    setRoles(roles.includes(role) ? roles.filter((r) => r !== role) : [...roles, role]);
  }
  async function save() {
    if (!roles) return;
    setBusy(true); setError(null);
    try { const r = await api<{ roles: string[] }>('/settings/2fa-roles', { method: 'PATCH', body: JSON.stringify({ roles }) }); setRoles(r.roles); setSaved(r.roles); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const dirty = !!roles && JSON.stringify([...roles].sort()) !== JSON.stringify([...(saved ?? [])].sort());

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48, backgroundColor: colors.canvas }}>
      <Eyebrow>Security</Eyebrow>
      <Text style={s.lead}>Choose which roles must enrol in two-factor authentication to sign in. Unchecked roles sign in with just employee ID and password.</Text>
      {error && <Text style={s.err}>{error}</Text>}
      {!roles && !error && <Text style={{ color: colors.muted }}>Loading…</Text>}
      {roles && (
        <>
          <View style={s.list}>
            {allRoles.map((role) => {
              const on = roles.includes(role);
              return (
                <Pressable key={role} onPress={() => toggle(role)} style={s.row}>
                  <View style={[s.box, on && { backgroundColor: colors.navy800, borderColor: colors.navy800 }]}>{on && <Text style={s.tick}>✓</Text>}</View>
                  <Text style={s.role}>{role}</Text>
                </Pressable>
              );
            })}
          </View>
          {roles.length === 0 && <Text style={s.warn}>No role currently requires 2FA — anyone can sign in with just a password.</Text>}
          <Button title={busy ? 'Saving…' : 'Save'} onPress={save} disabled={busy || !dirty} />
        </>
      )}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  lead: { color: colors.muted, fontSize: 13 },
  err: { color: colors.crit, fontSize: 13, fontWeight: '600' },
  warn: { color: colors.hazard, fontSize: 12 },
  list: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  box: { width: 20, height: 20, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  tick: { color: '#fff', fontSize: 13, fontWeight: '800', lineHeight: 16 },
  role: { fontFamily: 'Menlo', fontSize: 13, color: colors.ink, fontWeight: '700' },
});
