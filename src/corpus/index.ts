import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { Ajv } from 'ajv';
import { CONTRACTS, type ChronoCase, type Contract } from '../types.js';
import { checkJsonLimits, LIMITS, parseBoundedJson } from '../schemas/limits.js';
export const PACKAGE_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const PACKAGE_VERSION = '0.1.0';
export const CORPUS_VERSION = '1.0.0';
let cached: ChronoCase[] | undefined;
let corpusHash = '';
export async function loadCases(): Promise<ChronoCase[]> {
  if (cached) return structuredClone(cached);
  const schema = JSON.parse(await readFile(join(PACKAGE_ROOT, 'resources/schemas/case.json'), 'utf8')) as object;
  const validate = new Ajv({ allErrors: true, strict: true }).compile(schema);
  const cases: ChronoCase[] = [];
  const hash = createHash('sha256');
  const identifiers = new Set<string>();
  for (const contract of CONTRACTS) {
    const dir = join(PACKAGE_ROOT, 'cases', contract);
    for (const name of (await readdir(dir)).filter(n => n.endsWith('.json')).sort()) {
      const path = join(dir, name);
      if ((await stat(path)).size > LIMITS.fixtureBytes) throw new Error('Fixture size limit exceeded');
      const raw = await readFile(path, 'utf8');
      const data = parseBoundedJson(raw, LIMITS.fixtureBytes);
      if (!validate(data)) throw new Error(`Invalid fixture structure: ${contract}/${name}`);
      const fixture = data as ChronoCase;
      if (fixture.contract !== contract || name !== `${fixture.caseId}.json` || identifiers.has(fixture.caseId)) throw new Error('Fixture identity mismatch');
      identifiers.add(fixture.caseId);
      cases.push(fixture);
      hash.update(`${contract}/${name}\0`).update(raw);
    }
  }
  if (!cases.length || cases.length > LIMITS.cases) throw new Error('Corpus case count limit exceeded');
  corpusHash = hash.digest('hex');
  const integrity = JSON.parse(await readFile(join(PACKAGE_ROOT, 'oracle/corpus-integrity.json'), 'utf8')) as { corpusHash: string; caseCount: number; corpusVersion: string };
  if (corpusHash !== integrity.corpusHash || cases.length !== integrity.caseCount || integrity.corpusVersion !== CORPUS_VERSION) throw new Error('Frozen corpus integrity mismatch. Review fixture and oracle changes explicitly; expected values were not updated by this run.');
  cached = cases;
  return structuredClone(cases);
}
export async function getCorpusHash(): Promise<string> { await loadCases(); return corpusHash; }
export async function loadCase(caseId: string): Promise<ChronoCase> {
  const cases = await loadCases();
  const found = cases.find(c => c.caseId === caseId);
  if (!found) throw new Error(`Unknown case ID. Available: ${cases.map(c => c.caseId).join(', ')}`);
  return found;
}
export function selectCases(cases: ChronoCase[], selection: { caseId?: string; contract?: string }): ChronoCase[] {
  if (selection.contract && !CONTRACTS.includes(selection.contract as Contract)) throw new Error(`Unknown contract. Available: ${CONTRACTS.join(', ')}`);
  const found = cases.filter(c => (!selection.caseId || c.caseId === selection.caseId) && (!selection.contract || c.contract === selection.contract));
  if (!found.length) throw new Error(`Empty selection. Available case IDs: ${cases.map(c => c.caseId).join(', ')}`);
  return found;
}
export async function validateReport(data: unknown): Promise<void> {
  checkJsonLimits(data);
  const schema = JSON.parse(await readFile(join(PACKAGE_ROOT, 'resources/schemas/report.json'), 'utf8')) as object;
  const validator = new Ajv({ strict: true }).compile(schema);
  if (!validator(data)) throw new Error('Invalid report structure');
  const report = data as import('../types.js').Report;
  const statusFields = { PASS: 'passed', FAIL: 'failed', ADAPTER_ERROR: 'adapterErrors', UNSUPPORTED: 'unsupported', INTERRUPTED: 'interrupted' } as const;
  if (report.summary.selected !== report.results.length || new Set(report.results.map(r => r.caseId)).size !== report.results.length || report.results.some(r => r.caseId !== r.fixture.caseId || r.contract !== r.fixture.contract || !isDeepStrictEqual(r.expected, r.fixture.expected)) || Object.entries(statusFields).some(([status, field]) => report.summary[field] !== report.results.filter(r => r.status === status).length)) throw new Error('Inconsistent report identities, expectations or counts');
}
