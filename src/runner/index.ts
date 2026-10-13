import { fork } from 'node:child_process';
import { resolve, extname } from 'node:path';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { classifyOutcome, summarizeResults } from '../report/semantics.js';
import { checkEnvironment, provenance } from '../provenance/index.js';
import { PACKAGE_VERSION, getCorpusHash, loadCases, selectCases, validateReport } from '../corpus/index.js';
import { LIMITS } from '../schemas/limits.js';
import { type ChronoCase, type CaseResult, type Report, type ResultStatus } from '../types.js';
import { BoundedLogCollector } from './logs.js';
const functions = { 'date-only': 'dateOnlyRoundtrip', 'day-bucket': 'instantToDayBucket', recurrence: 'nextOccurrence' } as const;
export interface RunOptions { adapterPath: string; caseId?: string; contract?: string; tz?: string; timeoutMs?: number; signal?: AbortSignal; adapterLabel?: string; corpusHash?: string }
interface WorkerReply { kind: 'result' | 'error' | 'unsupported'; actual?: unknown; reasonCode?: string; invalidShape?: boolean }
const shell = (s: string): string => `'${s.replaceAll("'", "'\\''")}'`;
function execute(fixture: ChronoCase, options: RunOptions, repro: string): Promise<CaseResult> {
  const started = performance.now();
  const collector = new BoundedLogCollector(LIMITS.logBytes);
  const base = { caseId: fixture.caseId, contract: fixture.contract, expected: fixture.expected, repro, fixture };
  const result = (status: ResultStatus, actual: unknown, reasonCode: string | null, explanation: string): CaseResult => ({ ...base, logs: collector.finish(), status, actual, reasonCode, explanation, durationMs: Math.round(performance.now() - started) });
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
      if (settled) return;
      if (collector.append(stream, chunk)) finish('ADAPTER_ERROR', null, 'ADAPTER_LOG_LIMIT', 'Adapter log limit exceeded; captured stdout/stderr are bounded and separate from the IPC result.');
    });
    child.on('message', (message: WorkerReply) => { reply = message; });
    child.on('error', () => finish('ADAPTER_ERROR', null, 'ADAPTER_PROCESS_ERROR', 'Unable to start or communicate with the adapter child. Details omitted.'));
    child.on('close', () => {
      if (settled) return;
      if (!reply) { finish('ADAPTER_ERROR', null, 'ADAPTER_CRASH', 'Adapter exited without a controlled IPC result.'); return; }
      if (reply.kind === 'error') { finish('ADAPTER_ERROR', null, reply.reasonCode ?? 'ADAPTER_ERROR', 'Adapter threw, rejected, or exceeded a result limit. Exception text and source are intentionally omitted; inspect the trusted local adapter.'); return; }
      if (reply.kind === 'unsupported') { finish('UNSUPPORTED', null, 'MISSING_ADAPTER_EXPORT', `Requested export ${functions[fixture.contract]} is missing. This contract was not evaluated.`); return; }
      const classified = classifyOutcome(fixture, reply.actual, reply.invalidShape);
      finish(classified.status, reply.actual ?? null, classified.reasonCode, classified.explanation);
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
  const runtime = await provenance(); runtime.adapterProcessTZ = options.tz ?? 'UTC';
  const report: Report = { schemaVersion: '1', packageVersion: PACKAGE_VERSION, createdAt: new Date().toISOString(), adapter: options.adapterLabel ?? options.adapterPath, provenance: runtime, summary: summarizeResults(results), results };
  await validateReport(report);
  return report;
}
