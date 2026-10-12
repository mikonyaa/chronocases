import { Temporal } from '@js-temporal/polyfill';
import { instantToDayBucket as correctBucket, nextOccurrence as seedOccurrence } from 'chronocases/reference';
export function utcMidnightRoundtrip(input) {
  // Deliberate bug: the stored calendar label is converted to an instant.
  const instant = new Date(`${input.date}T00:00:00Z`);
  if (Number.isNaN(instant.valueOf())) return { status: 'rejected', reasonCode: 'INVALID_DATE' };
  const serialized = JSON.stringify({ instant: instant.toISOString() });
  const restored = new Date(JSON.parse(serialized).instant);
  const parts = new Intl.DateTimeFormat('en', { timeZone: input.displayTimeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(restored);
  const get = key => parts.find(p => p.type === key).value;
  return { status: 'value', value: `${get('year')}-${get('month')}-${get('day')}` };
}
export function utcDayBucket(input) {
  const checked = correctBucket(input);
  if (checked.status !== 'value') return checked;
  // Deliberate bug: ignore the requested zone after validating the input.
  return { status: 'value', value: new Date(input.instant).toISOString().slice(0, 10) };
}
export function fixed24Hours(input) {
  const seed = seedOccurrence({ ...input, strictlyAfter: '1900-01-01T00:00:00Z' });
  if (seed.status !== 'value') return seed;
  let instant = Temporal.Instant.from(seed.value.instant);
  let nominal = Temporal.PlainDate.from(seed.value.nominalDate);
  const end = Temporal.PlainDate.from(input.firstCandidateDate).add({ days: input.horizonDays });
  // Deliberate bug: daily wall-clock recurrence advanced as a fixed duration.
  while (instant.epochNanoseconds <= Temporal.Instant.from(input.strictlyAfter).epochNanoseconds) {
    instant = instant.add({ hours: 24 }); nominal = nominal.add({ days: 1 });
  }
  if (Temporal.PlainDate.compare(nominal, end) >= 0) return { status: 'no-occurrence', reasonCode: 'NO_OCCURRENCE_IN_WINDOW' };
  const local = instant.toZonedDateTimeISO(input.timeZone);
  return { status: 'value', value: { nominalDate: nominal.toString(), resolvedLocalDateTime: local.toPlainDateTime().toString({ smallestUnit: 'second' }), instant: instant.toString(), offset: local.offset, appliedPolicy: nominal.toString() === seed.value.nominalDate ? seed.value.appliedPolicy : 'exact' } };
}
