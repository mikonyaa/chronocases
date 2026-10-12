import { execFileSync } from 'node:child_process';
import { mkdir, chmod, access } from 'node:fs/promises';
import { build } from 'esbuild';
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc'], { stdio: 'inherit' });
await mkdir('resources', { recursive: true });
await chmod('dist/cli.js', 0o755);
try { await access('src/explorer/client.ts'); await build({ entryPoints: ['src/explorer/client.ts'], bundle: true, minify: true, outfile: 'resources/explorer.js', format: 'iife', target: 'es2022', legalComments: 'none' }); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
