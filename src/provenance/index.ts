import { release } from 'node:os';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { Temporal } from '@js-temporal/polyfill';
import { CORPUS_VERSION, getCorpusHash } from '../corpus/index.js';
import type { ChronoCase, Canary, Provenance } from '../types.js';
export async function provenance(): Promise<Provenance> {
  let implementation = '@js-temporal/polyfill', version = 'unknown';
  try {
    const entry = createRequire(import.meta.url).resolve('@js-temporal/polyfill');
    const metadata = JSON.parse(await readFile(join(dirname(dirname(entry)), 'package.json'), 'utf8')) as { name?: string; version?: string };
    implementation = metadata.name ?? implementation; version = metadata.version ?? 'unknown';
  } catch { /* Runtime metadata remains explicitly unknown when unavailable. */ }
  return { node: process.version, platform: process.platform, osRelease: release(), arch: process.arch,
    icu: process.versions.icu ?? 'unknown', tzdata: process.versions.tz ?? 'unknown', processTZ: process.env.TZ ?? 'unset', adapterProcessTZ: 'not-run',
    defaultTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    supportedTimeZones: ['UTC', ...Intl.supportedValuesOf('timeZone')],
    temporal: { implementation, version, timezoneDatabase: 'runtime Intl/ICU; not bundled by the polyfill' },
    corpusVersion: CORPUS_VERSION, corpusHash: await getCorpusHash() };
}
export function checkCanary(canary: Canary): string | null {
  try {
    new Intl.DateTimeFormat('en', { timeZone: canary.timeZone }).format(0);
    const actual = Temporal.Instant.from(canary.instant).toZonedDateTimeISO(canary.timeZone);
    if (actual.offset !== canary.offset || actual.toPlainDateTime().toString({ smallestUnit: 'second' }) !== canary.localDateTime) return `UNSUPPORTED_ENVIRONMENT: ${canary.timeZone} at ${canary.instant}; required offset ${canary.offset}, runtime offset ${actual.offset}. Frozen expected is unchanged.`;
    return null;
  } catch { return `UNSUPPORTED_ENVIRONMENT: required IANA zone ${canary.timeZone} is unavailable.`; }
}
export function checkEnvironment(fixture: ChronoCase): string | null {
  for (const canary of fixture.oracle.canaries) { const issue = checkCanary(canary); if (issue) return issue; }
  return null;
}
