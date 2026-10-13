import { test, expect } from 'vitest';
import { readFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { runCases } from '../../dist/index.js';
import { payload } from '../fixtures/dollar-logs.mjs';

test('real child dollar logs survive JSON and both HTML template markers byte for byte', async () => {
  const report = await runCases({ adapterPath: 'tests/fixtures/dollar-logs.mjs', caseId: 'date-la-roundtrip' });
  expect(report.summary.exitCode).toBe(0);
  for (const stream of ['stdout', 'stderr'] as const) expect(Buffer.from(report.results[0]!.logs[stream])).toEqual(Buffer.from(payload));
  await mkdir('.artifacts/roundtrip', { recursive: true });
  const { writeReport } = await import('../../dist/report/index.js');
  await writeReport(report, '.artifacts/roundtrip');
  execFileSync(process.execPath, ['dist/cli.js', 'explorer', '--report', '.artifacts/roundtrip/report.json', '--out', '.artifacts/roundtrip/explorer.html', '--no-open']);
  const html = await readFile('.artifacts/roundtrip/explorer.html', 'utf8');
  const embedded = html.match(/<script id="chronocases-data" type="application\/json">([\s\S]*?)<\/script>/)![1]!;
  const data = JSON.parse(embedded);
  expect(data.report).toEqual(JSON.parse(await readFile('.artifacts/roundtrip/report.json', 'utf8')));
  expect(html).not.toContain('</script><img');
  expect(html).not.toContain('/*__SCRIPT__*/</script>');
});
