import 'react-native-get-random-values';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { api } from '../lib/api';

/**
 * Offline outbox (SRS §4.3, §9.2): every submission is written here first, then pushed in order to /sync/push.
 * Ops carry client-generated UUIDs so retries are idempotent; the server answers applied/duplicate/conflict/rejected.
 */
export type OpKind = 'attachment' | 'daily_reading' | 'shift_report' | 'job_card';
export type Op = { opId: string; kind: OpKind; payload: unknown; queuedAt: string; attempts: number; error?: string; label: string };
export type SyncState = { online: boolean; syncing: boolean; pending: number; failed: number; lastSyncAt?: string };

const KEY = 'drillex.outbox.v1';
const listeners = new Set<(s: SyncState) => void>();
let state: SyncState = { online: true, syncing: false, pending: 0, failed: 0 };
let queue: Op[] | null = null;
let flushing: Promise<void> | null = null;

declare const crypto: { getRandomValues<T extends ArrayBufferView>(a: T): T };
/** RFC 4122 v4 using the polyfilled CSPRNG (react-native-get-random-values). */
export function uuid() {
  const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

async function load() { if (!queue) { const raw = await AsyncStorage.getItem(KEY); queue = raw ? (JSON.parse(raw) as Op[]) : []; emit(); } return queue; }
async function save() { await AsyncStorage.setItem(KEY, JSON.stringify(queue ?? [])); emit(); }
function emit() { const q = queue ?? []; state = { ...state, pending: q.filter((o) => !o.error).length, failed: q.filter((o) => !!o.error).length }; listeners.forEach((l) => l(state)); }
export function subscribe(l: (s: SyncState) => void) { listeners.add(l); l(state); load(); return () => { listeners.delete(l); }; }
export function getState() { return state; }

export async function enqueue(kind: OpKind, payload: unknown, label: string) {
  const q = await load();
  q.push({ opId: uuid(), kind, payload, queuedAt: new Date().toISOString(), attempts: 0, label });
  await save();
  void flush();
}
export async function listOps() { return [...(await load())]; }
export async function discard(opId: string) { const q = await load(); queue = q.filter((o) => o.opId !== opId); await save(); }
export async function retry(opId: string) { const q = await load(); const o = q.find((x) => x.opId === opId); if (o) { delete o.error; await save(); void flush(); } }

/** Push everything pending, in order, in batches. Safe to call often; concurrent calls coalesce. */
export function flush(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    const q = await load();
    const net = await NetInfo.fetch(); state = { ...state, online: !!net.isConnected }; emit();
    if (!net.isConnected) { console.warn('[outbox] flush skipped: NetInfo reports offline', net); return; }
    const batch = q.filter((o) => !o.error).slice(0, 50);
    if (!batch.length) return;
    state = { ...state, syncing: true }; emit();
    try {
      const res = await api<{ results: { opId: string; status: string; error?: string }[] }>('/sync/push', { method: 'POST', body: JSON.stringify({ ops: batch.map(({ opId, kind, payload, queuedAt }) => ({ opId, kind, payload, queuedAt })) }) });
      for (const r of res.results) {
        const i = q.findIndex((o) => o.opId === r.opId); if (i < 0) continue;
        if (r.status === 'applied' || r.status === 'duplicate' || r.status === 'conflict') q.splice(i, 1); // conflicts are held server-side for supervisor review
        else { q[i].attempts += 1; q[i].error = r.error ?? 'Rejected by server'; }
      }
      state = { ...state, lastSyncAt: new Date().toISOString() };
      await save();
      if (q.some((o) => !o.error)) { flushing = null; return flush(); }
    } catch (e) { console.warn('[outbox] flush failed, will retry', e); batch.forEach((o) => { o.attempts += 1; }); await save(); /* network or 5xx: keep everything, try later */ }
    finally { state = { ...state, syncing: false }; emit(); }
  })().finally(() => { flushing = null; });
  return flushing;
}

/** Call once at app start: flush on reconnect and on an interval. */
export function startSyncLoop() {
  const unsub = NetInfo.addEventListener((s) => { state = { ...state, online: !!s.isConnected }; emit(); if (s.isConnected) void flush(); });
  const t = setInterval(() => void flush(), 60_000);
  void flush();
  return () => { unsub(); clearInterval(t); };
}
