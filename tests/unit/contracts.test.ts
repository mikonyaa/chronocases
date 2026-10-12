import { describe, test, expect } from 'vitest';
import { dateOnlyRoundtrip, instantToDayBucket, nextOccurrence, parseInstant } from '../../src/adapter/reference.js';
import { loadCases, loadCase, selectCases } from '../../src/corpus/index.js';
import { evaluateOutcome } from '../../src/comparison/index.js';
import { checkEnvironment, checkCanary } from '../../src/provenance/index.js';
import { parseBoundedJson } from '../../src/schemas/limits.js';
import type { DateOnlyInput, DayBucketInput, RecurrenceInput } from '../../src/types.js';

const fixtures = await loadCases();
describe('independently reviewed frozen outcomes', () => {
  for (const fixture of fixtures) test(fixture.caseId, () => {
    const actual = fixture.contract === 'date-only' ? dateOnlyRoundtrip(fixture.input as DateOnlyInput) : fixture.contract === 'day-bucket' ? instantToDayBucket(fixture.input as DayBucketInput) : nextOccurrence(fixture.input as RecurrenceInput);
    expect(evaluateOutcome(fixture, actual).passed).toBe(true);
    expect(checkEnvironment(fixture)).toBeNull();
  });
});
test.each(['2023-02-29', '1900-02-29', '2024-02-30', '2024-13-04', '24-06-04'])('reject Gregorian invalid date %s', date => {
  expect(dateOnlyRoundtrip({ date, storageTimeZone: 'UTC', displayTimeZone: 'UTC' })).toEqual({ status: 'rejected', reasonCode: 'INVALID_DATE' });
});
test.each(['2024-06-04T00:00:00', '2024-06-04T00:00:60Z', '2024-06-04T00:00:00+24:00', '2024-02-30T00:00:00Z', '2024-06-04T00:00:00+02:99'])('reject invalid instant %s', instant => {
  expect(instantToDayBucket({ instant, timeZone: 'UTC' })).toEqual({ status: 'rejected', reasonCode: 'INVALID_INSTANT' });
});
test('v1 input and resolved-day range boundaries are explicit', () => {
  expect(parseInstant('1899-12-31T23:00:00Z')).toEqual({ status: 'rejected', reasonCode: 'OUT_OF_RANGE' });
  expect(instantToDayBucket({ instant: '2100-12-31T23:00:00Z', timeZone: 'Pacific/Kiritimati' })).toEqual({ status: 'rejected', reasonCode: 'OUT_OF_RANGE' });
  expect(dateOnlyRoundtrip({ date: '2101-01-01', storageTimeZone: 'UTC', displayTimeZone: 'UTC' })).toEqual({ status: 'rejected', reasonCode: 'OUT_OF_RANGE' });
});
const fold = (await loadCase('ny-fold-earlier-after-first')).input as RecurrenceInput;
test('fold reject between candidates still rejects', () => expect(nextOccurrence({ ...fold, foldPolicy: 'reject' })).toEqual({ status: 'rejected', reasonCode: 'AMBIGUOUS_LOCAL_TIME' }));
test('fold equality does not swap earlier for later', () => {
  const value = nextOccurrence({ ...fold, strictlyAfter: '2024-11-03T05:30:00Z' });
  expect(value.status === 'value' && value.value.instant).toBe('2024-11-04T06:30:00Z');
});
test('gap skip in a one-day window is a normal no-result', async () => {
  const input = (await loadCase('ny-gap-skip')).input as RecurrenceInput;
  expect(nextOccurrence({ ...input, horizonDays: 1 })).toEqual({ status: 'no-occurrence', reasonCode: 'NO_OCCURRENCE_IN_WINDOW' });
});
test('gap rejection at projection equality skips the past nominal date', async () => {
  const input = (await loadCase('ny-gap-reject-after-projection')).input as RecurrenceInput;
  const value = nextOccurrence({ ...input, strictlyAfter: '2024-03-10T07:30:00Z' });
  expect(value.status === 'value' && value.value.instant).toBe('2024-03-11T06:30:00Z');
});
test('fold rejection at the later candidate equality skips the date', () => {
  const value = nextOccurrence({ ...fold, foldPolicy: 'reject', strictlyAfter: '2024-11-03T06:30:00Z' });
  expect(value.status === 'value' && value.value.instant).toBe('2024-11-04T06:30:00Z');
});
test('a selected UTC result outside v1 rejects rather than overflowing silently', () => {
  expect(nextOccurrence({ ...fold, firstCandidateDate: '2100-12-31', horizonDays: 1, localTime: '23:00:00', strictlyAfter: '2100-12-30T00:00:00Z' })).toEqual({ status: 'rejected', reasonCode: 'OUT_OF_RANGE' });
});
test('Apia remains available for instant-to-day despite recurrence limitations', () => {
  expect(instantToDayBucket({ instant: '2011-12-30T10:00:00Z', timeZone: 'Pacific/Apia' })).toEqual({ status: 'value', value: '2011-12-31' });
});
test('an ordinary midnight gap may project backward into the previous date', () => {
  const value = nextOccurrence({ ...fold, timeZone: 'America/Sao_Paulo', firstCandidateDate: '2018-11-04', horizonDays: 1, localTime: '00:30:00', strictlyAfter: '2018-11-04T00:00:00Z' });
  expect(value).toEqual({ status: 'value', value: { nominalDate: '2018-11-04', resolvedLocalDateTime: '2018-11-04T01:30:00', instant: '2018-11-04T03:30:00Z', offset: '-02:00', appliedPolicy: 'gap:shift-by-gap' } });
});
test('the maximum valid 370-date window can be exhausted normally', () => {
  expect(nextOccurrence({ ...fold, timeZone: 'UTC', firstCandidateDate: '2024-01-01', horizonDays: 370, localTime: '09:00:00', strictlyAfter: '2025-01-05T00:00:00Z' })).toEqual({ status: 'no-occurrence', reasonCode: 'NO_OCCURRENCE_IN_WINDOW' });
});
test('full-window unsupported preflight precedes a plausible earlier value', async () => {
  const input = (await loadCase('apia-skipped-date-unsupported')).input as RecurrenceInput;
  expect(nextOccurrence({ ...input, firstCandidateDate: '2011-12-29', horizonDays: 3 })).toEqual({ status: 'rejected', reasonCode: 'UNSUPPORTED_RECURRENCE_TRANSITION' });
});
test('30-minute Lord Howe fold resolves two independently checked offsets', () => {
  const input: RecurrenceInput = { ...fold, timeZone: 'Australia/Lord_Howe', firstCandidateDate: '2024-04-07', localTime: '01:45:00', strictlyAfter: '2024-04-06T00:00:00Z' };
  const early = nextOccurrence(input), late = nextOccurrence({ ...input, foldPolicy: 'later' });
  expect(early.status === 'value' && early.value.instant).toBe('2024-04-06T14:45:00Z');
  expect(late.status === 'value' && late.value.instant).toBe('2024-04-06T15:15:00Z');
});
test.each([0, 371, 1.5])('invalid finite window %s', horizonDays => expect(nextOccurrence({ ...fold, horizonDays })).toEqual({ status: 'rejected', reasonCode: 'INVALID_WINDOW' }));
test('invalid wall time is not normalized', () => expect(nextOccurrence({ ...fold, localTime: '24:00:00' })).toEqual({ status: 'rejected', reasonCode: 'INVALID_LOCAL_TIME' }));
test('return-shape and business mismatches remain distinct', async () => {
  const fixture = await loadCase('date-la-roundtrip');
  expect(evaluateOutcome(fixture, { status: 'value', value: '06/04/2024' }).validShape).toBe(false);
  const wrong = evaluateOutcome(fixture, { status: 'value', value: '2024-06-03' });
  expect(wrong.validShape).toBe(true); expect(wrong.passed).toBe(false); expect(wrong.explanation).toContain('possible cause');
  expect(evaluateOutcome(fixture, { status: 'rejected', reasonCode: 'whatever' }).validShape).toBe(false);
});
test('canary mismatch and absent real zone are unsupported environment', async () => {
  const fixture = await loadCase('la-at-midnight');
  fixture.oracle.canaries[0]!.offset = '+00:00';
  expect(checkEnvironment(fixture)).toContain('UNSUPPORTED_ENVIRONMENT');
  expect(checkCanary({ timeZone: 'Missing/RealZone', instant: '2024-06-04T00:00:00Z', offset: '+00:00', localDateTime: '2024-06-04T00:00:00' })).toContain('unavailable');
});
test('selection typos and empty intersections cannot pass', () => {
  expect(() => selectCases(fixtures, { caseId: 'typo' })).toThrow('Empty selection');
  expect(() => selectCases(fixtures, { contract: 'cron' })).toThrow('Available');
  expect(() => selectCases(fixtures, { contract: 'day-bucket', caseId: 'ny-gap-shift' })).toThrow('Empty selection');
});
test('JSON byte, depth and string limits', () => {
  expect(() => parseBoundedJson('"xxxx"', 2)).toThrow('byte');
  expect(() => parseBoundedJson('['.repeat(22) + '0' + ']'.repeat(22), 1000)).toThrow('nesting');
  expect(() => parseBoundedJson(JSON.stringify('x'.repeat(65537)), 100000)).toThrow('string');
});
