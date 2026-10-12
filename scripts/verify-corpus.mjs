import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const manifest = JSON.parse(await readFile('oracle/corpus-integrity.json', 'utf8'));
const files = {}; const hash = createHash('sha256');
for (const contract of ['date-only', 'day-bucket', 'recurrence']) {
  for (const file of (await readdir(`cases/${contract}`)).filter(f => f.endsWith('.json')).sort()) {
    const raw = await readFile(`cases/${contract}/${file}`);
    const relative = `${contract}/${file}`;
    files[relative] = createHash('sha256').update(raw).digest('hex'); hash.update(`${relative}\0`).update(raw);
    const data = JSON.parse(raw); assert.equal(data.caseId, file.slice(0, -5)); assert.ok(data.oracle.calculation); assert.ok(data.reviewedAt); assert.ok(data.sources.length);
  }
}
assert.deepEqual(files, manifest.files, 'Frozen fixture bytes changed. Review the oracle explicitly before updating integrity metadata.');
assert.equal(Object.keys(files).length, manifest.caseCount);
assert.equal(hash.digest('hex'), manifest.corpusHash);
console.log(`Frozen corpus integrity verified: ${manifest.caseCount} cases, ${manifest.corpusHash}`);
