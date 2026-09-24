import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, loadSession } from '../lib/api';
import { can, type PermissionMatrix } from '@drillex/shared';
import { cached } from '../sync/cache';
import { Button, Card, Eyebrow } from '../ui';
import { colors } from '../ui/theme';

type Part = { id: string; partNo: string; name: string; qtyOnHand: number; minQty: number; unitCost?: string };
type Movement = { id: string; type: 'IN' | 'OUT' | 'ADJUST'; quantity: number; reference?: string; createdAt: string };
type PR = { id: string; quantity: number; status: 'OPEN' | 'ORDERED' | 'RECEIVED' | 'CANCELLED'; notes?: string; requestedBy: string; createdAt: string; part: { partNo: string; name: string } };
const PR_TONE: Record<string, string> = { OPEN: colors.hazard, ORDERED: colors.navy700, RECEIVED: colors.ok, CANCELLED: colors.steel };

/** Parts lookup for technicians in the field (PRD persona: job card list, parts lookup, maintenance due list). */
export default function PartsScreen() {
  const [parts, setParts] = useState<Part[]>([]);
  const [q, setQ] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [matrix, setMatrix] = useState<PermissionMatrix | null>(null);
  const [role, setRole] = useState<string | undefined>();
  const [sel, setSel] = useState<Part | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [prs, setPrs] = useState<PR[]>([]);
  const [showPrs, setShowPrs] = useState(false);
  const [moveQty, setMoveQty] = useState('');
  const [moveRef, setMoveRef] = useState('');
  const [prQty, setPrQty] = useState('');
  const [busy, setBusy] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [np, setNp] = useState({ partNo: '', name: '', qtyOnHand: '', minQty: '' });

  async function createPart() {
    if (!np.partNo.trim() || !np.name.trim()) { setNote('A part number and a name are both needed.'); return; }
    setBusy(true); setNote(null);
    try {
      await api('/parts', { method: 'POST', body: JSON.stringify({
        partNo: np.partNo.trim(), name: np.name.trim(),
        qtyOnHand: parseInt(np.qtyOnHand, 10) || 0, minQty: parseInt(np.minQty, 10) || 0,
      }) });
      setShowNew(false); setNp({ partNo: '', name: '', qtyOnHand: '', minQty: '' }); await load();
    } catch (e) { setNote((e as Error).message); } finally { setBusy(false); }
  }

  // Cached so the store is still searchable underground; the whole list is small enough to hold offline.
  const load = useCallback(async () => {
    try {
      const [r, perms, sess] = await Promise.all([
        cached('parts', () => api<Part[]>('/parts')),
        cached('permissions', () => api<PermissionMatrix>('/roles/matrix')),
        loadSession(),
      ]);
      setParts(r.data); setMatrix(perms.data); setRole(sess?.user.role);
      setNote(r.fromCache ? 'Offline — showing the last synced stock levels.' : null);
    } catch (e) { setNote((e as Error).message); }
  }, []);

  const canWrite = !!role && !!matrix && !!can(matrix, role, 'parts:write');

  async function openPart(p: Part) {
    setSel(p); setMovements([]); setMoveQty(''); setMoveRef(''); setPrQty('');
    try { setMovements(await api<Movement[]>(`/parts/${p.id}/movements`)); } catch { /* history is nice-to-have */ }
  }

  async function openPrs() {
    setShowPrs(true);
    try { setPrs(await api<PR[]>('/parts/purchase-requests/all')); } catch (e) { setNote((e as Error).message); }
  }

  /** IN books stock in, OUT draws it down; the server rejects an OUT larger than what is on hand. */
  async function move(type: 'IN' | 'OUT') {
    if (!sel) return;
    const n = parseInt(moveQty, 10);
    if (!Number.isFinite(n) || n <= 0) { setNote('Enter a whole number greater than zero.'); return; }
    setBusy(true); setNote(null);
    try {
      await api(`/parts/${sel.id}/movements`, { method: 'POST', body: JSON.stringify({ type, quantity: n, ...(moveRef.trim() ? { reference: moveRef.trim() } : {}) }) });
      await load();
      const fresh = await api<Movement[]>(`/parts/${sel.id}/movements`);
      setMovements(fresh); setMoveQty(''); setMoveRef('');
      setSel((c) => (c ? { ...c, qtyOnHand: c.qtyOnHand + (type === 'IN' ? n : -n) } : c));
    } catch (e) { setNote((e as Error).message); } finally { setBusy(false); }
  }

  async function raisePr() {
    if (!sel) return;
    const n = parseInt(prQty, 10);
    if (!Number.isFinite(n) || n <= 0) { setNote('Enter how many to order.'); return; }
    setBusy(true); setNote(null);
    try {
      await api('/parts/purchase-requests', { method: 'POST', body: JSON.stringify({ partId: sel.id, quantity: n }) });
      setPrQty('');
      Alert.alert('Purchase request raised', `${n} × ${sel.partNo} requested. A manager has been notified.`);
    } catch (e) { setNote((e as Error).message); } finally { setBusy(false); }
  }

  async function setPrStatus(pr: PR, status: 'ORDERED' | 'RECEIVED' | 'CANCELLED') {
    setBusy(true); setNote(null);
    try {
      await api(`/parts/purchase-requests/${pr.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setPrs(await api<PR[]>('/parts/purchase-requests/all'));
      if (status === 'RECEIVED') await load();
    } catch (e) { setNote((e as Error).message); } finally { setBusy(false); }
  }
  useEffect(() => { load(); }, [load]);

  const term = q.trim().toLowerCase();
  const rows = term ? parts.filter((p) => `${p.partNo} ${p.name}`.toLowerCase().includes(term)) : parts;
  const low = (p: Part) => p.qtyOnHand <= p.minQty;

  return (
    <>
    <FlatList
      style={{ backgroundColor: colors.canvas }}
      contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
      data={rows}
      keyExtractor={(p) => p.id}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <TextInput
            style={s.search}
            placeholder="Search part number or name…"
            placeholderTextColor="#9AA6B3"
            value={q}
            onChangeText={setQ}
            autoCorrect={false}
          />
          {note && <Text style={s.note}>{note}</Text>}
          {canWrite && <Button title="+ Add a part" onPress={() => setShowNew(true)} />}
          <Button title="Purchase requests" variant="ghost" onPress={openPrs} />
          <Eyebrow>{rows.length} of {parts.length} parts</Eyebrow>
        </View>
      }
      ListEmptyComponent={<Card><Text style={{ color: colors.muted }}>{parts.length ? 'No parts match that search.' : 'No parts in the store yet.'}</Text></Card>}
      renderItem={({ item }) => (
        <Pressable onPress={() => openPart(item)}>
        <Card stripe={low(item) ? colors.crit : colors.ok}>
          <View style={s.row}>
            <Text style={s.partNo}>{item.partNo}</Text>
            <Text style={[s.qty, low(item) && { color: colors.crit }]}>{item.qtyOnHand} in stock</Text>
          </View>
          <Text style={s.name}>{item.name}</Text>
          <Text style={s.meta}>
            Minimum {item.minQty}{item.unitCost ? ` · ${item.unitCost} each` : ''}
            {low(item) ? '  ·  LOW STOCK' : ''}
          </Text>
          <Text style={s.link}>{canWrite ? 'Adjust stock · order more  →' : 'Stock history  →'}</Text>
        </Card>
        </Pressable>
      )}
    />

    {/* Part detail: stock history, plus the write actions when the role allows them. */}
    <Modal visible={!!sel} animationType="slide" transparent onRequestClose={() => setSel(null)}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
            {sel && (
              <>
                <View style={s.row}>
                  <View style={{ flex: 1 }}>
                    <Eyebrow>{sel.partNo}</Eyebrow>
                    <Text style={s.sheetTitle}>{sel.name}</Text>
                  </View>
                  <Pressable onPress={() => setSel(null)} hitSlop={10}><Text style={s.close}>Close</Text></Pressable>
                </View>
                <Text style={[s.qty, low(sel) && { color: colors.crit }]}>{sel.qtyOnHand} in stock · minimum {sel.minQty}</Text>

                {canWrite && (
                  <View style={{ gap: 8 }}>
                    <Eyebrow>Adjust stock</Eyebrow>
                    <TextInput style={s.input} value={moveQty} onChangeText={setMoveQty} placeholder="How many" placeholderTextColor="#9AA6B3" keyboardType="number-pad" />
                    <TextInput style={s.input} value={moveRef} onChangeText={setMoveRef} placeholder="Reference (optional) — e.g. job card number" placeholderTextColor="#9AA6B3" />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <View style={{ flex: 1 }}><Button title="Book in" onPress={() => move('IN')} disabled={busy} /></View>
                      <View style={{ flex: 1 }}><Button title="Draw out" variant="ghost" onPress={() => move('OUT')} disabled={busy} /></View>
                    </View>
                    <Eyebrow>Order more</Eyebrow>
                    <TextInput style={s.input} value={prQty} onChangeText={setPrQty} placeholder="Quantity to order" placeholderTextColor="#9AA6B3" keyboardType="number-pad" />
                    <Button title={busy ? 'Working…' : 'Raise purchase request'} onPress={raisePr} disabled={busy} />
                  </View>
                )}

                <Eyebrow>Recent movements</Eyebrow>
                {movements.length === 0 && <Text style={s.note}>No movements recorded.</Text>}
                {movements.map((m) => (
                  <View key={m.id} style={s.mv}>
                    <Text style={[s.mvQty, { color: m.quantity < 0 ? colors.crit : colors.ok }]}>{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.mvType}>{m.type === 'IN' ? 'Booked in' : m.type === 'OUT' ? 'Drawn out' : 'Adjusted'}</Text>
                      <Text style={s.note}>{new Date(m.createdAt).toLocaleString()}{m.reference ? ` · ${m.reference}` : ''}</Text>
                    </View>
                  </View>
                ))}
                {note && <Text style={s.err}>{note}</Text>}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>

    <Modal visible={showNew} animationType="slide" transparent onRequestClose={() => setShowNew(false)}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
            <View style={s.row}>
              <View><Eyebrow>Parts store</Eyebrow><Text style={s.sheetTitle}>Add a part</Text></View>
              <Pressable onPress={() => setShowNew(false)} hitSlop={10}><Text style={s.close}>Close</Text></Pressable>
            </View>
            <TextInput style={s.input} value={np.partNo} onChangeText={(v) => setNp({ ...np, partNo: v })} placeholder="Part number" placeholderTextColor="#9AA6B3" autoCapitalize="characters" autoCorrect={false} />
            <TextInput style={s.input} value={np.name} onChangeText={(v) => setNp({ ...np, name: v })} placeholder="What it is" placeholderTextColor="#9AA6B3" />
            <TextInput style={s.input} value={np.qtyOnHand} onChangeText={(v) => setNp({ ...np, qtyOnHand: v })} placeholder="How many in stock now" placeholderTextColor="#9AA6B3" keyboardType="number-pad" />
            <TextInput style={s.input} value={np.minQty} onChangeText={(v) => setNp({ ...np, minQty: v })} placeholder="Warn below this many" placeholderTextColor="#9AA6B3" keyboardType="number-pad" />
            {note && <Text style={s.err}>{note}</Text>}
            <Button title={busy ? 'Saving…' : 'Add to the store'} onPress={createPart} disabled={busy} />
          </ScrollView>
        </View>
      </View>
    </Modal>

    {/* Purchase requests: raise, chase, receive. Receiving books the stock in automatically. */}
    <Modal visible={showPrs} animationType="slide" transparent onRequestClose={() => setShowPrs(false)}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 28 }}>
            <View style={s.row}>
              <View><Eyebrow>Parts store</Eyebrow><Text style={s.sheetTitle}>Purchase requests</Text></View>
              <Pressable onPress={() => setShowPrs(false)} hitSlop={10}><Text style={s.close}>Close</Text></Pressable>
            </View>
            {prs.length === 0 && <Text style={s.note}>No purchase requests.</Text>}
            {prs.map((pr) => (
              <Card key={pr.id} stripe={PR_TONE[pr.status]} style={{ paddingLeft: 18, gap: 4 }}>
                <View style={s.row}>
                  <Text style={s.partNo}>{pr.part.partNo}</Text>
                  <Text style={[s.mvType, { color: PR_TONE[pr.status] }]}>{pr.status}</Text>
                </View>
                <Text style={s.name}>{pr.quantity} × {pr.part.name}</Text>
                <Text style={s.note}>Raised by {pr.requestedBy} · {new Date(pr.createdAt).toLocaleDateString()}</Text>
                {canWrite && pr.status !== 'RECEIVED' && pr.status !== 'CANCELLED' && (
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    {pr.status === 'OPEN' && <View style={{ flex: 1 }}><Button title="Ordered" onPress={() => setPrStatus(pr, 'ORDERED')} disabled={busy} /></View>}
                    {pr.status === 'ORDERED' && <View style={{ flex: 1 }}><Button title="Received" onPress={() => setPrStatus(pr, 'RECEIVED')} disabled={busy} /></View>}
                    <View style={{ flex: 1 }}><Button title="Cancel" variant="ghost" onPress={() => setPrStatus(pr, 'CANCELLED')} disabled={busy} /></View>
                  </View>
                )}
              </Card>
            ))}
            {note && <Text style={s.err}>{note}</Text>}
          </ScrollView>
        </View>
      </View>
    </Modal>
    </>
  );
}

const s = StyleSheet.create({
  link: { color: colors.navy700, fontWeight: '700', fontSize: 13, marginTop: 6 },
  backdrop: { flex: 1, backgroundColor: 'rgba(11,27,48,.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.canvas, maxHeight: '90%', borderTopWidth: 3, borderTopColor: colors.hazard },
  sheetTitle: { fontSize: 19, fontWeight: '700', color: colors.ink, marginTop: 3 },
  close: { color: colors.navy700, fontWeight: '700', fontSize: 13 },
  input: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: colors.ink },
  mv: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.line },
  mvQty: { fontFamily: 'Menlo', fontWeight: '800', fontSize: 14, minWidth: 46, fontVariant: ['tabular-nums'] },
  mvType: { fontSize: 12, fontWeight: '800', color: colors.ink, letterSpacing: 0.4 },
  err: { color: colors.crit, fontSize: 13, fontWeight: '600' },

  search: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.ink },
  note: { color: colors.hazard, fontSize: 13 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  partNo: { fontFamily: 'Menlo', fontWeight: '700', color: colors.navy800, fontSize: 15 },
  qty: { fontSize: 14, fontWeight: '700', color: colors.ok },
  name: { fontSize: 16, fontWeight: '600', color: colors.ink, marginTop: 6 },
  meta: { color: colors.muted, fontSize: 13, marginTop: 4 },
});
