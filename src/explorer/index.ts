import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PACKAGE_ROOT, validateReport } from '../corpus/index.js';
import type { Report } from '../types.js';
export async function generateExplorer(report: Report, correctedReport?: Report): Promise<string> {
  await validateReport(report);
  if (correctedReport) await validateReport(correctedReport);
  const template = await readFile(join(PACKAGE_ROOT, 'resources/explorer.html'), 'utf8');
  const script = await readFile(join(PACKAGE_ROOT, 'resources/explorer.js'), 'utf8');
  const data = JSON.stringify({ report, correctedReport: correctedReport ?? null }).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
  // A single callback pass never interprets dollar syntax or reprocesses markers in logs.
  const safeScript = script.replace(/<\/script/gi, match => `<\\/${match.slice(2)}`);
  return template.replace(/\/\*__(DATA|SCRIPT)__\*\//g, (_marker, kind: string) => kind === 'DATA' ? data : safeScript);
}
