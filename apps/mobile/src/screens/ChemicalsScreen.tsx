import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { can, type PermissionMatrix } from '@drillex/shared';
import { api, loadSession } from '../lib/api';
import { cached } from '../sync/cache';
import { Button, Card, Eyebrow } from '../ui';
import { NumberField, Segmented } from '../ui/form';
import { colors } from '../ui/theme';

type Unit = 'LITRES' | 'KG' | 'BAGS';
type Chemical = { id: string; name: string; defaultUnit: Unit; unitCost?: string | null; monthlyBudget?: string | null };
type Draft = { id?: string; name: string; defaultUnit: Unit; unitCost: string; monthlyBudget: string };
const UNITS: { v: Unit; l: string }[] = [{ v: 'LITRES', l: 'Litres' }, { v: 'KG', l: 'kg' }, { v: 'BAGS', l: 'Bags' }];

/** Chemical master list (SRS §4.3): what drillers pick from when they log chemicals on a shift report. */
export default function ChemicalsScreen() {
  const [rows, setRows] = useState<Chemical[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [note, setNote] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, perms, sess] = await Promise.all([cached('chemicals', () => api<Chemical[]>('/chemicals')), cached('permissions', () => api<PermissionMatrix>('/roles/matrix')), loadSession()]);
      setRows(c.data); setCanWrite(!!can(perms.data, sess?.user.role, 'parts:write'));
      setNote(c.fromCache ? 'Offline — showing the last synced list.' : null);
    } catch (e) { setNote((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!draft) return;
    const body = { name: draft.name.trim(), defaultUnit: draft.defaultUnit, unitCost: draft.unitCost === '' ? null : Number(draft.unitCost), monthlyBudget: draft.monthlyBudget === '' ? null : Number(draft.monthlyBudget) };
    setBusy(true);
    try {
      await api(draft.id ? `/chemicals/${draft.id}` : '/chemicals', { method: draft.id ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      setDraft(null); await load();
    } catch (e) { Alert.alert('Could not save', (e as Error).message); } finally { setBusy(false); }
  }
  const open = (c?: Chemical) => setDraft(c ? { id: c.id, name: c.name, defaultUnit: c.defaultUnit, unitCost: c.unitCost != null ? String(Number(c.unitCost)) : '', monthlyBudget: c.monthlyBudget != null ? String(Number(c.monthlyBudget)) : '' } : { name: '', defaultUnit: 'LITRES', unitCost: '', monthlyBudget: '' });

  return (
    <>
      <FlatList
        style={{ backgroundColor: colors.canvas }} contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
        data={rows} keyExtractor={(c) => c.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListHeaderComponent={
          <View style={{ gap: 10, marginBottom: 4 }}>
            {canWrite && <Button title="+ Add chemical" onPress={() => open()} />}
            <Text style={s.lead}>The list drillers choose from on a shift report.</Text>
            {note && <Text style={s.note}>{note}</Text>}
          </View>
        }
        ListEmptyComponent={<Card><Text style={{ color: colors.muted }}>No chemicals yet.</Text></Card>}
        renderItem={({ item }) => (
          <Pressable onPress={canWrite ? () => open(item) : undefined} disabled={!canWrite}>
            <Card style={{ gap: 2 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={s.name}>{item.name}</Text><Text style={s.unit}>{UNITS.find((u) => u.v === item.defaultUnit)?.l}</Text></View>
              <Text style={s.meta}>{item.unitCost != null ? `$${Number(item.unitCost).toFixed(2)} per unit` : 'No unit cost'}{item.monthlyBudget != null ? ` · budget $${Number(item.monthlyBudget).toFixed(0)}/month` : ''}</Text>
            </Card>
          </Pressable>
        )}
      />
      <Modal visible={!!draft} animationType="slide" transparent onRequestClose={() => setDraft(null)}>
        <View style={s.backdrop}>
          <View style={s.sheet}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Eyebrow>{draft?.id ? 'Edit chemical' : 'New chemical'}</Eyebrow><Pressable onPress={() => setDraft(null)} hitSlop={10}><Text style={s.close}>Cancel</Text></Pressable></View>
            {draft && (
              <>
                <TextInput style={s.input} value={draft.name} onChangeText={(v) => setDraft({ ...draft, name: v })} placeholder="Name, e.g. Drilling foam" placeholderTextColor="#9AA6B3" />
                <Segmented label="Unit" value={draft.defaultUnit} options={UNITS} onChange={(v) => setDraft({ ...draft, defaultUnit: v })} />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <NumberField label="Unit cost" value={draft.unitCost} onChange={(v) => setDraft({ ...draft, unitCost: v })} unit="$" placeholder="—" />
                  <NumberField label="Monthly budget" value={draft.monthlyBudget} onChange={(v) => setDraft({ ...draft, monthlyBudget: v })} unit="$" placeholder="—" />
                </View>
                <Button title={busy ? 'Saving…' : 'Save'} onPress={save} disabled={busy || draft.name.trim().length < 2} />
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}
const s = StyleSheet.create({
  lead: { color: colors.muted, fontSize: 13 }, note: { color: colors.hazard, fontSize: 12 },
  name: { fontSize: 16, fontWeight: '700', color: colors.ink }, unit: { color: colors.muted, fontSize: 13, fontWeight: '600' }, meta: { color: colors.muted, fontSize: 13 },
  backdrop: { flex: 1, backgroundColor: 'rgba(11,27,48,.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.canvas, padding: 16, gap: 12, paddingBottom: 32, borderTopWidth: 3, borderTopColor: colors.hazard },
  close: { color: colors.muted, fontWeight: '700' },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16, color: colors.ink },
});
