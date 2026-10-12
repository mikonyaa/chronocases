#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile, mkdir, cp, writeFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { PACKAGE_ROOT, PACKAGE_VERSION, loadCases, loadCase, selectCases, validateReport } from './corpus/index.js';
import { provenance, checkEnvironment } from './provenance/index.js';
import { runCases } from './runner/index.js';
import { writeReport } from './report/index.js';
import { parseBoundedJson, LIMITS } from './schemas/limits.js';
import type { Report } from './types.js';
const help = `ChronoCases ${PACKAGE_VERSION} — three explicit time contracts\n\nUsage:\n  chronocases --help | --version\n  chronocases doctor [--json]\n  chronocases list [--contract recurrence] [--json]\n  chronocases explain CASE_ID [--json]\n  chronocases init --dir sample\n  chronocases run --adapter sample/adapter.mjs [--case CASE_ID | --contract CONTRACT]\n    [--tz UTC] [--timeout-ms 3000] [--corpus-hash HASH] [--out results] [--json] [--no-open]\n  chronocases demo --out demo-output [--json] [--no-open]\n  chronocases explorer --report results/report.json --out explorer.html [--no-open]\n\nExit codes: 0 pass; 1 business/shape failure; 2 operational/input error; 3 unsupported; 130 interrupt.\nAdapters are trusted local code, not sandboxed. Reports may contain private inputs and logs.\nThe explorer is offline HTML; this CLI never opens a browser automatically.\n`;
async function main(): Promise<void> {
  const { values, positionals } = parseArgs({ allowPositionals: true, strict: true, options: { help: { type: 'boolean' }, version: { type: 'boolean' }, json: { type: 'boolean' }, 'no-open': { type: 'boolean' }, adapter: { type: 'string' }, out: { type: 'string' }, case: { type: 'string' }, contract: { type: 'string' }, tz: { type: 'string' }, 'timeout-ms': { type: 'string' }, 'corpus-hash': { type: 'string' }, dir: { type: 'string' }, report: { type: 'string' } } });
  if (values.help || !positionals.length && !values.version) { console.log(help); return; }
  if (values.version) { console.log(PACKAGE_VERSION); return; }
  const command = positionals[0];
  if (positionals.length > (command === 'explain' ? 2 : 1)) throw new Error('Unexpected positional arguments');
  if (command === 'doctor') {
    const fixtures = await loadCases();
    const unsupported = fixtures.map(f => ({ caseId: f.caseId, issue: checkEnvironment(f) })).filter(r => r.issue);
    console.log(JSON.stringify({ schemaVersion: '1', provenance: await provenance(), unsupported }, null, values.json ? 0 : 2));
    process.exitCode = unsupported.length ? 3 : 0; return;
  }
  if (command === 'list') {
    const selected = selectCases(await loadCases(), values.contract ? { contract: values.contract } : {});
    console.log(values.json ? JSON.stringify(selected.map(f => ({ caseId: f.caseId, contract: f.contract, title: f.title }))) : selected.map(f => `${f.caseId.padEnd(40)} ${f.contract}  ${f.title}`).join('\n')); return;
  }
  if (command === 'explain') {
    if (!positionals[1]) throw new Error('explain requires a case ID');
    console.log(JSON.stringify(await loadCase(positionals[1]), null, values.json ? 0 : 2)); return;
  }
  if (command === 'init') {
    if (!values.dir) throw new Error('init requires --dir');
    const dir = resolve(values.dir);
    try { await stat(dir); throw new Error('init destination already exists; choose a new directory'); } catch (e) { if (!(e instanceof Error && 'code' in e && e.code === 'ENOENT')) throw e; }
    await mkdir(dir, { recursive: true });
    await cp(join(PACKAGE_ROOT, 'examples/correct/adapter.mjs'), join(dir, 'adapter.mjs'));
    await cp(join(PACKAGE_ROOT, 'examples/correct/product.mjs'), join(dir, 'product.mjs'));
    await cp(join(PACKAGE_ROOT, 'examples/buggy'), join(dir, 'buggy'), { recursive: true });
    await cp(join(PACKAGE_ROOT, 'examples/typescript'), join(dir, 'typescript'), { recursive: true });
    console.log(`Created portable examples in ${values.dir}. Replace the product calls with your own functions. Full corpus includes one declared unsupported recurrence transition (exit 3).`); return;
  }
  if (command === 'run') {
    if (!values.adapter) throw new Error('run requires --adapter');
    const abort = new AbortController(); const handler = (): void => abort.abort(); process.once('SIGINT', handler);
    try {
      const report = await runCases({ adapterPath: values.adapter, signal: abort.signal, ...(values.case ? { caseId: values.case } : {}), ...(values.contract ? { contract: values.contract } : {}), ...(values.tz ? { tz: values.tz } : {}), ...(values['timeout-ms'] ? { timeoutMs: Number(values['timeout-ms']) } : {}), ...(values['corpus-hash'] ? { corpusHash: values['corpus-hash'] } : {}) });
      await writeReport(report, values.out ?? 'results');
      console.log(values.json ? JSON.stringify({ schemaVersion: '1', packageVersion: PACKAGE_VERSION, corpusHash: report.provenance.corpusHash, ...report.summary }) : report.results.map(r => `${r.status.padEnd(13)} ${r.caseId}\n  expected: ${JSON.stringify(r.expected)}\n  actual:   ${JSON.stringify(r.actual)}\n  ${r.explanation}\n  ${r.repro}`).join('\n\n') + `\n\n${JSON.stringify(report.summary)}`);
      process.exitCode = report.summary.exitCode;
    } finally { process.removeListener('SIGINT', handler); }
    return;
  }
  if (command === 'demo') {
    const out = values.out ?? 'demo-output';
    const reports: Report[] = [];
    for (const example of ['buggy', 'correct']) {
      const report = await runCases({ adapterPath: join(PACKAGE_ROOT, `examples/${example}/adapter.mjs`), adapterLabel: `sample/${example === 'correct' ? '' : 'buggy/'}adapter.mjs` });
      await writeReport(report, join(out, example)); reports.push(report);
    }
    if (!reports[0] || !reports[1] || reports[0].summary.adapterErrors || reports[1].summary.failed || reports[1].summary.adapterErrors || reports[1].summary.passed !== 35 || !['date-la-roundtrip', 'la-before-midnight', 'ny-fold-earlier-after-first'].every(id => reports[0]!.results.some(r => r.caseId === id && r.status === 'FAIL'))) throw new Error('Demo adapters did not produce the required verified outcomes; inspect the written reports');
    console.log(JSON.stringify({ schemaVersion: '1', buggy: reports[0]?.summary, correct: reports[1]?.summary, note: 'Intentional buggy failures and a declared unsupported transition are preserved. demo exits 0 when both reports are written.' }));
    return;
  }
  if (command === 'explorer') {
    if (!values.report || !values.out) throw new Error('explorer requires --report and --out');
    if ((await stat(values.report)).size > LIMITS.reportBytes) throw new Error('Report size limit exceeded');
    const data = parseBoundedJson(await readFile(values.report, 'utf8'), LIMITS.reportBytes);
    await validateReport(data);
    const { generateExplorer } = await import('./explorer/index.js');
    await writeFile(values.out, await generateExplorer(data as import('./types.js').Report));
    console.log(`Wrote offline explorer: ${values.out}`); return;
  }
  throw new Error('Unknown command. Run chronocases --help');
}
main().catch(error => { console.error(`ChronoCases input/runtime error: ${error instanceof Error && !('code' in error) ? error.message : 'Unable to access a required local resource; inspect the supplied path.'}`); process.exitCode = 2; });
