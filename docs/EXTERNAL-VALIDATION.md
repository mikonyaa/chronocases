# Candidate validation runbook

No credentials or production access are needed for these checks. Run only trusted local adapters. Replace `CANDIDATE_SHA` and the tarball path with the reviewed candidate identity and record `git rev-parse HEAD`, `process.versions`, OS, browser version and oracle output in the evidence.

On Linux, check out CANDIDATE_SHA and run these commands for Node 22, 24 and 26:

```sh
npm ci
npm run typecheck
npm run lint
npm run build
npm run test:unit
npm run test:integration
npm run verify:corpus
npx --no-install playwright install --with-deps chromium
CI=1 npm run test:ui
npm run test:package -- --frameworks
```

Repeat the package gate with both `TZ` and `CHRONOCASES_TEST_TZ` set to UTC, Europe/London and America/New_York. Use `--tgz /absolute/path/chronocases-0.1.1-rc.1.tgz` after `--frameworks` to test the same archive bytes across lanes. Copy `.artifacts/package-verification.json` to a separate file after each lane; it contains runtime ICU/tzdata provenance and independently installed consumer results. Do not recompute or overwrite `oracle/corpus-integrity.json` to make a mismatch pass. The polyfill dependency version does not pin Intl's timezone database.

For a fresh consumer independent of the checkout:

```sh
mkdir chronocases-pilot
cd chronocases-pilot
npm init -y
npm install /absolute/path/chronocases-0.1.1-rc.1.tgz --ignore-scripts
cp -R node_modules/chronocases/examples/pilot .
cp -R node_modules/chronocases/examples/logging .
./node_modules/.bin/chronocases run --adapter pilot/adapter.mjs --case date-la-roundtrip --tz UTC --out pilot-report --json --no-open
./node_modules/.bin/chronocases run --adapter logging/bytewise-logs.mjs --case date-la-roundtrip --tz UTC --out log-report --json --no-open
./node_modules/.bin/chronocases explorer --report log-report/report.json --out log-explorer.html --no-open
```

The bytewise fixture prints all four dollar forms, both template markers, Цена 💡 résumé, separators and hostile HTML to stdout and stderr. Offline HTML must show it as exact text, with no pageerrors, injected nodes/flags or external requests. The gate automates these checks and verifies downloaded JSON. Negative importer regressions independently corrupt status, actual, summary, exit, IDs, input, expected and corpus provenance; CLI must exit 2 without creating HTML. Unit/integration tests cover raw cap−1/cap/cap+1, partial codepoints, timeout/cancel and late tails.

For an external production pilot, select the product's exact intended cases and write a trusted adapter calling its own business functions. Independently document its date range, gap/fold policies and finite search window. Compile TypeScript before using the CLI. Record full actual reports and any unsupported environment canaries. Keep secrets, private logs and data out of shared artifacts. Mark this phase unverified until a real product owner has executed it and supplied evidence; these local examples do not establish adoption or production suitability.
