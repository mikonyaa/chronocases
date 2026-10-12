import { readFile, writeFile, mkdir, mkdtemp, cp, readdir, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, join, dirname } from 'node:path';
import assert from 'node:assert/strict';
const root = resolve('.');
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
assert.equal(cli(['--version']).output.trim(), '0.1.0'); assert.match(cli(['--help']).output, /three explicit time contracts/);
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
const caseCount = (await Promise.all(['date-only', 'day-bucket', 'recurrence'].map(c => readdir(join(installed, 'cases', c))))).flat().filter(p => p.endsWith('.json')).length; assert.equal(caseCount, 36);
const runtimeFiles = archiveFiles.filter(p => p.startsWith('package/dist/') && p.endsWith('.js'));
for (const file of runtimeFiles) assert.ok(!/from\s+['"](?:vitest|jest|typescript|esbuild|tsx|ts-node)/.test(await readFile(join(installed, file.slice(8)), 'utf8')), 'No dev-only runtime imports');
if (process.argv.includes('--frameworks')) {
  await cp(join(installed, 'examples'), join(consumer, 'examples'), { recursive: true });
  command('npm', ['install', '--save-dev', 'vitest@5.0.4', 'jest@30.5.2', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', join(root, '.artifacts/npm-consumer-cache')]);
  command(process.execPath, [join(consumer, 'node_modules/vitest/vitest.mjs'), 'run', 'examples/vitest/date-only.test.ts', '--maxWorkers', '1']);
  await writeFile(join(consumer, 'jest.config.mjs'), "export default {testMatch:['**/examples/jest/*.test.mjs'],transform:{},maxWorkers:1};\n");
  command(process.execPath, ['--experimental-vm-modules', join(consumer, 'node_modules/jest/bin/jest.js'), '--config', 'jest.config.mjs', '--runInBand']);
}
const runtime = JSON.parse(await readFile(join(consumer, 'correct/report.json'), 'utf8')).provenance;
const evidence = { packageVersion: '0.1.0', tarball: tarball.slice(root.length + 1), sha256, bytes: (await stat(tarball)).size, consumerOutsideCheckout: true, actualUserFunctionExecuted: true, compiledTypeScriptExecuted: true, frameworkExamplesExecuted: process.argv.includes('--frameworks'), corpusHash: doctor.provenance.corpusHash, runtime, correct: JSON.parse(correct.output), buggy: JSON.parse(buggy.output), archiveFileCount: archiveFiles.length };
await writeFile(join(root, '.artifacts/package-verification.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ sha256, bytes: bytes.length, consumerOutsideCheckout: true, actualUserFunctionExecuted: true, compiledTypeScriptExecuted: true, frameworkExamplesExecuted: evidence.frameworkExamplesExecuted, passedSupportedCases: 35, expectedBuggyFailures: 16, declaredUnsupported: 1 }));
