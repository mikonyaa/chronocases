import { test, expect } from '@jest/globals';
import { loadCase, evaluateOutcome } from 'chronocases';
import { dateOnlyRoundtrip } from '../correct/adapter.mjs';
test('my actual save/read path preserves the calendar label', async () => {
  const fixture = await loadCase('date-la-roundtrip');
  const comparison = evaluateOutcome(fixture, await dateOnlyRoundtrip(fixture.input));
  expect(comparison.passed).toBe(true);
});
