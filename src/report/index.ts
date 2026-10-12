import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Report } from '../types.js';
import { LIMITS } from '../schemas/limits.js';
export async function writeReport(report: Report, directory: string): Promise<void> {
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (Buffer.byteLength(json) > LIMITS.reportBytes) throw new Error('Report size limit exceeded');
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'report.json'), json);
  const text = [ `ChronoCases ${report.packageVersion}`, `Corpus ${report.provenance.corpusVersion} sha256:${report.provenance.corpusHash}`, `Selection: ${report.summary.selectedContracts.join(', ')} (${report.summary.selected} cases)`, ...report.results.map(r => `${r.status} ${r.caseId}\n  input: ${JSON.stringify(r.fixture.input)}\n  expected: ${JSON.stringify(r.expected)}\n  actual: ${JSON.stringify(r.actual)}\n  ${r.explanation}\n  repro: ${r.repro}`), `Summary: ${JSON.stringify(report.summary)}` ].join('\n\n');
  await writeFile(join(directory, 'report.txt'), `${text}\n`);
}
