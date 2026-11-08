/**
 * A queued submission is stored as the raw JSON the device sent, so anything that displays one back
 * (sync conflicts today) has to turn that payload into something a supervisor can read. This maps the
 * daily-reading and shift-report shapes onto labelled rows, in schema order, with units applied and
 * the values that would have raised an alert marked so they stand out on review.
 */

import { CRITICAL_ANSWERS, ChemicalUnitLabel, WARN_ANSWERS } from './enums';
import { CHECK_LABELS, criticalChecks } from './schemas';

export type FieldTone = 'warn' | 'crit';
export type SubmissionField = { key: string; label: string; value: string; tone?: FieldTone };

/**
 * Opaque identifiers and record bookkeeping: meaningless to a reviewer, and the row header already says who
 * and which machine. Relations (asset, user, attachments) are hidden too, so a full record fetched from the API
 * can be passed in as well as a queued payload; callers show those in their own form.
 */
const HIDDEN = new Set([
  'id', 'assetId', 'siteId', 'userId', 'signatureId', 'signatureAttachmentId',
  'createdAt', 'updatedAt', 'deletedAt', 'asset', 'user', 'attachments',
  'formType', 'operatorId', 'enteredById', 'enteredBy', 'chemicalId',
]);

const LABELS: Record<string, string> = {
  date: 'Date', hourMeter: 'Hour meter', fuelStart: 'Fuel at start', fuelEnd: 'Fuel at end', fuelConsumed: 'Fuel used',
  engineOil: 'Engine oil', hydraulicOil: 'Hydraulic oil', coolant: 'Coolant', airFilter: 'Air filter',
  battery: 'Battery', tyrePressures: 'Tyre pressures', warningLights: 'Warning lights',
  warningLightsNote: 'Warning lights note', unusualNoises: 'Unusual noises', unusualNoisesNote: 'Noise note',
  leaks: 'Leaks', leaksNote: 'Leak note', preStartChecklistDone: 'Pre-start checklist',
  conditionRating: 'Condition rating', notes: 'Notes',
  shift: 'Shift', holeRef: 'Hole reference', startDepth: 'Start depth', endDepth: 'End depth',
  holesCompleted: 'Holes completed', holeDiameterMm: 'Hole diameter', rockType: 'Rock type',
  penetrationRate: 'Penetration rate', downtimeHours: 'Downtime', downtimeReason: 'Downtime reason',
  chemicals: 'Consumables',
  startHourMeter: 'Start hour meter', endHourMeter: 'End hour meter', engineHours: 'Engine hours this shift',
  bitNumber: 'Bit number', bitSize: 'Bit size', remarks: 'Shift remarks',
  supervisorReason: 'Reason for supervisor entry',
  gearOil: 'Gear oil', flushPump: 'Water / flush pump', rodCondition: 'Rods', bitCondition: 'Bit',
  startReading: 'Start reading', endReading: 'End reading', usage: 'Hours / distance this shift',
  brakeFluid: 'Brake fluid', fuelLevel: 'Fuel level', trackCondition: 'Tracks', tyreCondition: 'Tyres',
  attachmentCondition: 'Bucket / blade / attachment', lights: 'Lights & indicators', brakes: 'Brakes',
  faults: 'Faults / defects', fuelAdded: 'Fuel added',
};

const UNITS: Record<string, string> = {
  hourMeter: 'h', fuelStart: 'L', fuelEnd: 'L', fuelConsumed: 'L', startDepth: 'm', endDepth: 'm',
  holeDiameterMm: 'mm', penetrationRate: 'm/h', downtimeHours: 'h',
  startHourMeter: 'h', endHourMeter: 'h', engineHours: 'h', fuelAdded: 'L',
};

/** Schema order reads like the form the operator filled in; unknown keys are appended rather than dropped. */
const ORDER = [
  'date', 'shift', 'supervisorReason', 'startHourMeter', 'endHourMeter', 'engineHours',
  'holeRef', 'bitNumber', 'bitSize', 'rockType', 'hourMeter', 'fuelStart', 'fuelEnd', 'fuelConsumed',
  'startReading', 'endReading', 'usage',
  'startDepth', 'endDepth', 'holesCompleted', 'holeDiameterMm', 'penetrationRate',
  'downtimeHours', 'downtimeReason', 'chemicals', 'remarks',
  'engineOil', 'hydraulicOil', 'coolant', 'gearOil', 'flushPump', 'rodCondition', 'bitCondition',
  'brakeFluid', 'fuelLevel', 'trackCondition', 'tyreCondition', 'attachmentCondition', 'lights', 'brakes',
  'fuelAdded', 'faults', 'airFilter', 'battery', 'tyrePressures',
  'warningLights', 'warningLightsNote', 'unusualNoises', 'unusualNoisesNote',
  'leaks', 'leaksNote', 'preStartChecklistDone', 'conditionRating', 'notes',
];

/** LOW -> Low, CHANGE_REQUIRED -> Change required. Leaves ordinary prose untouched. */
function humanizeEnum(v: string) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(v)) return v;
  const s = v.replace(/_/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function titleFromKey(key: string) {
  const s = key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Mirrors readingAlerts plus the condition enums, so a reviewer sees why this was worth a look. */
function toneFor(key: string, value: unknown): FieldTone | undefined {
  if (key === 'supervisorReason') return 'warn';
  if (key in CHECK_LABELS && key !== 'engineOil' && key !== 'hydraulicOil' && key !== 'coolant' && typeof value === 'string') {
    return CRITICAL_ANSWERS.includes(value) ? 'crit' : WARN_ANSWERS.includes(value) ? 'warn' : undefined;
  }
  if ((key === 'warningLights' || key === 'leaks' || key === 'unusualNoises') && value === true) return 'warn';
  if (key === 'conditionRating' && typeof value === 'number') return value <= 2 ? 'crit' : undefined;
  if (key === 'battery') return value === 'FLAT' ? 'crit' : value === 'WEAK' ? 'warn' : undefined;
  if (key === 'airFilter') return value === 'BLOCKED' ? 'warn' : undefined;
  if (key === 'engineOil' || key === 'hydraulicOil' || key === 'coolant') {
    return value === 'CHANGE_REQUIRED' || value === 'CRITICAL' ? 'crit' : value === 'LOW' || value === 'ADD' ? 'warn' : undefined;
  }
  if (key === 'preStartChecklistDone' && value === false) return 'warn';
  return undefined;
}

function formatValue(key: string, value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;

  if (key === 'date' && typeof value === 'string') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? value : d.toLocaleDateString();
  }
  if (key === 'preStartChecklistDone') return value ? 'Completed' : 'Not completed';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (key === 'conditionRating' && typeof value === 'number') return `${value} / 5`;

  // Prisma serialises Decimal columns (hour meter, fuel, depths) as strings, so give those their unit too.
  if (typeof value === 'string' && UNITS[key] && /^-?\d+(\.\d+)?$/.test(value)) value = Number(value);
  if (typeof value === 'number') {
    const unit = UNITS[key];
    return unit ? `${value} ${unit}` : String(value);
  }
  // Free text (notes, reasons, hole references) is shown as typed — "ABS" must not become "Abs".
  if (typeof value === 'string') {
    if (/note|reason|ref|remarks|faults|bitNumber/i.test(key)) return value;
    return value === 'NA' ? 'N/A' : humanizeEnum(value);
  }

  // Tyre pressures: { FL: 12, FR: 25 } -> "FL 12 · FR 25 psi"
  if (key === 'tyrePressures' && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (!entries.length) return null;
    return `${entries.map(([pos, psi]) => `${pos} ${psi}`).join('  ·  ')} psi`;
  }
  // Consumables: [{ name, quantity, unit }] -> "Water 200 litres"
  if (Array.isArray(value)) {
    if (!value.length) return null;
    return value
      .map((row) => {
        if (row && typeof row === 'object') {
          const r = row as Record<string, unknown>;
          const chem = r.chemical && typeof r.chemical === 'object' ? (r.chemical as { name?: unknown }).name : r.chemical;
          const name = r.name ?? chem ?? r.item;

          const qty = r.quantity ?? r.qty;
          const unit = typeof r.unit === 'string' ? (ChemicalUnitLabel as Record<string, string>)[r.unit] ?? r.unit.toLowerCase() : '';
          if (name !== undefined && qty !== undefined) return `${name} — ${qty} ${unit}`.trim();
        }
        return String(row);
      })
      .join('\n');
  }
  return JSON.stringify(value);
}

/** Turns a stored submission payload into readable rows for display. */
export function describeSubmission(incoming: Record<string, unknown>): SubmissionField[] {
  const keys = Object.keys(incoming).filter((k) => !HIDDEN.has(k));
  const ordered = [
    ...ORDER.filter((k) => keys.includes(k)),
    ...keys.filter((k) => !ORDER.includes(k)).sort(),
  ];
  const out: SubmissionField[] = [];
  for (const key of ordered) {
    const value = formatValue(key, incoming[key]);
    if (value === null) continue;
    out.push({ key, label: LABELS[key] ?? titleFromKey(key), value, tone: toneFor(key, incoming[key]) });
  }
  return out;
}

const numOrDash = (v: unknown) => (v == null || v === '' ? '—' : String(Number(v)));

/** One line describing a daily reading for a list row, whichever form it was captured on. */
export function readingSummary(r: Record<string, unknown>): string {
  if (r.formType === 'RIG') return 'Rig condition check';
  if (r.formType === 'PLANT') {
    const fuel = r.fuelAdded != null ? ` · ${numOrDash(r.fuelAdded)} L fuel added` : '';
    return `Machine readings · ${numOrDash(r.usage)} h/km this shift${fuel}`;
  }
  return `Hour meter ${numOrDash(r.hourMeter)} h · Fuel used ${numOrDash(r.fuelConsumed)} L`;
}

/** Flags for a reading row: the issue toggles plus any check answered Critical / Damaged / Faulty / Flat. */
export function readingFlags(r: Record<string, unknown>): string[] {
  const out: string[] = [];
  if (r.warningLights) out.push('Warning lights');
  if (r.leaks) out.push('Leaks');
  if (r.unusualNoises) out.push('Unusual noises');
  return [...out, ...criticalChecks(r).map((c) => `${c} critical`)];
}
