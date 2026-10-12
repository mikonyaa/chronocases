import { pathToFileURL } from 'node:url';
import { checkJsonLimits, LIMITS } from '../schemas/limits.js';
import { isOutcome } from '../comparison/index.js';
import type { Input, AdapterMetadata } from '../types.js';
interface Request { adapterPath: string; exportName: string; input: Input; metadata: AdapterMetadata }
function send(message: object): void {
  const sendIPC = process.send?.bind(process);
  if (!sendIPC) { process.exit(2); return; }
  // Drain queued writes before exiting; otherwise a giant console write could be silently lost.
  process.stdout.write('', () => process.stderr.write('', () => sendIPC(message, undefined, undefined, () => process.exit(0))));
}
process.once('message', async (message: Request) => {
  try {
    const adapter = await import(pathToFileURL(message.adapterPath).href) as Record<string, unknown>;
    const fn = adapter[message.exportName];
    if (typeof fn !== 'function') { send({ kind: 'unsupported', reasonCode: 'MISSING_ADAPTER_EXPORT' }); return; }
    const actual: unknown = await (fn as (input: Input, meta: AdapterMetadata) => unknown)(message.input, Object.freeze(message.metadata));
    const contract = message.exportName === 'dateOnlyRoundtrip' ? 'date-only' : message.exportName === 'instantToDayBucket' ? 'day-bucket' : 'recurrence';
    const invalidShape = !isOutcome(actual, contract);
    let serialized: string | undefined;
    try { serialized = JSON.stringify(actual); } catch { send({ kind: 'result', actual: null, invalidShape: true }); return; }
    if (serialized === undefined) { send({ kind: 'result', actual: null, invalidShape: true }); return; }
    if (Buffer.byteLength(serialized) > LIMITS.outcomeBytes) { send({ kind: 'error', reasonCode: 'ADAPTER_RESULT_LIMIT' }); return; }
    try { checkJsonLimits(actual); } catch { send({ kind: 'error', reasonCode: 'ADAPTER_RESULT_LIMIT' }); return; }
    send({ kind: 'result', actual: JSON.parse(serialized) as unknown, invalidShape });
  } catch { send({ kind: 'error', reasonCode: 'ADAPTER_THROW' }); }
});
