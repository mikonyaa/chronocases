import { test, expect } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { generateExplorer } from '../../dist/explorer/index.js';
import { runCases } from '../../dist/index.js';
import { payload as logPayload } from '../fixtures/dollar-logs.mjs';
let server: Server; let baseURL: string;
let correct: import('../../src/types.js').Report;
test.beforeAll(async () => {
  execFileSync(process.execPath, ['scripts/build-site.mjs'], { stdio: 'pipe' });
  correct = JSON.parse(await readFile('site/correct-report.json', 'utf8'));
  await mkdir('.artifacts/ui', { recursive: true });
  const source = "import * as ref from 'chronocases/reference'; export function dateOnlyRoundtrip(input,meta){return meta.caseId==='date-la-roundtrip'?{status:'value',value:'2024-06-03'}:ref.dateOnlyRoundtrip(input)}; export function nextOccurrence(input,meta){if(meta.caseId==='utc-ordinary-daily')throw Error('test');return ref.nextOccurrence(input)}";
  await writeFile('.artifacts/ui/mixed.mjs', source);
  const mixed = await runCases({ adapterPath: '.artifacts/ui/mixed.mjs' });
  await writeFile('.artifacts/ui/mixed.json', JSON.stringify(mixed));
  const hostile = structuredClone(correct); hostile.results[0]!.fixture.title = '</script><script>globalThis.HOSTILE_EXECUTED=1</script><img src=x onerror="globalThis.HOSTILE_EXECUTED=2">';
  hostile.results[0]!.fixture.rationale = '<svg onload=alert(1)> untrusted text';
  await writeFile('site/hostile.html', await generateExplorer(hostile));
  const preloader = "const Original=Intl.DateTimeFormat;Intl.DateTimeFormat=new Proxy(Original,{construct(target,args){if(args[1]?.timeZone==='America/New_York')throw RangeError('simulated unavailable IANA zone');return Reflect.construct(target,args)},apply(target,receiver,args){return Reflect.apply(target,receiver,args)}});";
  await writeFile('.artifacts/ui/missing-zone.mjs', preloader);
  try { execFileSync(process.execPath, ['dist/cli.js', 'run', '--adapter', 'examples/correct/adapter.mjs', '--case', 'ny-fold-earlier-after-first', '--out', '.artifacts/ui/environment', '--json'], { env: { ...process.env, NODE_OPTIONS: `--import ${pathToFileURL(resolve('.artifacts/ui/missing-zone.mjs')).href}` }, stdio: 'pipe' }); }
  catch (error) { expect((error as { status: number }).status).toBe(3); }
  server = createServer(async (request, response) => {
    try { const pathname = new URL(request.url ?? '/', 'http://localhost').pathname; const name = pathname === '/' ? 'index.html' : pathname.slice(1); if (name.includes('..')) { response.writeHead(404).end(); return; } const data = await readFile(join(resolve('site'), name)); response.setHeader('Content-Type', name.endsWith('.json') ? 'application/json' : 'text/html'); response.end(data); }
    catch { response.writeHead(404).end(); }
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const address = server.address(); if (!address || typeof address === 'string') throw Error('Missing ephemeral server address'); baseURL = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => { await new Promise<void>(done => server.close(() => done())); });
test.beforeEach(async ({ page }) => { await page.goto(baseURL); });
for (const width of [1440, 1024, 390]) test(`actual report is usable at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 980 }); await expect(page.getByRole('heading', { name: 'A date is not UTC midnight' })).toBeVisible();
  await expect(page.locator('.comparison').first()).toContainText('2024-06-03'); await expect(page.locator('#summary')).toContainText('16');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `.artifacts/ui/${width}.png`, fullPage: true });
});
test('date picker exercises the actual UTC serialization mistake', async ({ page }) => {
  await page.getByLabel('Selected calendar date').fill('2024-06-04');
  await expect(page.locator('#buggy-date')).toHaveText('2024-06-03'); await expect(page.locator('#correct-date')).toHaveText('2024-06-04');
  await page.getByLabel('Selected calendar date').fill('2024-02-29'); await expect(page.locator('#buggy-date')).toHaveText('2024-02-28'); await expect(page.locator('#correct-date')).toHaveText('2024-02-29');
});
test('correct report and the two fold policies preserve distinct nominal dates', async ({ page }) => {
  await page.getByRole('button', { name: 'Correct adapter', exact: true }).click(); await expect(page.locator('#summary')).toContainText('35');
  await page.getByLabel('Find a case').fill('ny-fold-earlier-after-first'); await page.locator('#case-list button').click(); await expect(page.locator('.comparison')).toContainText('2024-11-04T06:30:00Z');
  await page.getByLabel('Find a case').fill('ny-fold-later-after-first'); await expect(page.locator('.comparison')).toContainText('2024-11-03T06:30:00Z');
});
test('keyboard filtering, no matches and reset work', async ({ page }) => {
  await page.getByLabel('Find a case').focus(); await page.keyboard.type('never-a-case'); await expect(page.getByRole('heading', { name: 'No matching cases' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).focus(); await page.keyboard.press('Enter'); await expect(page.locator('#case-list button')).toHaveCount(36);
  await page.getByLabel('Contract', { exact: true }).selectOption('recurrence'); await expect(page.locator('#case-list button')).toHaveCount(16);
});
test('copy and download use local report data', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL });
  await page.getByRole('button', { name: 'Copy command' }).click(); const copied = await page.evaluate(() => navigator.clipboard.readText()); expect(copied).toContain('--case \'date-la-roundtrip\''); expect(copied).toContain(correct.provenance.corpusHash);
  const downloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download JSON' }).click(); const download = await downloadPromise;
  const path = await download.path(); expect(path).toBeTruthy(); const data = JSON.parse(await readFile(path!, 'utf8')); expect(data.summary.failed).toBe(16);
});
test('malformed JSON and invalid report are rejected without replacing the current report', async ({ page }) => {
  await page.locator('#report-file').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{bad') }); await expect(page.locator('#notice')).toHaveClass(/error/); await expect(page.locator('#summary')).toContainText('36 selected');
  await page.locator('#report-file').setInputFiles({ name: 'bad-schema.json', mimeType: 'application/json', buffer: Buffer.from('{"schemaVersion":"1"}') }); await expect(page.locator('#notice')).toContainText('Invalid report');
});
test('byte limits apply before parsing a local upload', async ({ page }) => {
  await page.locator('#report-file').setInputFiles({ name: 'huge.json', mimeType: 'application/json', buffer: Buffer.alloc(5242881, 32) }); await expect(page.locator('#notice')).toContainText('5 MiB');
});
test('hostile HTML stays text in embedded data and reports', async ({ page }) => {
  await page.goto(`${baseURL}/hostile.html`); await page.locator('#search').fill(correct.results[0]!.caseId);
  await expect(page.locator('#case-detail h2')).toContainText('<script>'); expect(await page.evaluate(() => 'HOSTILE_EXECUTED' in globalThis)).toBe(false); await expect(page.locator('img')).toHaveCount(0);
});
test('empty report and long annotations have explicit readable states', async ({ page }) => {
  const long = structuredClone(correct); const title = 'long-case-' + 'a'.repeat(130); long.results[0]!.fixture.title = title;
  await page.locator('#report-file').setInputFiles({ name: 'long.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(long)) }); await page.setViewportSize({ width: 390, height: 900 }); await page.locator('#search').fill(title); await expect(page.locator('#case-detail h2')).toContainText(title); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const empty = structuredClone(correct); empty.results = []; empty.summary = { selectedContracts: [], selected: 0, passed: 0, failed: 0, adapterErrors: 0, unsupported: 0, interrupted: 0, exitCode: 0 };
  await page.locator('#report-file').setInputFiles({ name: 'empty.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(empty)) }); await expect(page.getByRole('heading', { name: 'No results in this report' })).toBeVisible();
});
const corruptions: [string, (report: import('../../src/types.js').Report) => void][] = [
  ['actual', r => { r.results.find(x => x.caseId === 'date-la-roundtrip')!.actual = { status: 'value', value: '1999-01-01' }; }],
  ['status', r => { r.results.find(x => x.caseId === 'date-la-roundtrip')!.status = 'FAIL'; r.summary.passed--; r.summary.failed++; }],
  ['summary', r => { r.summary.passed++; }],
  ['exit', r => { r.summary.exitCode = 0; }],
  ['duplicate ID', r => { r.results[1] = structuredClone(r.results[0]!); }],
  ['missing ID', r => { r.results.pop(); }],
  ['frozen expected', r => { const result = r.results.find(x => x.caseId === 'date-la-roundtrip')!; result.actual = result.expected = result.fixture.expected = { status: 'value', value: '1999-01-01' }; }],
  ['unknown ID', r => { r.results[0]!.caseId = r.results[0]!.fixture.caseId = 'invented-case'; }],
  ['corpus hash', r => { r.provenance.corpusHash = '0'.repeat(64); }]
];
for (const [name, corrupt] of corruptions) test(`browser import rejects contradictory ${name} and preserves current data`, async ({ page }) => {
  const data = structuredClone(correct); corrupt(data);
  await page.locator('#report-file').setInputFiles({ name: 'corrupt.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
  await expect(page.locator('#notice')).toHaveClass(/error/);
  await expect(page.locator('#notice')).toContainText('Invalid report');
  await expect(page.locator('#summary')).toContainText('16');
});
test('mixed outcomes come from an actually executed adapter', async ({ page }) => {
  await page.locator('#report-file').setInputFiles(resolve('.artifacts/ui/mixed.json')); await expect(page.locator('#summary')).toContainText('exit 2');
  await page.locator('#search').fill('utc-ordinary-daily'); await expect(page.locator('#case-detail')).toContainText('ADAPTER_ERROR'); await expect(page.locator('#case-detail')).toContainText('null');
});
test('simulated missing runtime zone is reported separately from a business failure', async ({ page }) => {
  await page.locator('#report-file').setInputFiles(resolve('.artifacts/ui/environment/report.json')); await expect(page.locator('#case-detail')).toContainText('UNSUPPORTED_ENVIRONMENT'); await expect(page.locator('#summary')).toContainText('exit 3');
});
test('standalone file works offline with copy fallback and download', async ({ page, context }) => {
  await context.setOffline(true); await page.goto(pathToFileURL(resolve('site/explorer.html')).href); await expect(page.locator('#case-detail')).toContainText('2024-06-03');
  await page.getByRole('button', { name: 'Copy command' }).click(); await expect(page.locator('#notice')).toContainText(/copied|selected/);
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download JSON' }).click(); expect((await download).suggestedFilename()).toBe('chronocases-report.json');
});
for (const adapterName of ['dollar', 'bytewise']) test(`real child ${adapterName} and hostile logs remain exact visible text in standalone HTML`, async ({ page, context }) => {
  const report = await runCases({ adapterPath: `tests/fixtures/${adapterName}-logs.mjs`, caseId: 'date-la-roundtrip' });
  const path = resolve(`.artifacts/ui/${adapterName}.html`);
  await writeFile(path, await generateExplorer(report));
  const errors: string[] = [], requests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  await context.setOffline(true);
  await page.goto(pathToFileURL(path).href);
  await page.getByText('Adapter logs', { exact: true }).click();
  await expect(page.locator('details pre')).toHaveText(`stdout:\n${logPayload}\nstderr:\n${logPayload}`);
  expect(await page.locator('details pre').textContent()).toBe(`stdout:\n${logPayload}\nstderr:\n${logPayload}`);
  expect(await page.evaluate(() => 'auditInjected' in globalThis)).toBe(false);
  await expect(page.locator('img')).toHaveCount(0);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download JSON' }).click();
  const downloaded = await (await pending).path();
  expect(JSON.parse(await readFile(downloaded!, 'utf8'))).toEqual(report);
  expect(errors).toEqual([]); expect(requests).toEqual([]);
});
for (const kind of ['syntax', 'null', 'semantics', 'corrected'] as const) test(`corrupted embedded ${kind} has a readable error and local-file recovery`, async ({ page }) => {
  const altered = structuredClone(correct);
  altered.results.find(r => r.caseId === 'date-la-roundtrip')!.actual = { status: 'value', value: '1999-01-01' };
  const payload = kind === 'syntax' ? '{"report":' : kind === 'null' ? 'null' : JSON.stringify({ report: kind === 'semantics' ? altered : correct, correctedReport: kind === 'corrected' ? altered : null });
  const original = await generateExplorer(correct);
  const html = original.replace(/<script id="chronocases-data" type="application\/json">[\s\S]*?<\/script>/, () => `<script id="chronocases-data" type="application/json">${payload.replaceAll('<', '\\u003c')}</script>`);
  const path = resolve(`.artifacts/ui/corrupt-${kind}.html`); await writeFile(path, html);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(pathToFileURL(path).href);
  await expect(page.locator('#case-detail')).toContainText('Unable to read embedded report');
  await expect(page.locator('#notice')).toHaveClass(/error/);
  await expect(page.getByRole('button', { name: 'Download JSON' })).toBeDisabled();
  await page.locator('#report-file').setInputFiles({ name: 'valid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(correct)) });
  await expect(page.locator('#notice')).toContainText('Local report opened');
  await expect(page.locator('#summary')).toContainText('35');
  await expect(page.getByRole('button', { name: 'Download JSON' })).toBeEnabled();
  expect(errors).toEqual([]);
});

test('a real invalid adapter return has readable bounded preview without a pageerror', async ({ page }) => {
  const path = resolve('.artifacts/ui/invalid-shape.mjs');
  await writeFile(path, "export function dateOnlyRoundtrip(){return{status:'value',value:{wrong:'preview'}}}");
  const report = await runCases({ adapterPath: path, caseId: 'date-la-roundtrip' });
  expect(report.summary.exitCode).toBe(1);
  const html = resolve('.artifacts/ui/invalid-shape.html'); await writeFile(html, await generateExplorer(report));
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(pathToFileURL(html).href);
  await expect(page.locator('.comparison')).toContainText('Invalid return shape');
  await expect(page.locator('.comparison')).toContainText('preview');
  await expect(page.locator('#summary')).toContainText('exit 1');
  expect(errors).toEqual([]);
});
test('full-cap less-than logs in both embedded reports survive safe-encoding expansion', async ({ page, context }) => {
  const path = resolve('.artifacts/ui/full-cap.mjs');
  await writeFile(path, "import * as ref from 'chronocases/reference';const log=()=>{process.stdout.write('<'.repeat(32768));process.stderr.write('<'.repeat(32768))};export function dateOnlyRoundtrip(i){log();return ref.dateOnlyRoundtrip(i)}export function instantToDayBucket(i){log();return ref.instantToDayBucket(i)}export function nextOccurrence(i){log();return ref.nextOccurrence(i)}");
  const report = await runCases({ adapterPath: path });
  expect(report.summary).toMatchObject({ selected: 36, passed: 35, unsupported: 1, exitCode: 3 });
  expect(Buffer.byteLength(JSON.stringify(report))).toBeLessThan(5242880);
  for (const result of report.results) expect(result.logs).toEqual({ stdout: '<'.repeat(32768), stderr: '<'.repeat(32768), truncated: false });
  const html = await generateExplorer(report, report);
  expect(Buffer.byteLength(html)).toBeGreaterThan(2 * 5242880);
  const output = resolve('.artifacts/ui/full-cap.html'); await writeFile(output, html);
  const errors: string[] = [], requests: string[] = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('request', r => { if (/^https?:/.test(r.url())) requests.push(r.url()); });
  await context.setOffline(true); await page.goto(pathToFileURL(output).href);
  await expect(page.locator('#summary')).toContainText('35');
  await page.getByText('Adapter logs', { exact: true }).click();
  expect(await page.locator('details pre').textContent()).toBe(`stdout:\n${'<'.repeat(32768)}\nstderr:\n${'<'.repeat(32768)}`);
  await page.getByRole('button', { name: 'Correct adapter', exact: true }).click();
  await expect(page.locator('#summary')).toContainText('35');
  const pending = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download JSON' }).click();
  expect(JSON.parse(await readFile((await (await pending).path())!, 'utf8'))).toEqual(report);
  expect(errors).toEqual([]); expect(requests).toEqual([]);
});
test('embedded logical report over 5 MiB is rejected even within the encoding-aware outer bound', async ({ page }) => {
  const report = structuredClone(correct);
  for (const result of report.results) result.logs = { stdout: '\ufffd'.repeat(65536), stderr: '', truncated: false };
  expect(Buffer.byteLength(JSON.stringify(report))).toBeGreaterThan(5242880);
  const path = resolve('.artifacts/ui/oversized-embedded.html');
  await writeFile(path, await generateExplorer(report));
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(pathToFileURL(path).href);
  await expect(page.locator('#case-detail')).toContainText('Unable to read embedded report');
  await expect(page.getByRole('button', { name: 'Download JSON' })).toBeDisabled();
  expect(errors).toEqual([]);
});
