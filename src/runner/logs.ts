import { StringDecoder } from 'node:string_decoder';
import type { CaseResult } from '../types.js';

type Stream = 'stdout' | 'stderr';
export class BoundedLogCollector {
  private readonly decoders = { stdout: new StringDecoder('utf8'), stderr: new StringDecoder('utf8') };
  private readonly logs: CaseResult['logs'] = { stdout: '', stderr: '', truncated: false };
  private captured = 0;
  private sealed = false;
  constructor(private readonly byteLimit: number) {}
  get bytesCaptured(): number { return this.captured; }

  /** Returns true only when a raw chunk exceeds the shared capture budget. */
  append(stream: Stream, chunk: Buffer): boolean {
    if (this.sealed) return false;
    const retained = Math.min(chunk.length, this.byteLimit - this.captured);
    this.captured += retained;
    this.logs[stream] += this.decoders[stream].write(chunk.subarray(0, retained));
    if (chunk.length > retained) { this.logs.truncated = true; return true; }
    return false;
  }

  /** Flush once at EOF, timeout, cancellation or limit; later chunks retain no data. */
  finish(): CaseResult['logs'] {
    if (!this.sealed) {
      this.sealed = true;
      for (const stream of ['stdout', 'stderr'] as const) this.logs[stream] += this.decoders[stream].end();
    }
    return this.logs;
  }
}
