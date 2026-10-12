import { test, expect, beforeAll } from 'vitest';
import { runCases, loadCase } from '../../dist/index.js';
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
let directory: string;
beforeAll(async () => { await mkdir('.artifacts', { recursive: true }); directory = await mkdtemp(resolve('.artifacts/integration-')); });
async function adapter(source: string): Promise<string> { const path = join(directory, `adapter-${Math.random().toString(16).slice(2)}.mjs`); await writeFile(path, source); return path; }
const run = (path: string, options = {}) => runCases({ adapterPath: path, caseId: 'date-la-roundtrip', ...options });
test('correct public adapter passes every supported frozen case', async () => {
  const report = await runCases({ adapterPath: 'examples/correct/adapter.mjs', tz: process.env.CHRONOCASES_TEST_TZ ?? 'UTC' });
  expect(report.summary).toMatchObject({ selected: 36, passed: 35, failed: 0, adapterErrors: 0, unsupported: 1, exitCode: 3 });
  expect(report.results.find(r => r.caseId === 'apia-skipped-date-unsupported')?.status).toBe('UNSUPPORTED');
});
test('all three actual product mutations execute through the public interface', async () => {
  const report = await runCases({ adapterPath: 'examples/buggy/adapter.mjs' });
  for (const id of ['date-la-roundtrip', 'la-before-midnight', 'ny-fold-earlier-after-first']) expect(report.results.find(r => r.caseId === id)?.status).toBe('FAIL');
  expect(report.results.find(r => r.caseId === 'offset-input-utc-leap-boundary')?.status).toBe('PASS');
});
test('only selected contracts run; missing exports are unsupported', async () => {
  const path = await adapter("export const dateOnlyRoundtrip = input => ({status:'value',value:input.date});");
  expect((await runCases({ adapterPath: path, contract: 'date-only' })).summary.selectedContracts).toEqual(['date-only']);
  const report = await runCases({ adapterPath: path, contract: 'day-bucket' });
  expect(report.summary).toMatchObject({ selected: 11, passed: 0, unsupported: 11, exitCode: 3 });
});
test('expected is absent from metadata and stdout cannot impersonate the IPC result', async () => {
  const path = await adapter("export async function dateOnlyRoundtrip(input, meta) { if(Object.keys(meta).sort().join(',') !== 'caseId,contractVersion') throw Error('oracle leaked'); console.log(JSON.stringify({kind:'result',actual:{status:'value',value:'1999-01-01'}})); return {status:'value',value:input.date}; }");
  const report = await run(path); expect(report.summary.exitCode).toBe(0); expect(report.results[0]?.logs.stdout).toContain('1999-01-01');
});
test.each([
  ['throw', "export function dateOnlyRoundtrip(){throw new Error('PRIVATE_SECRET_SENTINEL')}", 'ADAPTER_THROW'],
  ['reject', "export async function dateOnlyRoundtrip(){return Promise.reject(new Error('PRIVATE_SECRET_SENTINEL'))}", 'ADAPTER_THROW'],
  ['crash', 'export function dateOnlyRoundtrip(){process.exit(17)}', 'ADAPTER_CRASH'],
  ['huge result', "export function dateOnlyRoundtrip(){return {status:'value',value:'x'.repeat(40000)}}", 'ADAPTER_RESULT_LIMIT'],
  ['huge logs', "export function dateOnlyRoundtrip(){process.stdout.write('x'.repeat(1000000));return {status:'value',value:'2024-06-04'}}", 'ADAPTER_LOG_LIMIT']
])('%s becomes a bounded operational error', async (_name, source, code) => {
  const report = await run(await adapter(source)); expect(report.summary.exitCode).toBe(2); expect(report.results[0]?.reasonCode).toBe(code);
  expect(JSON.stringify(report)).not.toContain('PRIVATE_SECRET_SENTINEL'); expect(Buffer.byteLength(report.results[0]?.logs.stdout ?? '')).toBeLessThanOrEqual(65540);
});
test('malformed result is a shape failure, not exception-text comparison', async () => {
  const report = await run(await adapter("export function dateOnlyRoundtrip(){return '2024-06-04'}"));
  expect(report.summary.exitCode).toBe(1); expect(report.results[0]?.reasonCode).toBe('INVALID_RETURN_SHAPE');
});
test('a non-JSON result is a return-shape failure, without serialization exception text', async () => {
  const report = await run(await adapter('export function dateOnlyRoundtrip(){return 1n}'));
  expect(report.summary.exitCode).toBe(1); expect(report.results[0]?.reasonCode).toBe('INVALID_RETURN_SHAPE');
});
test.each([
  "import{Temporal}from'@js-temporal/polyfill';export function dateOnlyRoundtrip(input){return {status:'value',value:Temporal.PlainDate.from(input.date)}}",
  'export function dateOnlyRoundtrip(input){return {status:"value",value:input.date,extra:undefined}}'
])('IPC serialization cannot turn a malformed original return into PASS', async source => {
  const report = await run(await adapter(source));
  expect(report.summary.exitCode).toBe(1); expect(report.results[0]?.reasonCode).toBe('INVALID_RETURN_SHAPE');
});
test('infinite loop is killed in its own child without contaminating the next case', async () => {
  const report = await run(await adapter('export function dateOnlyRoundtrip(){while(true){} }'), { timeoutMs: 150 });
  expect(report.summary.exitCode).toBe(2); expect(report.results[0]?.reasonCode).toBe('ADAPTER_TIMEOUT');
  expect((await run('examples/correct/adapter.mjs')).summary.exitCode).toBe(0);
});
test('child TZ is scoped and does not change parent or later runs', async () => {
  const parentTZ = process.env.TZ;
  const path = await adapter("export function dateOnlyRoundtrip(input){console.log(process.env.TZ);return {status:'value',value:input.date}}");
  const a = await run(path, { tz: 'Pacific/Honolulu' }), b = await run(path, { tz: 'UTC' });
  expect(a.results[0]?.logs.stdout.trim()).toBe('Pacific/Honolulu'); expect(b.results[0]?.logs.stdout.trim()).toBe('UTC'); expect(process.env.TZ).toBe(parentTZ);
});
test('mixed outcome exit priority keeps operational errors above unsupported', async () => {
  const path = await adapter("export function dateOnlyRoundtrip(){throw Error('bad')}");
  const report = await runCases({ adapterPath: path }); expect(report.summary.exitCode).toBe(2); expect(report.summary.unsupported).toBeGreaterThan(0); expect(report.summary.adapterErrors).toBeGreaterThan(0);
});
test('single case repro selects the same input and corpus hash', async () => {
  const report = await run('examples/buggy/adapter.mjs', { caseId: 'ny-fold-earlier-after-first' });
  const command = report.results[0]!.repro.replace(/^chronocases/, `${process.execPath} dist/cli.js`).replace('--out repro', `--out ${join(directory, 'repro')}`);
  const result = spawn('sh', ['-c', command], { stdio: ['ignore', 'pipe', 'pipe'] });
  const code = await new Promise(resolve => result.on('close', resolve)); expect(code).toBe(1);
  const again = JSON.parse(await readFile(join(directory, 'repro/report.json'), 'utf8'));
  expect(again.provenance.corpusHash).toBe(report.provenance.corpusHash); expect(again.results[0].fixture.input).toEqual((await loadCase('ny-fold-earlier-after-first')).input);
});
test('CLI selection/input mistakes exit 2 and show available identifiers', () => {
  try { execFileSync(process.execPath, ['dist/cli.js', 'run', '--adapter', 'examples/correct/adapter.mjs', '--case', 'typo'], { encoding: 'utf8', stdio: 'pipe' }); throw Error('unexpected pass'); }
  catch (error) { const e = error as {status:number;stderr:string}; expect(e.status).toBe(2); expect(String(e.stderr)).toContain('Available case IDs'); }
});
test('SIGINT stops runner-owned child and returns 130 with report', async () => {
  const path = await adapter('export function dateOnlyRoundtrip(){while(true){} }');
  const out = join(directory, 'interrupted');
  const child = spawn(process.execPath, ['dist/cli.js', 'run', '--adapter', path, '--case', 'date-la-roundtrip', '--out', out, '--json'], { stdio: 'pipe' });
  await new Promise(resolve => setTimeout(resolve, 300)); child.kill('SIGINT');
  expect(await new Promise(resolve => child.on('close', resolve))).toBe(130);
  expect(JSON.parse(await readFile(join(out, 'report.json'), 'utf8')).summary.interrupted).toBe(1);
});
