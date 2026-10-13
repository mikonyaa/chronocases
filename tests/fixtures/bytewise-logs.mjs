import { payload } from './dollar-logs.mjs';
import { setTimeout } from 'node:timers/promises';

async function writeBytes(stream) {
  for (const byte of Buffer.from(payload)) {
    stream.write(Buffer.from([byte]));
    await setTimeout(2);
  }
}

export async function dateOnlyRoundtrip(input) {
  await Promise.all([writeBytes(process.stdout), writeBytes(process.stderr)]);
  return { status: 'value', value: input.date };
}
