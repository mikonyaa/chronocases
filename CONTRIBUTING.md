# Contributing

Run the validation commands in README before proposing a change. Use Node 22.13+ and full ICU; local browser tests use installed Chrome, or set CI=true and install Playwright Chromium. Python zoneinfo is a development-only independent oracle check.

A fixture contribution needs a distinct regression, stable ID, literal outcome, explicit invalid-input validity, primary IANA source, manual offset arithmetic, independent TZif cross-check, canaries and reviewedAt. Review the ledger and integrity diff explicitly. Never update expected to make a failing adapter green.

Keep scope to the three v1 contracts. Document changes to policies, unsupported transitions and provenance. Do not submit private inputs, logs, credentials or third-party source without permission. Released tags/assets are immutable; fixes need a new version. No universal DST or application-correctness claims follow from the passing corpus.
