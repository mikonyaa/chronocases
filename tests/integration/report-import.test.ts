import { beforeAll, test, expect } from 'vitest';
import { readFile, writeFile, mkdtemp, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runCases } from '../../dist/index.js';
import { validateReport } from '../../dist/corpus/index.js';
import type { Report } from '../../src/types.js';

let valid: Report;
beforeAll(async () => { valid = await runCases({ adapterPath: 'examples/correct/adapter.mjs', caseId: 'date-la-roundtrip' }); });
const invalid: [string, (report: Report) => void][] = [
  ['actual contradicts PASS', r => { r.results[0]!.actual = { status: 'value', value: '1999-01-01' }; }],
  ['status contradicts comparison despite coherent counts', r => { r.results[0]!.status = 'FAIL'; r.summary.passed = 0; r.summary.failed = 1; r.summary.exitCode = 1; }],
  ['actual has invalid shape', r => { r.results[0]!.actual = { status: 'value', value: 123 }; }],
  ['aggregate count', r => { r.summary.passed = 0; }],
  ['exit priority', r => { r.summary.exitCode = 3; }],
  ['selected contract', r => { r.summary.selectedContracts = ['recurrence']; }],
  ['duplicate ID', r => { r.results.push(structuredClone(r.results[0]!)); r.summary.selected = 2; r.summary.passed = 2; }],
  ['missing ID', r => { r.results = []; }],
  ['unknown ID', r => { r.results[0]!.caseId = r.results[0]!.fixture.caseId = 'invented-case'; }],
  ['contract identity', r => { r.results[0]!.contract = 'recurrence'; }],
  ['frozen expected', r => { const outcome = { status: 'value' as const, value: '1999-01-01' }; r.results[0]!.expected = r.results[0]!.fixture.expected = outcome; r.results[0]!.actual = outcome; }],
  ['frozen input', r => { (r.results[0]!.fixture.input as { date: string }).date = '1999-01-01'; }],
  ['corpus hash', r => { r.provenance.corpusHash = '0'.repeat(64); }],
  ['corpus version', r => { r.provenance.corpusVersion = '99.0.0'; }],
  ['operational actual', r => { r.results[0]!.status = 'ADAPTER_ERROR'; r.results[0]!.reasonCode = 'ADAPTER_THROW'; r.summary.passed = 0; r.summary.adapterErrors = 1; r.summary.exitCode = 2; }],
  ['unsupported result shape', r => { r.results[0]!.status = 'UNSUPPORTED'; r.results[0]!.reasonCode = 'MISSING_ADAPTER_EXPORT'; r.summary.passed = 0; r.summary.unsupported = 1; r.summary.exitCode = 3; }],
  ['unexplained truncation', r => { r.results[0]!.logs.truncated = true; }]
];

test.each(invalid)('import rejects independently corrupted %s before writing HTML', async (name, corrupt) => {
  const report = structuredClone(valid); corrupt(report);
  await expect(validateReport(report)).rejects.toThrow();
  const directory = await mkdtemp(resolve('.artifacts/import-'));
  const json = join(directory, 'report.json'), html = join(directory, 'explorer.html');
  await writeFile(json, JSON.stringify(report));
  const result = spawnSync(process.execPath, ['dist/cli.js', 'explorer', '--report', json, '--out', html], { encoding: 'utf8' });
  expect(result.status, name).toBe(2);
  await expect(access(html)).rejects.toThrow();
});

test.each(['correct', 'buggy'])('unchanged actual v0.1.0 %s report remains readable', async name => {
  const report = JSON.parse(await readFile(`tests/fixtures/reports/v0.1.0-${name}.json`, 'utf8')) as Report;
  expect(report.packageVersion).toBe('0.1.0');
  await expect(validateReport(report)).resolves.toBeUndefined();
  expect(report.summary).toMatchObject(name === 'correct' ? { passed: 35, failed: 0, unsupported: 1, exitCode: 3 } : { passed: 19, failed: 16, unsupported: 1, exitCode: 3 });
});

test('valid business failure and explicit unsupported reports are never rewritten', async () => {
  const report = await runCases({ adapterPath: 'examples/buggy/adapter.mjs' });
  const before = JSON.stringify(report); await validateReport(report);
  expect(JSON.stringify(report)).toBe(before);
  expect(report.summary).toMatchObject({ passed: 19, failed: 16, unsupported: 1, exitCode: 3 });
});
