import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const verification = JSON.parse(await readFile('.artifacts/package-verification.json', 'utf8'));
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
await writeFile('.artifacts/ci-provenance.json', JSON.stringify({ sourceCommit, version: '0.1.0', buildOrigin: 'GitHub Actions', workflow: process.env.GITHUB_WORKFLOW, runId: process.env.GITHUB_RUN_ID, ciURL: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`, runtime: verification.runtime, packageSha256: verification.sha256, packageBytes: verification.bytes, corpusVersion: verification.runtime.corpusVersion, corpusHash: verification.corpusHash }, null, 2) + '\n');
