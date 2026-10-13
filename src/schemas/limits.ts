export const LIMITS = { fixtureBytes: 262144, reportBytes: 5242880, cases: 1000, nesting: 20, stringLength: 65536, logBytes: 65536, outcomeBytes: 32768, timeoutMs: 3000 } as const;
export const utf8ByteLength = (text: string): number => new TextEncoder().encode(text).byteLength;
export function checkJsonLimits(value: unknown, depth = 0): void {
  if (depth > LIMITS.nesting) throw new Error('JSON nesting limit exceeded');
  if (typeof value === 'string' && value.length > LIMITS.stringLength) throw new Error('JSON string limit exceeded');
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length > 5000) throw new Error('JSON container limit exceeded');
    for (const [key, child] of entries) { if (key.length > 200) throw new Error('JSON key limit exceeded'); checkJsonLimits(child, depth + 1); }
  }
}
export function parseBoundedJson(text: string, maxBytes: number): unknown {
  if (utf8ByteLength(text) > maxBytes) throw new Error('JSON byte limit exceeded');
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error('Invalid JSON syntax'); }
  checkJsonLimits(parsed);
  return parsed;
}
