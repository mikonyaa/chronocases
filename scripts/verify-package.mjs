import { readFile, writeFile, mkdir, mkdtemp, cp, readdir, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, join, dirname } from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
const root = resolve('.');
const packageVersion = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
await mkdir('.artifacts/package', { recursive: true });
const supplied = process.argv.indexOf('--tgz');
let tarball;
if (supplied !== -1) { if (!process.argv[supplied + 1]) throw Error('--tgz needs a path'); tarball = resolve(process.argv[supplied + 1]); }
else { const output = JSON.parse(execFileSync('npm', ['pack', '--json', '--pack-destination', '.artifacts/package'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })); tarball = resolve('.artifacts/package', output[0].filename); }
const bytes = await readFile(tarball); assert.equal(bytes[0], 0x1f); assert.equal(bytes[1], 0x8b); assert.ok(bytes.length > 10000 && bytes.length < 20 * 1024 * 1024);
const sha256 = createHash('sha256').update(bytes).digest('hex');
const archiveFiles = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' }).trim().split('\n');
assert.ok(archiveFiles.every(p => p.startsWith('package/') && !p.split('/').includes('..')));
assert.ok(!archiveFiles.some(p => /(?:^|\/)(?:\.env[^/]*|\.git|node_modules|work|test-results)(?:\/|$)/.test(p)));
for (const required of ['dist/cli.js', 'dist/index.js', 'dist/index.d.ts', 'dist/worker/index.js', 'resources/explorer.html', 'resources/explorer.js', 'resources/schemas/case.json', 'resources/schemas/report.json', 'examples/correct/adapter.mjs', 'examples/typescript/adapter.ts', 'oracle/corpus-integrity.json']) assert.ok(archiveFiles.includes('package/' + required), required);
const consumer = await mkdtemp(join(dirname(root), 'chronocases-consumer-'));
assert.ok(!consumer.startsWith(root + '/'), 'Consumer must be outside the checkout');
await writeFile(join(consumer, 'package.json'), JSON.stringify({ name: 'chronocases-package-verification', version: '1.0.0', private: true }));
const env = { ...process.env }; delete env.NODE_PATH; delete env.NODE_OPTIONS;
function command(executable, args, accepted = [0], options = {}) {
  try { return { status: 0, output: execFileSync(executable, args, { cwd: consumer, env, encoding: 'utf8', stdio: 'pipe', ...options }) }; }
  catch (error) { if (accepted.includes(error.status)) return { status: error.status, output: String(error.stdout) }; throw new Error(`Consumer command failed (${error.status}): ${executable} ${args[0] ?? ''}\n${String(error.stderr).slice(0, 2000)}`); }
}
command('npm', ['install', tarball, '--ignore-scripts', '--no-audit', '--no-fund', '--cache', join(root, '.artifacts/npm-consumer-cache')]);
const binary = join(consumer, 'node_modules/chronocases/dist/cli.js');
const childTZ = process.env.CHRONOCASES_TEST_TZ ?? 'UTC';
const cli = (args, accepted) => command(process.execPath, [binary, ...args], accepted);
assert.equal(cli(['--version']).output.trim(), packageVersion); assert.match(cli(['--help']).output, /three explicit time contracts/);
const doctor = JSON.parse(cli(['doctor', '--json']).output); assert.equal(doctor.unsupported.length, 0);
cli(['init', '--dir', 'sample']);
const correct = cli(['run', '--adapter', 'sample/adapter.mjs', '--tz', childTZ, '--out', 'correct', '--json', '--no-open'], [3]); assert.equal(correct.status, 3); assert.equal(JSON.parse(correct.output).passed, 35);
const buggy = cli(['run', '--adapter', 'sample/buggy/adapter.mjs', '--tz', childTZ, '--out', 'buggy', '--json'], [3]); assert.equal(JSON.parse(buggy.output).failed, 16);
assert.equal(cli(['run', '--adapter', 'sample/buggy/adapter.mjs', '--case', 'ny-fold-earlier-after-first', '--out', 'one-bug', '--json'], [1]).status, 1);
assert.equal(cli(['run', '--adapter', 'sample/adapter.mjs', '--case', 'ny-fold-earlier-after-first', '--out', 'one-correct', '--json']).status, 0);
await writeFile(join(consumer, 'my-function.mjs'), `import {writeFile} from 'node:fs/promises';\nexport async function dateOnlyRoundtrip(input,metadata){if(Object.keys(metadata).sort().join(',')!=='caseId,contractVersion')throw Error('unexpected metadata');const stored=JSON.stringify({date:input.date});const restored=JSON.parse(stored).date;await writeFile('executed.txt',restored);return {status:'value',value:restored}}\n`);
cli(['run', '--adapter', 'my-function.mjs', '--case', 'date-la-roundtrip', '--out', 'my-result', '--json']); assert.equal(await readFile(join(consumer, 'executed.txt'), 'utf8'), '2024-06-04');
command(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', join(consumer, 'sample/typescript/tsconfig.json')]);
cli(['run', '--adapter', 'sample/typescript/compiled/adapter.js', '--case', 'date-la-roundtrip', '--out', 'typescript-result', '--json']);
cli(['demo', '--out', 'demo-output', '--json', '--no-open']);
cli(['explorer', '--report', 'buggy/report.json', '--out', 'explorer.html', '--no-open']);
assert.ok((await readFile(join(consumer, 'explorer.html'), 'utf8')).includes('date-la-roundtrip'));
const exported = command(process.execPath, ['--input-type=module', '-e', "import{loadCase,getCorpusHash,evaluateOutcome}from'chronocases';const f=await loadCase('date-la-roundtrip');if(!evaluateOutcome(f,{status:'value',value:f.input.date}).passed)throw Error('helper');console.log(await getCorpusHash())"]);
assert.equal(exported.output.trim(), doctor.provenance.corpusHash);
const installed = join(consumer, 'node_modules/chronocases');
await cp(join(installed, 'examples/logging'), join(consumer, 'logging'), { recursive: true });
await cp(join(installed, 'examples/pilot'), join(consumer, 'pilot'), { recursive: true });
const { payload } = await import(pathToFileURL(join(consumer, 'logging/dollar-logs.mjs')).href);
const browser = await chromium.launch(process.env.CI ? {} : { channel: 'chrome' });
const browserVersion = browser.version();
try {
  for (const name of ['dollar', 'bytewise']) {
    cli(['run', '--adapter', `logging/${name}-logs.mjs`, '--case', 'date-la-roundtrip', '--tz', childTZ, '--out', `${name}-logs`, '--json', '--no-open']);
    const data = JSON.parse(await readFile(join(consumer, `${name}-logs/report.json`), 'utf8'));
    for (const stream of ['stdout', 'stderr']) assert.deepEqual(Buffer.from(data.results[0].logs[stream]), Buffer.from(payload));
    cli(['explorer', '--report', `${name}-logs/report.json`, '--out', `${name}.html`, '--no-open']);
    const context = await browser.newContext({ offline: true });
    const page = await context.newPage(), errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
    await page.goto(pathToFileURL(join(consumer, `${name}.html`)).href);
    await page.getByText('Adapter logs', { exact: true }).click();
    assert.equal(await page.locator('details pre').textContent(), `stdout:\n${payload}\nstderr:\n${payload}`);
    assert.equal(await page.evaluate(() => 'auditInjected' in globalThis), false);
    assert.equal(await page.locator('img').count(), 0);
    const pending = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download JSON' }).click();
    assert.deepEqual(JSON.parse(await readFile(await (await pending).path(), 'utf8')), data);
    assert.deepEqual(errors, []); assert.deepEqual(requests, []);
    await context.close();
  }
} finally { await browser.close(); }
for (const caseId of ['date-la-roundtrip', 'date-leap-day', 'date-kiritimati-year-edge', 'date-invalid-nonleap']) {
  assert.equal(cli(['run', '--adapter', 'pilot/adapter.mjs', '--case', caseId, '--tz', childTZ, '--out', `pilot-${caseId}`, '--json']).status, 0);
}
assert.equal(cli(['run', '--adapter', 'pilot/adapter.mjs', '--contract', 'day-bucket', '--tz', childTZ, '--out', 'pilot-unsupported', '--json'], [3]).status, 3);
const policy = command(process.execPath, ['--input-type=module', '-e', "import assert from'node:assert/strict';import{persistBookingDate}from'./pilot/product.mjs';assert.deepEqual(await persistBookingDate('2019-12-31'),{status:'rejected',reasonCode:'OUT_OF_RANGE'});assert.deepEqual(await persistBookingDate('2024-02-30'),{status:'rejected',reasonCode:'INVALID_DATE'});assert.deepEqual(await persistBookingDate('2024-06-04'),{status:'value',value:'2024-06-04'});"]);
assert.equal(policy.status, 0);
assert.equal(JSON.parse(await readFile(join(consumer, 'booking.json'), 'utf8')).bookingDate, '2024-06-04');
const validImport = JSON.parse(await readFile(join(consumer, 'dollar-logs/report.json'), 'utf8'));
const corruptions = [
  r => { r.results[0].actual = { status: 'value', value: '1999-01-01' }; },
  r => { r.results[0].status = 'FAIL'; r.summary.passed = 0; r.summary.failed = 1; r.summary.exitCode = 1; },
  r => { r.summary.passed = 0; },
  r => { r.summary.exitCode = 3; },
  r => { r.results.push(structuredClone(r.results[0])); r.summary.passed = r.summary.selected = 2; },
  r => { r.results = []; },
  r => { r.results[0].caseId = r.results[0].fixture.caseId = 'unknown-case'; },
  r => { r.results[0].actual = r.results[0].expected = r.results[0].fixture.expected = { status: 'value', value: '1999-01-01' }; },
  r => { r.provenance.corpusHash = '0'.repeat(64); }
];
for (const [index, corrupt] of corruptions.entries()) {
  const data = structuredClone(validImport); corrupt(data);
  await writeFile(join(consumer, `invalid-${index}.json`), JSON.stringify(data));
  assert.equal(cli(['explorer', '--report', `invalid-${index}.json`, '--out', `invalid-${index}.html`], [2]).status, 2);
  await assert.rejects(stat(join(consumer, `invalid-${index}.html`)));
}
const caseCount = (await Promise.all(['date-only', 'day-bucket', 'recurrence'].map(c => readdir(join(installed, 'cases', c))))).flat().filter(p => p.endsWith('.json')).length; assert.equal(caseCount, 36);
const runtimeFiles = archiveFiles.filter(p => p.startsWith('package/dist/') && p.endsWith('.js'));
for (const file of runtimeFiles) assert.ok(!/from\s+['"](?:vitest|jest|typescript|esbuild|tsx|ts-node)/.test(await readFile(join(installed, file.slice(8)), 'utf8')), 'No dev-only runtime imports');
if (process.argv.includes('--frameworks')) {
  await cp(join(installed, 'examples'), join(consumer, 'examples'), { recursive: true });
  command('npm', ['install', '--save-dev', 'vitest@5.0.4', 'jest@30.5.2', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', join(root, '.artifacts/npm-consumer-cache')]);
  command(process.execPath, [join(consumer, 'node_modules/vitest/vitest.mjs'), 'run', 'examples/vitest/date-only.test.ts', '--maxWorkers', '1']);
  await writeFile(join(consumer, 'jest.config.mjs'), "export default {testMatch:['**/examples/jest/*.test.mjs'],transform:{},maxWorkers:1};\n");
  command(process.execPath, ['--experimental-vm-modules', join(consumer, 'node_modules/jest/bin/jest.js'), '--config', 'jest.config.mjs', '--runInBand']);
  const policyTest = "test('independent booking policy persists a label and rejects invalid/out-of-policy dates',async()=>{expect(await persistBookingDate('2024-06-04')).toEqual({status:'value',value:'2024-06-04'});expect(await persistBookingDate('2024-02-30')).toEqual({status:'rejected',reasonCode:'INVALID_DATE'});expect(await persistBookingDate('2019-12-31')).toEqual({status:'rejected',reasonCode:'OUT_OF_RANGE'});});\n";
  await writeFile(join(consumer, 'pilot-policy.vitest.test.mjs'), "import{test,expect}from'vitest';import{persistBookingDate}from'./pilot/product.mjs';\n" + policyTest);
  await writeFile(join(consumer, 'pilot-policy.jest.test.mjs'), "import{test,expect}from'@jest/globals';import{persistBookingDate}from'./pilot/product.mjs';\n" + policyTest);
  command(process.execPath, [join(consumer, 'node_modules/vitest/vitest.mjs'), 'run', 'pilot-policy.vitest.test.mjs', '--maxWorkers', '1']);
  await writeFile(join(consumer, 'pilot-jest.config.mjs'), "export default {testMatch:['**/pilot-policy.jest.test.mjs'],transform:{},maxWorkers:1};\n");
  command(process.execPath, ['--experimental-vm-modules', join(consumer, 'node_modules/jest/bin/jest.js'), '--config', 'pilot-jest.config.mjs', '--runInBand']);
}
const runtime = JSON.parse(await readFile(join(consumer, 'correct/report.json'), 'utf8')).provenance;
const evidence = { packageVersion, tarball, sha256, bytes: (await stat(tarball)).size, consumerOutsideCheckout: true, consumerDirectory: consumer, actualUserFunctionExecuted: true, compiledTypeScriptExecuted: true, frameworkExamplesExecuted: process.argv.includes('--frameworks'), logRoundtripExecuted: true, browserLogRoundtripExecuted: true, browserVersion, negativeImportsRejected: corruptions.length, pilotBusinessPoliciesExecuted: true, corpusHash: doctor.provenance.corpusHash, runtime, correct: JSON.parse(correct.output), buggy: JSON.parse(buggy.output), archiveFileCount: archiveFiles.length };
await writeFile(join(root, '.artifacts/package-verification.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ sha256, bytes: bytes.length, consumerOutsideCheckout: true, actualUserFunctionExecuted: true, compiledTypeScriptExecuted: true, frameworkExamplesExecuted: evidence.frameworkExamplesExecuted, browserLogRoundtripExecuted: true, negativeImportsRejected: corruptions.length, pilotBusinessPoliciesExecuted: true, passedSupportedCases: 35, expectedBuggyFailures: 16, declaredUnsupported: 1 }));
