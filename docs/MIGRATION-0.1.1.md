# 0.1.1-rc.1 migration

This is a local release candidate, not a published release. The public ESM exports, adapter metadata, report schema version, 36 corpus files and hash, Python oracle, date algorithms, recurrence policies and exit precedence are unchanged. Valid reports produced by v0.1.0 remain readable, including FAIL, original-invalid-shape previews, UNSUPPORTED and empty imported selections.

Imported reports must now match the installed frozen input/expected literals and coherent status/actual/reason/summary/exit semantics. Unknown IDs, conflicting corpus identities, altered inputs/expected, contradictory PASS or aggregate values and unexplained truncation are rejected with CLI exit 2 before writing HTML. Install the original corpus version for a report using a different corpus. Hand-edited display annotations remain permitted. This validation does not authenticate authorship or prove adapter execution.

UTF-8 log bytes split across child stream chunks are decoded with state. The combined 64 KiB budget counts raw bytes. A partial suffix at EOF/termination/limit flushes to U+FFFD once; limit truncation remains explicit. Later pipe events cannot grow or mutate a completed report.

No consumer action is needed for normalized JS adapters or compiled TypeScript adapters. Vitest/Jest examples remain optional consumer test tools. The packaged logging fixtures and local booking consumer are reproducible integration examples, with no dependency on an external product or secrets.

Before publishing, execute the [external validation runbook](EXTERNAL-VALIDATION.md) on the exact proposed commit. Local macOS checks do not certify new Linux CI lanes or a third party production adapter. Previously successful remote checks apply only to their historical SHA.
