import { evaluateOutcome, stable } from '../comparison/index.js';
import { CONTRACTS, type CaseResult, type ChronoCase, type Report, type Summary } from '../types.js';

export interface ReportCorpus {
  corpusVersion: string;
  corpusHash: string;
  cases: Pick<ChronoCase, 'caseId' | 'contract' | 'contractVersion' | 'inputValidity' | 'input' | 'expected'>[];
}

/** Classification shared by execution and import. Expected remains a frozen literal. */
export function classifyOutcome(fixture: ChronoCase, actual: unknown, originalInvalidShape = false): Pick<CaseResult, 'status' | 'reasonCode' | 'explanation'> {
  if (originalInvalidShape) return { status: 'FAIL', reasonCode: 'INVALID_RETURN_SHAPE', explanation: 'INVALID_RETURN_SHAPE: the original adapter return did not match the normalized interface before IPC encoding. Return canonical strings and exact fields; JSON serialization cannot repair an object value or extra undefined fields. The actual preview is its bounded JSON encoding.' };
  const comparison = evaluateOutcome(fixture, actual);
  if (comparison.validShape && actual && typeof actual === 'object' && (actual as Record<string, unknown>).reasonCode === 'UNSUPPORTED_RECURRENCE_TRANSITION') {
    return { status: 'UNSUPPORTED', reasonCode: 'UNSUPPORTED_RECURRENCE_TRANSITION', explanation: `${comparison.passed ? 'Matches the declared unsupported-transition negative self-test. ' : 'Adapter declined this transition. '}No occurrence computation is covered for this case.` };
  }
  return { status: comparison.passed ? 'PASS' : 'FAIL', reasonCode: comparison.validShape ? null : 'INVALID_RETURN_SHAPE', explanation: comparison.explanation };
}

export function summarizeResults(results: readonly Pick<CaseResult, 'status' | 'contract'>[]): Summary {
  const count = (status: CaseResult['status']): number => results.filter(r => r.status === status).length;
  const passed = count('PASS'), failed = count('FAIL'), adapterErrors = count('ADAPTER_ERROR'), unsupported = count('UNSUPPORTED'), interrupted = count('INTERRUPTED');
  return { selectedContracts: CONTRACTS.filter(c => results.some(r => r.contract === c)), selected: results.length, passed, failed, adapterErrors, unsupported, interrupted, exitCode: interrupted ? 130 : adapterErrors ? 2 : unsupported ? 3 : failed ? 1 : 0 };
}

const operationalCodes = ['ADAPTER_TIMEOUT', 'ADAPTER_LOG_LIMIT', 'ADAPTER_PROCESS_ERROR', 'ADAPTER_CRASH', 'ADAPTER_THROW', 'ADAPTER_RESULT_LIMIT', 'ADAPTER_ERROR'];
function invalid(detail: string): never { throw Error(`Inconsistent report: ${detail}`); }

/** Pure semantic check after schema/JSON limits; never mutates or reruns the adapter. */
export function validateReportSemantics(report: Report, corpus: ReportCorpus): void {
  if (report.provenance.corpusVersion !== corpus.corpusVersion || report.provenance.corpusHash !== corpus.corpusHash) invalid('frozen corpus version/hash mismatch');
  const fixtures = new Map(corpus.cases.map(f => [f.caseId, f]));
  const seen = new Set<string>();
  for (const result of report.results) {
    const literal = fixtures.get(result.caseId), f = result.fixture;
    if (!literal || seen.has(result.caseId)) invalid('unknown or duplicate case ID');
    seen.add(result.caseId);
    if (result.caseId !== f.caseId || result.contract !== f.contract || result.contract !== literal.contract || f.contractVersion !== literal.contractVersion || f.inputValidity !== literal.inputValidity) invalid(`case identity/contract: ${result.caseId}`);
    if (stable(result.expected) !== stable(literal.expected) || stable(f.expected) !== stable(literal.expected) || stable(f.input) !== stable(literal.input)) invalid(`frozen input/expected: ${result.caseId}`);
    if (result.logs.truncated !== (result.reasonCode === 'ADAPTER_LOG_LIMIT')) invalid(`log truncation: ${result.caseId}`);
    if (result.status === 'ADAPTER_ERROR') {
      if (result.actual !== null || !operationalCodes.includes(result.reasonCode ?? '')) invalid(`operational result: ${result.caseId}`);
    } else if (result.status === 'INTERRUPTED') {
      if (result.actual !== null || result.reasonCode !== 'INTERRUPTED') invalid(`interrupted result: ${result.caseId}`);
    } else if (result.status === 'UNSUPPORTED' && ['UNSUPPORTED_ENVIRONMENT', 'MISSING_ADAPTER_EXPORT'].includes(result.reasonCode ?? '')) {
      if (result.actual !== null) invalid(`unevaluated unsupported result: ${result.caseId}`);
    } else {
      // v0.1.0 preserves an original invalid return as a bounded JSON preview. That
      // preview may look valid after serialization; the explicit shape flag wins.
      const classified = classifyOutcome(f, result.actual, result.status === 'FAIL' && result.reasonCode === 'INVALID_RETURN_SHAPE');
      if (result.status !== classified.status || result.reasonCode !== classified.reasonCode) invalid(`status/actual/reasonCode: ${result.caseId}`);
    }
  }
  if (stable(report.summary) !== stable(summarizeResults(report.results))) invalid('selected contracts, aggregate counts or exit priority');
}
