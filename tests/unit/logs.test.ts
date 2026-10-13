import { test, expect } from 'vitest';
import { BoundedLogCollector } from '../../src/runner/logs.js';

test('UTF-8 decoders keep separate pending sequences on interleaved streams', () => {
  const collector = new BoundedLogCollector(100);
  const a = Buffer.from('Цена 💡 résumé\n'), b = Buffer.from('€ café\n');
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i < a.length) collector.append('stdout', a.subarray(i, i + 1));
    if (i < b.length) collector.append('stderr', b.subarray(i, i + 1));
  }
  expect(collector.bytesCaptured).toBe(a.length + b.length);
  expect(collector.finish()).toEqual({ stdout: a.toString(), stderr: b.toString(), truncated: false });
});

test.each([7, 8, 9])('raw cap boundary %i counts bytes before decoding', bytes => {
  const collector = new BoundedLogCollector(8);
  expect(collector.append('stdout', Buffer.alloc(bytes, 120))).toBe(bytes > 8);
  expect(collector.bytesCaptured).toBe(Math.min(bytes, 8));
  expect(collector.finish()).toEqual({ stdout: 'x'.repeat(Math.min(bytes, 8)), stderr: '', truncated: bytes > 8 });
});

test('shared cap preserves a bounded incomplete suffix and ignores an infinite late tail', () => {
  const collector = new BoundedLogCollector(5);
  collector.append('stdout', Buffer.from([0xe2]));
  collector.append('stderr', Buffer.from('café'));
  expect(collector.bytesCaptured).toBe(5);
  expect(collector.finish()).toEqual({ stdout: '\ufffd', stderr: 'caf\ufffd', truncated: true });
  for (let i = 0; i < 10000; i++) collector.append('stdout', Buffer.alloc(1000, 120));
  expect(collector.bytesCaptured).toBe(5);
  expect(collector.finish()).toEqual({ stdout: '\ufffd', stderr: 'caf\ufffd', truncated: true });
});

test('natural EOF flushes a partial codepoint exactly once', () => {
  const collector = new BoundedLogCollector(8);
  collector.append('stdout', Buffer.from([0xe2, 0x82]));
  expect(collector.finish()).toEqual({ stdout: '\ufffd', stderr: '', truncated: false });
  collector.append('stderr', Buffer.from('late'));
  expect(collector.finish()).toEqual({ stdout: '\ufffd', stderr: '', truncated: false });
});
