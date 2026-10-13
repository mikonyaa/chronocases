import { execFileSync } from 'node:child_process';
import { mkdir, chmod, access } from 'node:fs/promises';
import { build } from 'esbuild';
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc'], { stdio: 'inherit' });
await mkdir('resources', { recursive: true });
await chmod('dist/cli.js', 0o755);
const { loadCases, getCorpusHash, CORPUS_VERSION } = await import('../dist/corpus/index.js');
const cases = (await loadCases()).map(({ caseId, contract, contractVersion, inputValidity, input, expected }) => ({ caseId, contract, contractVersion, inputValidity, input, expected }));
const reportCorpus = { corpusVersion: CORPUS_VERSION, corpusHash: await getCorpusHash(), cases };
try { await access('src/explorer/client.ts'); await build({ entryPoints: ['src/explorer/client.ts'], bundle: true, minify: true, outfile: 'resources/explorer.js', format: 'iife', target: 'es2022', legalComments: 'none', define: { CHRONOCASES_CORPUS: JSON.stringify(reportCorpus) } }); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
