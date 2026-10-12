import { fork } from 'node:child_process';
import { resolve, extname } from 'node:path';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { evaluateOutcome } from '../comparison/index.js';
import { checkEnvironment, provenance } from '../provenance/index.js';
import { PACKAGE_VERSION, getCorpusHash, loadCases, selectCases } from '../corpus/index.js';
import { LIMITS } from '../schemas/limits.js';
import { CONTRACTS, type ChronoCase, type CaseResult, type Report, type ResultStatus } from '../types.js';
const functions = { 'date-only': 'dateOnlyRoundtrip', 'day-bucket': 'instantToDayBucket', recurrence: 'nextOccurrence' } as const;
export interface RunOptions { adapterPath: string; caseId?: string; contract?: string; tz?: string; timeoutMs?: number; signal?: AbortSignal; adapterLabel?: string; corpusHash?: string }
interface WorkerReply { kind: 'result' | 'error' | 'unsupported'; actual?: unknown; reasonCode?: string; invalidShape?: boolean }
const shell = (s: string): string => `'${s.replaceAll("'", "'\\''")}'`;
function execute(fixture: ChronoCase, options: RunOptions, repro: string): Promise<CaseResult> {
  const started = performance.now();
  const logs = { stdout: '', stderr: '', truncated: false };
  const base = { caseId: fixture.caseId, contract: fixture.contract, expected: fixture.expected, repro, fixture, logs };
  const result = (status: ResultStatus, actual: unknown, reasonCode: string | null, explanation: string): CaseResult => ({ ...base, status, actual, reasonCode, explanation, durationMs: Math.round(performance.now() - started) });
  const environmentIssue = checkEnvironment(fixture);
  if (environmentIssue) return Promise.resolve(result('UNSUPPORTED', null, 'UNSUPPORTED_ENVIRONMENT', environmentIssue));
  if (options.signal?.aborted) return Promise.resolve(result('INTERRUPTED', null, 'INTERRUPTED', 'Interrupted before adapter execution.'));
  return new Promise(resolveResult => {
    const child = fork(fileURLToPath(new URL('../worker/index.js', import.meta.url)), [], { env: { ...process.env, TZ: options.tz ?? 'UTC' }, execArgv: ['--max-old-space-size=128'], stdio: ['ignore', 'pipe', 'pipe', 'ipc'], serialization: 'json' });
    let settled = false;
    let reply: WorkerReply | null = null;
    const abort = (): void => finish('INTERRUPTED', null, 'INTERRUPTED', 'Interrupted; only this runner-owned child was terminated.');
    const timer = setTimeout(() => finish('ADAPTER_ERROR', null, 'ADAPTER_TIMEOUT', `Adapter exceeded the ${options.timeoutMs ?? LIMITS.timeoutMs} ms technical timeout. This is not NO_OCCURRENCE_IN_WINDOW.`), options.timeoutMs ?? LIMITS.timeoutMs);
    function finish(status: ResultStatus, actual: unknown, code: string | null, explanation: string): void {
      if (settled) return;
      settled = true; clearTimeout(timer); options.signal?.removeEventListener('abort', abort);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      resolveResult(result(status, actual, code, explanation));
    }
    options.signal?.addEventListener('abort', abort, { once: true });
    for (const stream of ['stdout', 'stderr'] as const) child[stream]?.on('data', (chunk: Buffer) => {
      const used = Buffer.byteLength(logs.stdout) + Buffer.byteLength(logs.stderr);
      const available = Math.max(0, LIMITS.logBytes - used);
      logs[stream] += chunk.subarray(0, available).toString('utf8');
      if (chunk.length > available) { logs.truncated = true; finish('ADAPTER_ERROR', null, 'ADAPTER_LOG_LIMIT', 'Adapter log limit exceeded; captured stdout/stderr are bounded and separate from the IPC result.'); }
    });
    child.on('message', (message: WorkerReply) => { reply = message; });
    child.on('error', () => finish('ADAPTER_ERROR', null, 'ADAPTER_PROCESS_ERROR', 'Unable to start or communicate with the adapter child. Details omitted.'));
    child.on('close', () => {
      if (settled) return;
      if (!reply) { finish('ADAPTER_ERROR', null, 'ADAPTER_CRASH', 'Adapter exited without a controlled IPC result.'); return; }
      if (reply.kind === 'error') { finish('ADAPTER_ERROR', null, reply.reasonCode ?? 'ADAPTER_ERROR', 'Adapter threw, rejected, or exceeded a result limit. Exception text and source are intentionally omitted; inspect the trusted local adapter.'); return; }
      if (reply.kind === 'unsupported') { finish('UNSUPPORTED', null, 'MISSING_ADAPTER_EXPORT', `Requested export ${functions[fixture.contract]} is missing. This contract was not evaluated.`); return; }
      if (reply.invalidShape) { finish('FAIL', reply.actual ?? null, 'INVALID_RETURN_SHAPE', 'INVALID_RETURN_SHAPE: the original adapter return did not match the normalized interface before IPC encoding. Return canonical strings and exact fields; JSON serialization cannot repair an object value or extra undefined fields. The actual preview is its bounded JSON encoding.'); return; }
      const comparison = evaluateOutcome(fixture, reply.actual);
      if (comparison.validShape && reply.actual && typeof reply.actual === 'object' && (reply.actual as Record<string, unknown>).reasonCode === 'UNSUPPORTED_RECURRENCE_TRANSITION') {
        finish('UNSUPPORTED', reply.actual, 'UNSUPPORTED_RECURRENCE_TRANSITION', `${comparison.passed ? 'Matches the declared unsupported-transition negative self-test. ' : 'Adapter declined this transition. '}No occurrence computation is covered for this case.`); return;
      }
      finish(comparison.passed ? 'PASS' : 'FAIL', reply.actual ?? null, comparison.validShape ? null : 'INVALID_RETURN_SHAPE', comparison.explanation);
    });
    child.send({ adapterPath: resolve(options.adapterPath), exportName: functions[fixture.contract], input: structuredClone(fixture.input), metadata: { caseId: fixture.caseId, contractVersion: fixture.contractVersion } }, error => { if (error) finish('ADAPTER_ERROR', null, 'ADAPTER_PROCESS_ERROR', 'Adapter IPC request could not be sent.'); });
  });
}
export async function runCases(options: RunOptions): Promise<Report> {
  if (!['.js', '.mjs'].includes(extname(options.adapterPath))) throw new Error('Adapter must be an explicit local .js or .mjs module; compile TypeScript first.');
  if (!(await stat(resolve(options.adapterPath))).isFile()) throw new Error('Adapter path must be a local file.');
  if (options.timeoutMs !== undefined && (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 50 || options.timeoutMs > 60000)) throw new Error('timeout-ms must be an integer between 50 and 60000');
  if (options.tz) { try { new Intl.DateTimeFormat('en', { timeZone: options.tz }); } catch { throw new Error('Invalid child TZ'); } }
  const hash = await getCorpusHash();
  if (options.corpusHash && options.corpusHash !== hash) throw new Error('Corpus hash mismatch: install the package version used for this reproduction.');
  const selected = selectCases(await loadCases(), { ...(options.caseId ? { caseId: options.caseId } : {}), ...(options.contract ? { contract: options.contract } : {}) });
  const results: CaseResult[] = [];
  for (const fixture of selected) {
    const repro = `chronocases run --adapter ${shell(options.adapterLabel ?? options.adapterPath)} --case ${shell(fixture.caseId)} --tz ${shell(options.tz ?? 'UTC')} --corpus-hash ${hash} --out repro --json --no-open`;
    results.push(await execute(fixture, options, repro));
  }
  const count = (status: ResultStatus): number => results.filter(r => r.status === status).length;
  const passed = count('PASS'), failed = count('FAIL'), adapterErrors = count('ADAPTER_ERROR'), unsupported = count('UNSUPPORTED'), interrupted = count('INTERRUPTED');
  const exitCode = interrupted ? 130 : adapterErrors ? 2 : unsupported ? 3 : failed ? 1 : 0;
  const runtime = await provenance(); runtime.adapterProcessTZ = options.tz ?? 'UTC';
  return { schemaVersion: '1', packageVersion: PACKAGE_VERSION, createdAt: new Date().toISOString(), adapter: options.adapterLabel ?? options.adapterPath, provenance: runtime, summary: { selectedContracts: CONTRACTS.filter(c => selected.some(f => f.contract === c)), selected: selected.length, passed, failed, adapterErrors, unsupported, interrupted, exitCode }, results };
}
