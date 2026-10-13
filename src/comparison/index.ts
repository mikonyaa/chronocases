import type { ChronoCase, Outcome } from '../types.js';
import { REASON_CODES } from '../types.js';
import { checkJsonLimits, LIMITS, utf8ByteLength } from '../schemas/limits.js';
export function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'undefined';
}
export function isOutcome(actual: unknown, contract: ChronoCase['contract']): actual is Outcome {
  try { checkJsonLimits(actual); if (utf8ByteLength(JSON.stringify(actual) ?? '') > LIMITS.outcomeBytes) return false; } catch { return false; }
  if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return false;
  const a = actual as Record<string, unknown>;
  if (Object.keys(a).length !== 2) return false;
  if (a.status === 'rejected') return REASON_CODES.includes(a.reasonCode as typeof REASON_CODES[number]);
  if (a.status === 'no-occurrence') return contract === 'recurrence' && a.reasonCode === 'NO_OCCURRENCE_IN_WINDOW';
  if (a.status !== 'value') return false;
  if (contract !== 'recurrence') return typeof a.value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a.value);
  if (!a.value || typeof a.value !== 'object' || Array.isArray(a.value)) return false;
  const v = a.value as Record<string, unknown>;
  return Object.keys(v).length === 5 && ['nominalDate', 'resolvedLocalDateTime', 'instant', 'offset', 'appliedPolicy'].every(k => typeof v[k] === 'string')
    && /^\d{4}-\d{2}-\d{2}$/.test(v.nominalDate as string)
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(v.resolvedLocalDateTime as string)
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(v.instant as string)
    && /^[+-]\d{2}:\d{2}(?::\d{2})?$/.test(v.offset as string)
    && ['exact', 'gap:shift-by-gap', 'fold:earlier', 'fold:later'].includes(v.appliedPolicy as string);
}
export function evaluateOutcome(fixture: ChronoCase, actual: unknown): { passed: boolean; validShape: boolean; explanation: string } {
  const validShape = isOutcome(actual, fixture.contract);
  const passed = validShape && stable(actual) === stable(fixture.expected);
  if (passed) return { passed, validShape, explanation: fixture.expected.status === 'no-occurrence' ? 'The finite nominal-date window is exhausted. This is a normal no-result outcome, not a timeout.' : `Matches the frozen outcome. ${fixture.rationale}` };
  if (!validShape) return { passed, validShape, explanation: 'INVALID_RETURN_SHAPE: return the documented discriminated outcome with canonical fields; arbitrary exceptions and locale strings are not oracle values.' };
  const hypotheses = {
    'date-only': 'A calendar date must survive serialization unchanged. A UTC-midnight conversion is one possible cause; this black-box result alone does not establish internal behavior.',
    'day-bucket': 'The bucket is the calendar day in the requested IANA zone, bounded by consecutive local day starts. A UTC day or a fixed 24-hour bucket is a possible cause.',
    recurrence: 'Search the explicit nominal-date window in calendar order. Apply the requested gap/fold policy before comparing the selected instant strictly with the cursor. Fixed 24-hour steps or substituting the other fold candidate are possible causes.'
  };
  return { passed, validShape, explanation: `${hypotheses[fixture.contract]} ${fixture.rationale}` };
}
