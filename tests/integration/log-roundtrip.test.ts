import { test, expect } from 'vitest';
import { readFile, mkdir, writeFile, mkdtemp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runCases } from '../../dist/index.js';
import { payload } from '../fixtures/dollar-logs.mjs';

test('real child dollar logs survive JSON and both HTML template markers byte for byte', async () => {
  const report = await runCases({ adapterPath: 'tests/fixtures/dollar-logs.mjs', caseId: 'date-la-roundtrip' });
  expect(report.summary.exitCode).toBe(0);
  for (const stream of ['stdout', 'stderr'] as const) expect(Buffer.from(report.results[0]!.logs[stream])).toEqual(Buffer.from(payload));
  await mkdir('.artifacts/roundtrip', { recursive: true });
  const { writeReport } = await import('../../dist/report/index.js');
  await writeReport(report, '.artifacts/roundtrip');
  execFileSync(process.execPath, ['dist/cli.js', 'explorer', '--report', '.artifacts/roundtrip/report.json', '--out', '.artifacts/roundtrip/explorer.html', '--no-open']);
  const html = await readFile('.artifacts/roundtrip/explorer.html', 'utf8');
  const embedded = html.match(/<script id="chronocases-data" type="application\/json">([\s\S]*?)<\/script>/)![1]!;
  const data = JSON.parse(embedded);
  expect(data.report).toEqual(JSON.parse(await readFile('.artifacts/roundtrip/report.json', 'utf8')));
  expect(html).not.toContain('</script><img');
  expect(html).not.toContain('/*__SCRIPT__*/</script>');
});

test('bytewise UTF-8 on both real child streams survives JSON exactly', async () => {
  const report = await runCases({ adapterPath: 'tests/fixtures/bytewise-logs.mjs', caseId: 'date-la-roundtrip' });
  expect(report.summary.exitCode).toBe(0);
  for (const stream of ['stdout', 'stderr'] as const) expect(Buffer.from(report.results[0]!.logs[stream])).toEqual(Buffer.from(payload));
  expect(report.results[0]!.logs.truncated).toBe(false);
});

async function sourceAdapter(source: string): Promise<string> {
  await mkdir('.artifacts', { recursive: true });
  const directory = await mkdtemp(resolve('.artifacts/limit-'));
  const path = join(directory, 'adapter.mjs');
  await writeFile(path, source); return path;
}

test.each([65535, 65536, 65537])('shared raw-byte cap at %i bytes', async bytes => {
  const path = await sourceAdapter(`export function dateOnlyRoundtrip(input){process.stdout.write('a'.repeat(32768));process.stderr.write('b'.repeat(${bytes}-32768));return {status:'value',value:input.date}}`);
  const report = await runCases({ adapterPath: path, caseId: 'date-la-roundtrip' });
  const result = report.results[0]!;
  expect(Buffer.byteLength(result.logs.stdout) + Buffer.byteLength(result.logs.stderr)).toBe(Math.min(bytes, 65536));
  expect(result.logs.truncated).toBe(bytes > 65536);
  expect(report.summary.exitCode).toBe(bytes > 65536 ? 2 : 0);
  if (bytes > 65536) expect(result.reasonCode).toBe('ADAPTER_LOG_LIMIT');
});

test('a limit splitting a codepoint is flushed once and late data cannot mutate the report', async () => {
  const path = await sourceAdapter("export function dateOnlyRoundtrip(){process.stdout.write(Buffer.concat([Buffer.alloc(65535,97),Buffer.from('💡tail')]));while(true){process.stdout.write('tail')}}");
  const report = await runCases({ adapterPath: path, caseId: 'date-la-roundtrip' });
  expect(report.results[0]!.logs).toEqual({ stdout: 'a'.repeat(65535) + '\ufffd', stderr: '', truncated: true });
  expect(report.results[0]!.reasonCode).toBe('ADAPTER_LOG_LIMIT');
  const before = JSON.stringify(report);
  await new Promise(done => setTimeout(done, 100));
  expect(JSON.stringify(report)).toBe(before);
});

test.each(['timeout', 'cancel'])('%s flushes each incomplete captured stream and seals the collector', async mode => {
  const path = await sourceAdapter("export function dateOnlyRoundtrip(){process.stdout.write(Buffer.from([120,226]));process.stderr.write(Buffer.from([121,240]));setInterval(()=>{},1000);return new Promise(()=>{})}");
  const controller = new AbortController();
  const timer = mode === 'cancel' ? setTimeout(() => controller.abort(), 600) : undefined;
  const report = await runCases({ adapterPath: path, caseId: 'date-la-roundtrip', timeoutMs: 1000, ...(mode === 'cancel' ? { signal: controller.signal } : {}) });
  if (timer) clearTimeout(timer);
  expect(report.results[0]!.logs).toEqual({ stdout: 'x\ufffd', stderr: 'y\ufffd', truncated: false });
  expect(report.summary.exitCode).toBe(mode === 'cancel' ? 130 : 2);
  expect(report.results[0]!.reasonCode).toBe(mode === 'cancel' ? 'INTERRUPTED' : 'ADAPTER_TIMEOUT');
  const before = JSON.stringify(report); await new Promise(done => setTimeout(done, 100)); expect(JSON.stringify(report)).toBe(before);
});
