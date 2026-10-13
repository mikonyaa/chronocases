import { test, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { classifyOutcome, summarizeResults, validateReportSemantics } from '../../src/report/semantics.js';
import type { ChronoCase, Report, ResultStatus } from '../../src/types.js';

test.each([
  [[], 0], [['FAIL'], 1], [['FAIL', 'UNSUPPORTED'], 3],
  [['UNSUPPORTED', 'ADAPTER_ERROR'], 2], [['ADAPTER_ERROR', 'UNSUPPORTED', 'INTERRUPTED'], 130]
] as [ResultStatus[], number][])('exit priority for %j is %i', (statuses, exitCode) => {
  expect(summarizeResults(statuses.map(status => ({ status, contract: 'date-only' })))).toMatchObject({ selected: statuses.length, exitCode });
});

test('an original invalid shape stays FAIL even if IPC repaired its preview', async () => {
  const fixture = JSON.parse(await readFile('cases/date-only/date-la-roundtrip.json', 'utf8')) as ChronoCase;
  const actual = { status: 'value', value: '2024-06-04' };
  expect(classifyOutcome(fixture, actual)).toMatchObject({ status: 'PASS', reasonCode: null });
  expect(classifyOutcome(fixture, actual, true)).toMatchObject({ status: 'FAIL', reasonCode: 'INVALID_RETURN_SHAPE' });
});

test('pure validation preserves valid old FAIL/UNSUPPORTED and admits an empty selection', async () => {
  const report = JSON.parse(await readFile('tests/fixtures/reports/v0.1.0-buggy.json', 'utf8')) as Report;
  const corpus = { corpusHash: report.provenance.corpusHash, corpusVersion: report.provenance.corpusVersion, cases: report.results.map(r => r.fixture) };
  const before = JSON.stringify(report);
  validateReportSemantics(report, corpus);
  expect(JSON.stringify(report)).toBe(before);
  report.results = [];
  report.summary = { selectedContracts: [], selected: 0, passed: 0, failed: 0, unsupported: 0, adapterErrors: 0, interrupted: 0, exitCode: 0 };
  expect(() => validateReportSemantics(report, corpus)).not.toThrow();
});
