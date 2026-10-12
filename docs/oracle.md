# Maintaining the oracle

The committed 36 case files contain literal expected outcomes, inputValidity, stable IDs, contract/schema versions, rationale, source URLs, a manual calculation, independent offset canaries, transition/candidate evidence and reviewedAt. Nine date-only, eleven day-bucket and sixteen recurrence cases intentionally vary semantics rather than duplicating one transition for a count.

Expected is not generated during normal tests. `npm run verify:corpus` checks exact fixture-byte SHA-256 against `oracle/corpus-integrity.json`, then runs `oracle/cross-check.py`. The Python checker reads system TZif files through `zoneinfo`, independently derives candidates via fold-aware round trips, verifies literal results against the chosen policies, and separately checks `UTC = local − offset`, transition boundaries and 23/25-hour day intervals. It never imports Temporal, JavaScript product functions or a runtime expected-generator, and never writes fixtures.

The [ledger](../oracle/ledger.md) records the actual review tools and a row for every frozen case. Reference examples use `@js-temporal/polyfill` 0.5.1. Its [source](https://github.com/js-temporal/temporal-polyfill/blob/v0.5.1/lib/ecmascript.ts) uses Intl formatters for zone/offset queries. Pinning the polyfill does not pin ICU or tzdata. Runtime provenance reads `process.versions.tz`; unavailable data is `unknown`, never inferred from release dates.

Fixture canaries belong to the oracle, not the adapter. Before a case executes, the runner checks zone availability and required offsets/local datetimes against the runtime. Canary mismatch is unsupported environment and cannot silently rewrite literals. `bucket-invalid-zone` intentionally carries no canary for its bogus identifier and tests the application's documented rejection instead.

To change the oracle:

1. State the contract/version change or the factual reason for correction.
2. Record a primary IANA source and the actual independent TZif version/tool. Derive the expected literal using wall time minus offset, including both fold candidates or the real gap duration.
3. Check cursor ordering, nominal-date window and unsupported preflight. Record reviewedAt and evidence before changing the literal.
4. Review the case and ledger diff, update the integrity manifest explicitly, and run independent cross-check plus correct and broken adapters.
5. Publish a new version for changed code or released bytes. Do not move an existing tag or replace a released archive silently.

Stable IDs do not depend on array position. A new case needs a distinct regression reason. UTC schedules and UTC buckets can be correct products. A failure alone does not establish a black-box function's implementation. ChronoCases does not claim exhaustive tzdata coverage, external peer review or observed user adoption.
