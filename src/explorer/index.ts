import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PACKAGE_ROOT } from '../corpus/index.js';
import type { Report } from '../types.js';
export async function generateExplorer(report: Report, correctedReport?: Report): Promise<string> {
  const template = await readFile(join(PACKAGE_ROOT, 'resources/explorer.html'), 'utf8');
  const script = await readFile(join(PACKAGE_ROOT, 'resources/explorer.js'), 'utf8');
  const data = JSON.stringify({ report, correctedReport: correctedReport ?? null }).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
  return template.replace('/*__DATA__*/', data).replace('/*__SCRIPT__*/', script.replaceAll('</script', '<\\/script'));
}
