import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { can, type Permission, type PermissionMatrix } from '@drillex/shared';
import { api, loadSession } from '../lib/api';
import { cached } from '../sync/cache';
import type { Asset } from '../screens/AssetsScreen';
import { colors } from './theme';

export type OperatorOption = { id: string; employeeId: string; name: string };

export type SupervisorState = {
  /** May this person enter on behalf of an operator at all? */
  available: boolean;
  /** Supervisor mode is on: the record is for `operatorId`, with `reason`. */
  on: boolean;
  /** On permanently — the person cannot file in their own name (a supervisor has no create permission of their own). */
  forced: boolean;
  operators: OperatorOption[];
  /** The signed-in user's id, so a screen can tell when a record belongs to someone else. */
  selfId: string | undefined;
  operatorId: string | null;
  reason: string;
  setOn: (v: boolean) => void;
  setOperatorId: (v: string) => void;
  setReason: (v: string) => void;
  /** Fields to merge into the submission payload. */
  payload: () => { operatorId?: string; supervisorReason?: string };
  /** A message when supervisor mode is on but incomplete, else null. */
  problem: () => string | null;
  operatorLabel: () => string | null;
};

/**
 * Supervisor Mode (client spec §2, §9.3): a supervisor enters a shift report or daily check for an operator who has
 * not submitted. Available to anyone holding `submission:on_behalf`; forced on for someone who cannot file the
 * record in their own name. The server re-checks every rule, including that the operator is assigned to the machine.
 */
export function useSupervisorMode(assetId: string, createPermission: Permission): SupervisorState {
  const [matrix, setMatrix] = useState<PermissionMatrix | null>(null);
  const [role, setRole] = useState<string | undefined>();
  const [selfId, setSelfId] = useState<string | undefined>();
  const [operators, setOperators] = useState<OperatorOption[]>([]);
  const [on, setOn] = useState(false);
  const [operatorId, setOperatorId] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  useEffect(() => {
    Promise.all([cached('permissions', () => api<PermissionMatrix>('/roles/matrix')), loadSession()])
      .then(([p, sess]) => { setMatrix(p.data); setRole(sess?.user.role); setSelfId(sess?.user.id); })
      .catch(() => {});
  }, []);

  const available = !!matrix && !!role && !!can(matrix, role, 'submission:on_behalf');
  const forced = available && !can(matrix!, role, createPermission);

  useEffect(() => {
    if (!available) return;
    cached(`asset.${assetId}`, () => api<Asset>(`/assets/${assetId}`))
      .then((r) => {
        const ops = (r.data.operators ?? []).flatMap((o) => (o.user && o.user.id !== selfId ? [o.user] : []));
        setOperators(ops);
        if (ops.length === 1) setOperatorId(ops[0].id);
      })
      .catch(() => {});
  }, [available, assetId, selfId]);

  const active = forced || (available && on);
  return {
    available, on: active, forced, operators, selfId, operatorId, reason,
    setOn, setOperatorId, setReason,
    payload: () => (active && operatorId ? { operatorId, supervisorReason: reason.trim() } : {}),
    problem: () => {
      if (!active) return null;
      if (!operatorId) return operators.length ? 'Choose the operator you are entering for.' : 'No operator is assigned to this machine — ask an admin to assign one.';
      if (reason.trim().length < 3) return 'Give the reason for the supervisor entry.';
      return null;
    },
    operatorLabel: () => { const o = operators.find((x) => x.id === operatorId); return o ? o.employeeId : null; },
  };
}

/** The orange banner, operator picker and mandatory reason. Renders nothing for someone without the permission. */
export function SupervisorModePanel({ state }: { state: SupervisorState }) {
  if (!state.available) return null;
  return (
    <View style={{ gap: 10 }}>
      {!state.forced && (
        <View style={s.toggle}>
          <View style={{ flex: 1 }}>
            <Text style={s.toggleLabel}>Supervisor mode</Text>
            <Text style={s.toggleHelp}>Enter this for an operator who has not submitted.</Text>
          </View>
          <Switch value={state.on} onValueChange={state.setOn} trackColor={{ true: colors.supervisor, false: colors.line }} thumbColor="#fff" />
        </View>
      )}
      {state.on && (
        <>
          <View style={s.banner}><Text style={s.bannerText}>SUPERVISOR MODE — Entering on behalf of operator</Text></View>
          <View style={[s.field, s.warnBorder]}>
            <Text style={s.label}>Operator ID</Text>
            {state.operators.length ? (
              <View style={s.chips}>
                {state.operators.map((o) => {
                  const sel = o.id === state.operatorId;
                  return (
                    <Pressable key={o.id} onPress={() => state.setOperatorId(o.id)} style={[s.chip, sel && s.chipOn]}>
                      <Text style={[s.chipId, sel && { color: colors.ink }]}>{o.employeeId}</Text>
                      <Text style={[s.chipName, sel && { color: colors.ink }]}>{o.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : <Text style={s.help}>No operator is assigned to this machine.</Text>}
          </View>
          <View style={[s.field, s.warnBorder]}>
            <Text style={s.label}>Reason for Supervisor Entry <Text style={{ color: colors.crit }}>*</Text></Text>
            <TextInput style={s.reason} value={state.reason} onChangeText={state.setReason} placeholder="e.g. Operator off sick; report given verbally at shift change" placeholderTextColor="#9AA6B3" multiline />
          </View>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 12 },
  toggleLabel: { fontSize: 15, fontWeight: '700', color: colors.ink },
  toggleHelp: { fontSize: 12, color: colors.muted, marginTop: 2 },
  // Dark text on the orange: white on this amber is unreadable outdoors.
  banner: { backgroundColor: colors.supervisor, paddingVertical: 10, paddingHorizontal: 12 },
  bannerText: { color: colors.ink, fontWeight: '800', letterSpacing: 0.5, fontSize: 13 },
  field: { gap: 8, backgroundColor: colors.surface, padding: 12 },
  warnBorder: { borderWidth: 2, borderColor: colors.supervisor },
  label: { fontSize: 13, fontWeight: '600', color: colors.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 7 },
  chipOn: { backgroundColor: colors.supervisor, borderColor: colors.supervisor },
  chipId: { fontFamily: 'Menlo', fontWeight: '800', color: colors.navy800 },
  chipName: { fontSize: 12, color: colors.muted },
  reason: { borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff', padding: 10, minHeight: 64, textAlignVertical: 'top', color: colors.ink },
  help: { color: colors.muted, fontSize: 13 },
});
