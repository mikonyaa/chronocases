import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { generateExplorer } from '../dist/explorer/index.js';
await mkdir('.artifacts', { recursive: true });
execFileSync(process.execPath, ['dist/cli.js', 'demo', '--out', '.artifacts/site-demo', '--json', '--no-open'], { stdio: 'inherit' });
const buggy = JSON.parse(await readFile('.artifacts/site-demo/buggy/report.json', 'utf8'));
const correct = JSON.parse(await readFile('.artifacts/site-demo/correct/report.json', 'utf8'));
await rm('site', { recursive: true, force: true });
await mkdir('site', { recursive: true });
await writeFile('site/index.html', await generateExplorer(buggy, correct));
await writeFile('site/explorer.html', await generateExplorer(buggy, correct));
await writeFile('site/correct.html', await generateExplorer(correct));
await writeFile('site/.nojekyll', '');
await writeFile('site/buggy-report.json', JSON.stringify(buggy, null, 2) + '\n');
await writeFile('site/correct-report.json', JSON.stringify(correct, null, 2) + '\n');
try { await cp('docs/media', 'site/media', { recursive: true }); } catch (error) { if (error.code !== 'ENOENT') throw error; }
console.log('Built offline explorer from two real Node adapter runs.');
