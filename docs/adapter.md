# Adapter interface

Use an explicit trusted local `.mjs` or `.js` file. TypeScript must be compiled first. No URL imports are loaded by the runner. Exports can be synchronous or asynchronous:

```ts
import type { ChronoAdapter } from 'chronocases';
const adapter: ChronoAdapter = {
  dateOnlyRoundtrip: async (input, metadata) => ({ status: 'value', value: input.date }),
  // Call real product functions for each selected contract.
};
```

Metadata is exactly `{ caseId, contractVersion: '1' }`, frozen in the child. It excludes expected, rationale, canaries and source URLs. The CLI independently validates fixture structure before execution while allowing documented invalid semantic inputs to reach your function. See the packaged JSON Schemas at `chronocases/schemas/case.json` and `chronocases/schemas/report.json`.

Normalized outcomes have exactly two top-level keys: `status` plus `value` or `reasonCode`. Values are canonical strings for date-only/day-bucket and the exact occurrence object in [contracts](contracts.md) for recurrence. The same instants must use canonical UTC `Z` representation in a returned occurrence. Extra keys or locale strings fail return-shape comparison. Shape is checked before IPC encoding: rich date objects or extra undefined fields cannot become PASS through JSON normalization. An invalid result's actual preview is its bounded JSON encoding, or null when it cannot be encoded. No free-form exception message is compared with expected.

Documented rejection codes: `INVALID_DATE`, `INVALID_INSTANT`, `INVALID_TIME_ZONE`, `INVALID_LOCAL_TIME`, `INVALID_WINDOW`, `INVALID_POLICY`, `OUT_OF_RANGE`, `AMBIGUOUS_LOCAL_TIME`, `NONEXISTENT_LOCAL_TIME`, `UNSUPPORTED_RECURRENCE_TRANSITION`. The no-result recurrence reason is `NO_OCCURRENCE_IN_WINDOW`. Translate known application errors explicitly; let unexpected throw/rejection remain operational errors.

Each CLI case runs in a fresh Node process. Child `TZ` defaults to UTC and is configurable with `--tz`; the parent and other tests are unchanged. A timeout defaults to 3000 ms, with `--timeout-ms` accepting integers 50..60000. Combined stdout/stderr is bounded to 64 KiB per case and saved separately. Outcome JSON is bounded to 32 KiB. Runner-owned child memory uses a 128 MiB V8 old-space limit. Logs are drained before successful child exit so large writes cannot silently bypass the output limit.

Operational codes include `ADAPTER_THROW`, `ADAPTER_CRASH`, `ADAPTER_PROCESS_ERROR`, `ADAPTER_TIMEOUT`, `ADAPTER_LOG_LIMIT`, `ADAPTER_RESULT_LIMIT`. Missing selected exports are `MISSING_ADAPTER_EXPORT`, an unsupported result. Unexpected error details are omitted from automatic reports. The runner is process isolation, not a sandbox: trusted adapters inherit local access/environment and could intentionally start other processes. ChronoCases only terminates the children it created.

Reports use schema version 1 and include every selected case's literal input, outcome, explanation, repro, logs and provenance. CLI summary `--json` has stable field names. Selection typos, empty intersections and hash mismatches exit 2; they never become empty PASS. Exit priority and privacy guidance are in the [README](../README.md).

## Test frameworks

The `loadCase` / `evaluateOutcome` helpers run in the host test process and do not provide the full CLI's timeout/isolation. Use them when your framework owns lifecycle and application setup.

Vitest example: copy `examples/vitest/date-only.test.ts` into your test tree, preserving or adapting the relative product adapter import, then run your ordinary Vitest command. A complete packaged demonstration is tested with `vitest@5.0.4`.

Jest example is ESM and tested with `jest@30.5.2`. With Jest installed in your application:

```sh
node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand
```

Configure `testMatch` to include the copied `.test.mjs` example and `transform: {}` for this JavaScript example. `npm run test:package -- --frameworks` installs both tools into a separate consumer and executes the shipped examples. They are optional development tools, not package runtime dependencies.

`chronocases init --dir sample` copies JS product paths, the broken product and compiled-TS source/config from installed resources. It refuses an existing destination rather than overwriting your files. TypeScript types are exported from `chronocases`, and reference functions from `chronocases/reference`.
