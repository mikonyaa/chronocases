import { test, expect } from 'vitest';
import { loadCase, evaluateOutcome } from 'chronocases';
import { dateOnlyRoundtrip } from '../correct/adapter.mjs';
test('my actual save/read path preserves the calendar label', async () => {
  const fixture = await loadCase('date-la-roundtrip');
  const actual = await dateOnlyRoundtrip(fixture.input);
  const comparison = evaluateOutcome(fixture, actual);
  expect(comparison.passed, comparison.explanation).toBe(true);
});
