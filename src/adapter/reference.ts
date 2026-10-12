import { Temporal } from '@js-temporal/polyfill';
import type { DateOnlyInput, DayBucketInput, RecurrenceInput, DateOutcome, RecurrenceOutcome, Rejected, ReasonCode, Occurrence } from '../types.js';

const reject = (reasonCode: ReasonCode): Rejected => ({ status: 'rejected', reasonCode });
type Parsed<T> = { parsed: T } | Rejected;
export function parseCalendarDate(value: string): Parsed<Temporal.PlainDate> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return reject('INVALID_DATE');
  let parsed: Temporal.PlainDate;
  try { parsed = Temporal.PlainDate.from(value, { overflow: 'reject' }); }
  catch { return reject('INVALID_DATE'); }
  return parsed.year < 1900 || parsed.year > 2100 ? reject('OUT_OF_RANGE') : { parsed };
}
export function parseInstant(value: string): Parsed<Temporal.Instant> {
  // Temporal itself accepts leap-second strings by clamping; this contract explicitly rejects them.
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) return reject('INVALID_INSTANT');
  let parsed: Temporal.Instant;
  try { parsed = Temporal.Instant.from(value); } catch { return reject('INVALID_INSTANT'); }
  const utcYear = parsed.toZonedDateTimeISO('UTC').year;
  const writtenYear = Number(value.slice(0, 4));
  return utcYear < 1900 || utcYear > 2100 || writtenYear < 1900 || writtenYear > 2100 ? reject('OUT_OF_RANGE') : { parsed };
}
export function isNamedTimeZone(zone: string): boolean {
  if (!/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/.test(zone) || zone.length > 100) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: zone }).format(0); return true; } catch { return false; }
}
export function dateOnlyRoundtrip(input: DateOnlyInput): DateOutcome {
  const date = parseCalendarDate(input.date);
  if ('status' in date) return date;
  if (!isNamedTimeZone(input.storageTimeZone) || !isNamedTimeZone(input.displayTimeZone)) return reject('INVALID_TIME_ZONE');
  const serialized = JSON.stringify({ calendarDate: date.parsed.toString() });
  const restored = JSON.parse(serialized) as { calendarDate: string };
  return { status: 'value', value: restored.calendarDate };
}
export function instantToDayBucket(input: DayBucketInput): DateOutcome {
  const instant = parseInstant(input.instant);
  if ('status' in instant) return instant;
  if (!isNamedTimeZone(input.timeZone)) return reject('INVALID_TIME_ZONE');
  const date = instant.parsed.toZonedDateTimeISO(input.timeZone).toPlainDate();
  if (date.year < 1900 || date.year > 2100) return reject('OUT_OF_RANGE');
  return { status: 'value', value: date.toString() };
}

function zoned(local: Temporal.PlainDateTime, zone: string, disambiguation: 'earlier' | 'later'): Temporal.ZonedDateTime {
  return local.toZonedDateTime(zone, { disambiguation });
}
function supportedWindow(dates: Temporal.PlainDate[], time: Temporal.PlainTime, zone: string): boolean {
  let previousEarlier: bigint | null = null;
  let previousLater: bigint | null = null;
  for (const date of dates) {
    const start = date.toPlainDateTime('00:00:00').toZonedDateTime(zone);
    const end = date.add({ days: 1 }).toPlainDateTime('00:00:00').toZonedDateTime(zone);
    const hours = Number(end.epochNanoseconds - start.epochNanoseconds) / 3.6e12;
    if (!start.toPlainDate().equals(date) || hours < 22 || hours > 26) return false;
    let transition = start.getTimeZoneTransition('next');
    let count = 0;
    const beforeStart = start.subtract({ nanoseconds: 1 });
    if (beforeStart.offsetNanoseconds !== start.offsetNanoseconds) {
      if (Math.abs(beforeStart.offsetNanoseconds - start.offsetNanoseconds) > 7.2e12) return false;
      count = 1;
    }
    while (transition && transition.epochNanoseconds < end.epochNanoseconds) {
      const before = transition.subtract({ nanoseconds: 1 });
      if (Math.abs(transition.offsetNanoseconds - before.offsetNanoseconds) > 7.2e12 || ++count > 1) return false;
      transition = transition.getTimeZoneTransition('next');
    }
    const local = date.toPlainDateTime(time);
    const earlier = zoned(local, zone, 'earlier');
    const later = zoned(local, zone, 'later');
    // A gap's backward/forward projection can cross midnight without skipping a whole civil date.
    // Calendar order is checked on the projected instants, not on their displayed dates.
    if (previousEarlier !== null && earlier.epochNanoseconds <= previousEarlier) return false;
    if (previousLater !== null && later.epochNanoseconds <= previousLater) return false;
    previousEarlier = earlier.epochNanoseconds;
    previousLater = later.epochNanoseconds;
  }
  return true;
}
function value(nominalDate: string, resolved: Temporal.ZonedDateTime, appliedPolicy: Occurrence['appliedPolicy']): RecurrenceOutcome {
  const utcYear = resolved.withTimeZone('UTC').year;
  if (utcYear < 1900 || utcYear > 2100) return reject('OUT_OF_RANGE');
  return { status: 'value', value: { nominalDate, resolvedLocalDateTime: resolved.toPlainDateTime().toString({ smallestUnit: 'second' }), instant: resolved.toInstant().toString(), offset: resolved.offset, appliedPolicy } };
}
export function nextOccurrence(input: RecurrenceInput): RecurrenceOutcome {
  const first = parseCalendarDate(input.firstCandidateDate);
  if ('status' in first) return first;
  const cursor = parseInstant(input.strictlyAfter);
  if ('status' in cursor) return cursor;
  if (!isNamedTimeZone(input.timeZone)) return reject('INVALID_TIME_ZONE');
  if (!Number.isInteger(input.horizonDays) || input.horizonDays < 1 || input.horizonDays > 370) return reject('INVALID_WINDOW');
  if (!['skip', 'shift-by-gap', 'reject'].includes(input.gapPolicy) || !['earlier', 'later', 'reject'].includes(input.foldPolicy)) return reject('INVALID_POLICY');
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(input.localTime)) return reject('INVALID_LOCAL_TIME');
  const time = Temporal.PlainTime.from(input.localTime);
  const last = first.parsed.add({ days: input.horizonDays - 1 });
  if (last.year > 2100) return reject('OUT_OF_RANGE');
  const dates = Array.from({ length: input.horizonDays }, (_, i) => first.parsed.add({ days: i }));
  // Check the entire window before selecting: unsupported transitions cannot silently hide behind an earlier value.
  if (!supportedWindow(dates, time, input.timeZone)) return reject('UNSUPPORTED_RECURRENCE_TRANSITION');
  for (const date of dates) {
    const local = date.toPlainDateTime(time);
    const early = zoned(local, input.timeZone, 'earlier');
    const late = zoned(local, input.timeZone, 'later');
    const exactEarly = early.toPlainDateTime().equals(local);
    const exactLate = late.toPlainDateTime().equals(local);
    if (!exactEarly && !exactLate) {
      if (input.gapPolicy === 'reject' && late.epochNanoseconds > cursor.parsed.epochNanoseconds) return reject('NONEXISTENT_LOCAL_TIME');
      if (input.gapPolicy === 'shift-by-gap' && late.epochNanoseconds > cursor.parsed.epochNanoseconds) return value(date.toString(), late, 'gap:shift-by-gap');
      continue;
    }
    if (early.epochNanoseconds !== late.epochNanoseconds) {
      if (input.foldPolicy === 'reject') {
        if (late.epochNanoseconds > cursor.parsed.epochNanoseconds) return reject('AMBIGUOUS_LOCAL_TIME');
        continue;
      }
      const chosen = input.foldPolicy === 'earlier' ? early : late;
      if (chosen.epochNanoseconds > cursor.parsed.epochNanoseconds) return value(date.toString(), chosen, `fold:${input.foldPolicy}`);
      continue;
    }
    if (early.epochNanoseconds > cursor.parsed.epochNanoseconds) return value(date.toString(), early, 'exact');
  }
  return { status: 'no-occurrence', reasonCode: 'NO_OCCURRENCE_IN_WINDOW' };
}
