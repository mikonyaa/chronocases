import reportSchema from '../../resources/schemas/report.json';
import { validateReportSemantics, type ReportCorpus } from '../report/semantics.js';
import { checkJsonLimits, LIMITS, utf8ByteLength } from '../schemas/limits.js';
import { isOutcome } from '../comparison/index.js';
declare const CHRONOCASES_CORPUS: ReportCorpus;
import type { Report, CaseResult } from '../types.js';
type Schema = { type?: string | string[]; const?: unknown; enum?: unknown[]; required?: string[]; properties?: Record<string, Schema>; additionalProperties?: boolean; items?: Schema; maxItems?: number; maxLength?: number; pattern?: string; minimum?: number; maximum?: number; oneOf?: Schema[]; allOf?: Schema[]; if?: Schema; then?: Schema };
function schemaValid(value: unknown, schema: Schema): boolean {
  if ('const' in schema && value !== schema.const || schema.enum && !schema.enum.includes(value)) return false;
  if (schema.oneOf && schema.oneOf.filter(s => schemaValid(value, s)).length !== 1) return false;
  if (schema.allOf && !schema.allOf.every(s => schemaValid(value, s))) return false;
  if (schema.if && schemaValid(value, schema.if) && schema.then && !schemaValid(value, schema.then)) return false;
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some(type => type === 'null' ? value === null : type === 'array' ? Array.isArray(value) : type === 'integer' ? typeof value === 'number' && Number.isInteger(value) : type === 'object' ? !!value && typeof value === 'object' && !Array.isArray(value) : typeof value === type)) return false;
  }
  if (typeof value === 'string' && (schema.maxLength !== undefined && value.length > schema.maxLength || schema.pattern && !new RegExp(schema.pattern).test(value))) return false;
  if (typeof value === 'number' && (!Number.isFinite(value) || schema.minimum !== undefined && value < schema.minimum || schema.maximum !== undefined && value > schema.maximum)) return false;
  if (Array.isArray(value) && (schema.maxItems !== undefined && value.length > schema.maxItems || schema.items && !value.every(v => schemaValid(v, schema.items!)))) return false;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const data = value as Record<string, unknown>;
    if (schema.required?.some(k => !(k in data))) return false;
    if (schema.additionalProperties === false && Object.keys(data).some(k => !(k in (schema.properties ?? {})))) return false;
    if (schema.properties && !Object.entries(schema.properties).every(([k, s]) => !(k in data) || schemaValid(data[k], s))) return false;
  }
  return true;
}
function validReport(value: unknown): value is Report {
  checkJsonLimits(value);
  // This shipped draft-07 schema uses the subset interpreted above; it is not a user-supplied schema.
  if (!schemaValid(value, reportSchema as unknown as Schema)) return false;
  try { validateReportSemantics(value as Report, CHRONOCASES_CORPUS); return true; }
  catch { return false; }
}
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
function element<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.textContent = text; if (className) node.className = className; return node;
}
let initial: { report: Report; correctedReport: Report | null } | null = null;
let report: Report | null = null;
try {
  const text = $('chronocases-data').textContent ?? '';
  if (utf8ByteLength(text) > 2 * LIMITS.reportBytes) throw Error('Embedded reports exceed the byte limit');
  const payload: unknown = JSON.parse(text);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw Error('Invalid embedded payload');
  const data = payload as { report: unknown; correctedReport: unknown };
  if (!validReport(data.report) || data.correctedReport !== null && !validReport(data.correctedReport)) throw Error('Invalid embedded report semantics');
  initial = data as { report: Report; correctedReport: Report | null }; report = initial.report;
} catch { /* Controls are still installed below so a valid local report can recover the viewer. */ }
let selectedId = 'date-la-roundtrip';
function notice(text: string, error = false): void { $('notice').textContent = text; $('notice').className = `notice${error ? ' error' : ''}`; }
function showOutcome(outcome: unknown, label: string, contract: CaseResult['contract']): HTMLElement {
  const panel = element('article'); panel.append(element('span', label, 'label'));
  let main: string;
  if (outcome === null) main = 'Not evaluated';
  else if (!isOutcome(outcome, contract)) main = 'Invalid return shape';
  else if (outcome.status === 'value') main = typeof outcome.value === 'string' ? outcome.value : outcome.value.instant;
  else main = outcome.reasonCode;
  panel.append(element('div', main, `outcome-main${main.length > 16 ? ' compact' : ''}`));
  panel.append(element('pre', JSON.stringify(outcome, null, 2))); return panel;
}
function renderDetail(result: CaseResult | undefined): void {
  if (!report) return;
  const target = $('case-detail'); target.replaceChildren();
  if (!result) {
    const empty = element('div', '', 'empty'); empty.append(element('h2', report.results.length ? 'No matching cases' : 'No results in this report'), element('p', report.results.length ? 'Change the contract or search term.' : 'Open an executed ChronoCases report to inspect outcomes.'));
    if (report.results.length) { const reset = element('button', 'Clear filters'); reset.onclick = () => { $<HTMLInputElement>('search').value = ''; $<HTMLSelectElement>('contract').value = 'all'; render(); }; empty.append(reset); }
    target.append(empty); return;
  }
  const f = result.fixture;
  const heading = element('div', '', 'case-heading'); const headingText = element('div'); headingText.append(element('span', `${f.contract} / contract v${f.contractVersion}`, 'label'), element('h2', f.title), element('p', result.caseId, 'id'));
  heading.append(headingText, element('span', result.status === 'UNSUPPORTED' ? 'UNSUPPORTED' : result.status, `status ${result.status.toLowerCase()}`)); target.append(heading);
  const input = element('section', '', 'section'); input.append(element('h3', 'Exact input')); const dl = element('dl', '', 'input-grid');
  for (const [key, value] of Object.entries(f.input)) { const group = element('div'); group.append(element('dt', key), element('dd', String(value))); dl.append(group); } input.append(dl); target.append(input);
  const comparison = element('div', '', 'comparison'); comparison.append(showOutcome(result.expected, 'Expected · reviewed literal', result.contract), showOutcome(result.actual, 'Actual · adapter execution', result.contract)); target.append(comparison);
  const explanation = element('section', '', 'section'); explanation.append(element('h3', 'What the outcome means'), element('p', result.explanation, 'explanation')); target.append(explanation);
  const evidence = element('section', '', 'section'); evidence.append(element('h3', 'Oracle evidence'), element('p', f.oracle.calculation, 'explanation')); const line = element('ol', '', 'timeline');
  if (f.oracle.candidates.length) {
    for (const candidate of f.oracle.candidates) { const row = element('li'); row.append(element('span', candidate.nominalDate, 'nominal')); const points = element('div', '', 'instants'); for (const instant of candidate.instants) points.append(element('span', instant, 'point')); if (!candidate.instants.length) points.append(element('span', `Gap · forward projection ${candidate.forwardProjection ?? 'unsupported'}`, 'point')); row.append(points); line.append(row); }
  } else {
    for (const c of f.oracle.canaries.slice(0, 4)) { const row = element('li'); row.append(element('span', c.timeZone, 'nominal')); const points = element('div', '', 'instants'); points.append(element('span', `${c.instant} → ${c.localDateTime} ${c.offset}`, 'point')); row.append(points); line.append(row); }
  }
  evidence.append(line);
  for (const t of f.oracle.transitions) evidence.append(element('p', `${t.instant}  ${t.beforeOffset} → ${t.afterOffset}\n${t.note}`, 'transition'));
  if (f.oracle.dayBounds) evidence.append(element('p', `Local-day interval [${f.oracle.dayBounds.start}, ${f.oracle.dayBounds.end}) · ${f.oracle.dayBounds.hours} hours`, 'transition'));
  evidence.append(element('p', `Reviewed ${f.reviewedAt} · ${f.oracle.method}`, 'footnote'));
  const sources = element('div', '', 'sources'); f.sources.forEach((url, i) => { const source = element('a', `Source ${i + 1}`); if (url.startsWith('https://')) { source.href = url; source.rel = 'noreferrer'; } sources.append(source); }); evidence.append(sources); target.append(evidence);
  const reproduction = element('section', '', 'section'); reproduction.append(element('h3', 'Reproduce this case'));
  const copyRow = element('div', '', 'repro'); const command = element('textarea'); command.value = result.repro; command.readOnly = true; command.id = 'repro-command'; command.setAttribute('aria-label', 'Single-case reproduction command'); const copy = element('button', 'Copy command'); copy.id = 'copy-repro';
  copy.onclick = async () => { command.select(); let copied = false; try { await navigator.clipboard.writeText(result.repro); copied = true; } catch { try { copied = document.execCommand('copy'); } catch { /* Manual selection remains available. */ } } notice(copied ? 'Reproduction command copied.' : 'Command selected. Copy it with your keyboard.'); };
  copyRow.append(command, copy); reproduction.append(copyRow, element('p', 'Run locally with the installed package. The command pins the corpus hash and retains firstCandidateDate through the frozen case input.', 'footnote')); target.append(reproduction);
  if (result.logs.stdout || result.logs.stderr) { const logs = element('details', '', 'section'); logs.append(element('summary', `Adapter logs${result.logs.truncated ? ' (bounded / truncated)' : ''}`), element('pre', `stdout:\n${result.logs.stdout}\nstderr:\n${result.logs.stderr}`)); target.append(logs); }
}
function render(): void {
  if (!report) return;
  const summary = $('summary'); summary.replaceChildren();
  for (const [label, count, color] of [['PASS', report.summary.passed, 'pass'], ['FAIL', report.summary.failed, 'fail'], ['UNSUPPORTED', report.summary.unsupported, 'unsupported'], ['ERROR', report.summary.adapterErrors, 'adapter_error']] as const) { const group = element('span', '', color); group.append(element('span', String(count), 'count'), document.createTextNode(label)); summary.append(group); }
  summary.append(element('span', `${report.summary.selected} selected · ${report.summary.selectedContracts.join(' / ')} · exit ${report.summary.exitCode}`, 'meta'));
  const search = $<HTMLInputElement>('search').value.toLowerCase(); const contract = $<HTMLSelectElement>('contract').value;
  const visible = report.results.filter(r => (contract === 'all' || r.contract === contract) && `${r.caseId} ${r.fixture.title} ${r.fixture.tags.join(' ')}`.toLowerCase().includes(search));
  if (!visible.some(r => r.caseId === selectedId)) selectedId = visible[0]?.caseId ?? '';
  $('case-count').textContent = `(${visible.length})`;
  const list = $('case-list'); list.replaceChildren();
  for (const result of visible) { const row = element('li'); const button = element('button'); button.type = 'button'; button.setAttribute('aria-current', String(selectedId === result.caseId)); button.append(element('span', result.caseId, 'case-id')); const meta = element('span', '', 'case-meta'); meta.append(element('span', result.contract), element('span', result.status, result.status.toLowerCase())); button.append(meta); button.onclick = () => { selectedId = result.caseId; render(); }; row.append(button); list.append(row); }
  renderDetail(visible.find(r => r.caseId === selectedId));
  const p = report.provenance; $('provenance').textContent = `Executed adapter: ${report.adapter}\nNode ${p.node} · ${p.platform}/${p.arch} · ICU ${p.icu} · tzdata ${p.tzdata} · parent TZ ${p.processTZ} · adapter TZ ${p.adapterProcessTZ}\nCorpus ${p.corpusVersion} · SHA-256 ${p.corpusHash}\nTemporal ${p.temporal.implementation} ${p.temporal.version} · ${p.temporal.timezoneDatabase}`;
}
$<HTMLInputElement>('search').addEventListener('input', render); $<HTMLSelectElement>('contract').addEventListener('change', render);
$('open-report').onclick = () => $<HTMLInputElement>('report-file').click();
$<HTMLInputElement>('report-file').onchange = async () => {
  const file = $<HTMLInputElement>('report-file').files?.[0]; if (!file) return;
  try { if (file.size > LIMITS.reportBytes) throw Error('Report exceeds 5 MiB'); const data: unknown = JSON.parse(await file.text()); if (!validReport(data)) throw Error('Invalid report schema or inconsistent result semantics'); report = data; $<HTMLButtonElement>('download-report').disabled = false; $('demo-switch').hidden = true; $('live-demo').hidden = true; render(); notice('Local report opened. No data was uploaded.'); }
  catch (error) { notice(error instanceof SyntaxError ? 'Invalid JSON syntax' : error instanceof Error ? error.message : 'Invalid report', true); }
  finally { $<HTMLInputElement>('report-file').value = ''; }
};
$('download-report').onclick = () => { if (!report) return; const blob = new Blob([JSON.stringify(report, null, 2) + '\n'], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = element('a'); link.href = url; link.download = 'chronocases-report.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); notice('Report download prepared locally. It may include private inputs or adapter logs.'); };
if (initial?.correctedReport) {
  const demo = initial;
  $('demo-switch').hidden = false; $('live-demo').hidden = false;
  $('buggy-report').onclick = () => { report = demo.report; $('buggy-report').setAttribute('aria-pressed', 'true'); $('correct-report').setAttribute('aria-pressed', 'false'); render(); notice('Actual built-in buggy adapter report. Expected failures are intentional.'); };
  $('correct-report').onclick = () => { report = demo.correctedReport!; $('buggy-report').setAttribute('aria-pressed', 'false'); $('correct-report').setAttribute('aria-pressed', 'true'); render(); notice('Actual corrected adapter report. The skipped-date recurrence remains explicitly unsupported.'); };
  const dateDemo = (): void => { const date = $<HTMLInputElement>('selected-date').value; if (!date) return; const instant = new Date(`${date}T00:00:00Z`); const storedInstant = JSON.stringify({ instant: instant.toISOString() }); const restored = new Date((JSON.parse(storedInstant) as { instant: string }).instant); const fields = new Intl.DateTimeFormat('en', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(restored); const field = (key: string): string => fields.find(f => f.type === key)?.value ?? ''; const storedLabel = JSON.stringify({ selectedDate: date }); $('buggy-date').textContent = `${field('year')}-${field('month')}-${field('day')}`; $('correct-date').textContent = (JSON.parse(storedLabel) as { selectedDate: string }).selectedDate; $('buggy-date').setAttribute('data-serialized', storedInstant); };
  $<HTMLInputElement>('selected-date').oninput = dateDemo; dateDemo();
}
if (report) render();
else {
  $<HTMLButtonElement>('download-report').disabled = true;
  $('demo-switch').hidden = true; $('live-demo').hidden = true;
  const empty = element('div', '', 'empty');
  empty.append(element('h2', 'Unable to read embedded report'), element('p', 'This HTML contains corrupted or inconsistent report data. Use Open report to select a valid local JSON file, or regenerate the explorer with ChronoCases.'));
  $('case-detail').replaceChildren(empty); notice('Unable to read embedded report. Open a valid local JSON report to recover.', true);
}
