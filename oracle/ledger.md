# Oracle review ledger

Reviewed 2026-10-12. **36 literal cases**, corpus 1.0.0: nine date-only, eleven day-bucket and sixteen recurrence. Review was performed by the implementation author with separate independent tools; no external human review or user-study claim is made.

The reference uses @js-temporal/polyfill 0.5.1 and runtime Intl/ICU. It does not generate the oracle. Development-only cross-check: CPython 3.13.7 zoneinfo, macOS 26.7.1 TZif **2026d**, plus zdump. The tested Node 26.9.0 runtime uses ICU 78.3 / tzdata **2026a**. Required historical offsets agree despite different database versions. Versions are read from actual process/system metadata, not inferred.

Frozen aggregate SHA-256: `a552268ca7a26fd1ca4fefcb73e68028647f4f9e8c444ef72654a2735c0df28c`. [Integrity manifest](corpus-integrity.json), [machine-readable review evidence](review-evidence.json), [read-only independent checker](cross-check.py). Normal tests only read these files.

## Primary source and arithmetic review

Fetched the official IANA 2026a northamerica, asia, australasia and etcetera source files via HTTPS and recorded their byte hashes in review-evidence.json. Each case links the relevant regional file. The independent checker uses separate system TZif data rather than these JavaScript algorithms. Gregorian validation is cross-checked with CPython date and ISO PlainDate semantics.

- New York: US rules from 2007 use March Sunday on/after the 8th and November Sunday on/after the 1st, at 02:00. In 2024 these are March 10 and November 3. Standard −05:00 plus 1-hour summer save gives −04:00. Spring 02:00 − (−05:00) = 07:00Z; autumn 02:00 − (−04:00) = 06:00Z.
- Lord Howe: standard +10:30 plus 00:30 summer save. October first Sunday in 2024 is October 6. 02:00 − 10:30 = October 5 15:30Z; 02:15 shifted 30 minutes becomes 02:45 − 11:00 = 15:45Z. April fold 01:45 maps to 14:45Z at +11 and 15:15Z at +10:30; the extra unit test checks both.
- Apia: transition at 2011-12-30T10:00:00Z changes −10:00 to +14:00 and skips December 30. The recurrence window is unsupported before any selection. The same zone still supports date-only labels and instant-to-day mapping.
- Kathmandu +05:45, Kolkata +05:30, Kiritimati +14:00 and Honolulu −10:00 are verified through regional IANA source plus independent TZif canaries.

Observed independent transition output:

```text
America/New_York     Sun Mar 10 06:59:59 2024 UT = Sun Mar 10 01:59:59 2024 EST isdst=0 gmtoff=-18000
America/New_York     Sun Mar 10 07:00:00 2024 UT = Sun Mar 10 03:00:00 2024 EDT isdst=1 gmtoff=-14400
America/New_York     Sun Nov  3 05:59:59 2024 UT = Sun Nov  3 01:59:59 2024 EDT isdst=1 gmtoff=-14400
America/New_York     Sun Nov  3 06:00:00 2024 UT = Sun Nov  3 01:00:00 2024 EST isdst=0 gmtoff=-18000
Australia/Lord_Howe  Sat Apr  6 14:59:59 2024 UT = Sun Apr  7 01:59:59 2024 +11 isdst=1 gmtoff=39600
Australia/Lord_Howe  Sat Apr  6 15:00:00 2024 UT = Sun Apr  7 01:30:00 2024 +1030 isdst=0 gmtoff=37800
Australia/Lord_Howe  Sat Oct  5 15:29:59 2024 UT = Sun Oct  6 01:59:59 2024 +1030 isdst=0 gmtoff=37800
Australia/Lord_Howe  Sat Oct  5 15:30:00 2024 UT = Sun Oct  6 02:30:00 2024 +11 isdst=1 gmtoff=39600
```

## Per-case literal review

| Case / contract | Literal expected | Independent calculation / policy decision |
| --- | --- | --- |
| [`date-apia-skipped-civil-date`](../cases/date-only/date-apia-skipped-civil-date.json) / date-only | `2011-12-30` | Gregorian 2011-12-30 is valid; no timezone mapping is part of date-only storage. |
| [`date-century-leap`](../cases/date-only/date-century-leap.json) / date-only | `2000-02-29` | 2000 mod 400 = 0; Feb 29 is valid. |
| [`date-invalid-century`](../cases/date-only/date-invalid-century.json) / date-only | `INVALID_DATE` | 1900 mod 100 = 0 and 1900 mod 400 != 0; February has 28 days. |
| [`date-invalid-nonleap`](../cases/date-only/date-invalid-nonleap.json) / date-only | `INVALID_DATE` | 2023 mod 4 != 0; February has 28 days. |
| [`date-kiritimati-year-edge`](../cases/date-only/date-kiritimati-year-edge.json) / date-only | `2023-12-31` | The label 2023-12-31 is preserved independently of +14:00. |
| [`date-la-roundtrip`](../cases/date-only/date-la-roundtrip.json) / date-only | `2024-06-04` | 2024-06-04T00:00:00Z − 07:00 = 2024-06-03T17:00:00 locally; correct date-only storage has no instant. |
| [`date-leap-day`](../cases/date-only/date-leap-day.json) / date-only | `2024-02-29` | 2024 mod 4 = 0, 2024 mod 100 != 0; Feb 29 is valid. |
| [`date-max-range`](../cases/date-only/date-max-range.json) / date-only | `2100-12-31` | 1900 <= year <= 2100. |
| [`date-min-range`](../cases/date-only/date-min-range.json) / date-only | `1900-01-01` | 1900 <= year <= 2100. |
| [`bucket-invalid-zone`](../cases/day-bucket/bucket-invalid-zone.json) / day-bucket | `INVALID_TIME_ZONE` | Not/A_Zone is a deliberate invalid identifier, not a missing real IANA environment dependency. |
| [`honolulu-previous-year`](../cases/day-bucket/honolulu-previous-year.json) / day-bucket | `2023-12-31` | UTC Jan 1 05:00 − 10:00 = Dec 31 19:00. |
| [`instant-missing-offset`](../cases/day-bucket/instant-missing-offset.json) / day-bucket | `INVALID_INSTANT` | No Z or numeric offset means the input does not identify one instant. |
| [`kathmandu-quarter-hour`](../cases/day-bucket/kathmandu-quarter-hour.json) / day-bucket | `2024-06-04` | UTC June 3 18:15 + 05:45 = June 4 00:00. |
| [`kiritimati-new-year`](../cases/day-bucket/kiritimati-new-year.json) / day-bucket | `2024-01-01` | UTC Dec 31 10:00 + 14:00 = Jan 1 00:00. |
| [`kolkata-half-hour`](../cases/day-bucket/kolkata-half-hour.json) / day-bucket | `2024-06-04` | UTC June 3 18:30 + 05:30 = June 4 00:00. |
| [`la-at-midnight`](../cases/day-bucket/la-at-midnight.json) / day-bucket | `2024-06-04` | UTC 07:00:00 − 07:00 = June 4, 00:00:00. |
| [`la-before-midnight`](../cases/day-bucket/la-before-midnight.json) / day-bucket | `2024-06-03` | UTC 06:59:59 − 07:00 = June 3, 23:59:59. |
| [`ny-23-hour-day`](../cases/day-bucket/ny-23-hour-day.json) / day-bucket | `2024-03-10` | UTC March 11 03:59:59 − 04:00 = March 10 23:59:59; day bounds 05:00Z to next 04:00Z. |
| [`ny-25-hour-day`](../cases/day-bucket/ny-25-hour-day.json) / day-bucket | `2024-11-03` | UTC Nov 4 04:59:59 − 05:00 = Nov 3 23:59:59; day bounds 04:00Z to next 05:00Z. |
| [`offset-input-utc-leap-boundary`](../cases/day-bucket/offset-input-utc-leap-boundary.json) / day-bucket | `2024-02-29` | March 1 00:15 − 05:45 = Feb 29 18:30Z. A true UTC bucket is valid. |
| [`apia-skipped-date-unsupported`](../cases/recurrence/apia-skipped-date-unsupported.json) / recurrence | `UNSUPPORTED_RECURRENCE_TRANSITION` | Apia jumps from −10:00 to +14:00, skipping Dec 30. Preflight declines the whole window; no computed occurrence is claimed. |
| [`lord-howe-gap-shift`](../cases/recurrence/lord-howe-gap-shift.json) / recurrence | `2024-10-05T15:45:00Z / 2024-10-06 / gap:shift-by-gap` | 02:15 + 00:30 gap = 02:45; UTC = Oct 6 02:45 − 11:00 = Oct 5 15:45Z. |
| [`ny-fold-earlier-after-first`](../cases/recurrence/ny-fold-earlier-after-first.json) / recurrence | `2024-11-04T06:30:00Z / 2024-11-04 / exact` | Earlier 05:30Z <= 05:45Z. Do not substitute 06:30Z. Next nominal day: 01:30 − (−05:00) = 06:30Z. |
| [`ny-fold-earlier`](../cases/recurrence/ny-fold-earlier.json) / recurrence | `2024-11-03T05:30:00Z / 2024-11-03 / fold:earlier` | 01:30 − (−04:00) = 05:30Z; earlier selects this candidate. |
| [`ny-fold-later-after-first`](../cases/recurrence/ny-fold-later-after-first.json) / recurrence | `2024-11-03T06:30:00Z / 2024-11-03 / fold:later` | Later 06:30Z > 05:45Z; retain November 3. |
| [`ny-fold-later`](../cases/recurrence/ny-fold-later.json) / recurrence | `2024-11-03T06:30:00Z / 2024-11-03 / fold:later` | 01:30 − (−05:00) = 06:30Z; later selects this candidate. |
| [`ny-fold-reject-after-both`](../cases/recurrence/ny-fold-reject-after-both.json) / recurrence | `2024-11-04T06:30:00Z / 2024-11-04 / exact` | Both 05:30Z and 06:30Z are earlier than cursor 06:45Z. Next day is 01:30 − (−05:00) = 06:30Z. |
| [`ny-fold-reject-before`](../cases/recurrence/ny-fold-reject-before.json) / recurrence | `AMBIGUOUS_LOCAL_TIME` | Candidates 05:30Z and 06:30Z are future; reject the nominal date. |
| [`ny-gap-reject-after-projection`](../cases/recurrence/ny-gap-reject-after-projection.json) / recurrence | `2024-03-11T06:30:00Z / 2024-03-11 / exact` | Forward projection 07:30Z is earlier than cursor 07:45Z and is skipped. Next date: 02:30 − (−04:00) = 06:30Z. |
| [`ny-gap-reject`](../cases/recurrence/ny-gap-reject.json) / recurrence | `NONEXISTENT_LOCAL_TIME` | Forward projection 07:30Z > cursor 00:00Z, so reject when reaching March 10. |
| [`ny-gap-shift`](../cases/recurrence/ny-gap-shift.json) / recurrence | `2024-03-10T07:30:00Z / 2024-03-10 / gap:shift-by-gap` | 02:30 + 01:00 gap = 03:30; UTC = 03:30 − (−04:00) = 07:30Z. |
| [`ny-gap-skip`](../cases/recurrence/ny-gap-skip.json) / recurrence | `2024-03-11T06:30:00Z / 2024-03-11 / exact` | March 10 has zero candidates. March 11 02:30 − (−04:00) = 06:30Z. |
| [`ny-strict-equality`](../cases/recurrence/ny-strict-equality.json) / recurrence | `2024-11-05T06:30:00Z / 2024-11-05 / exact` | November 4 06:30Z equals the cursor, so advance one calendar date. |
| [`recurrence-window-out-of-range`](../cases/recurrence/recurrence-window-out-of-range.json) / recurrence | `OUT_OF_RANGE` | The included second nominal date would be 2101-01-01, outside v1. Reject before searching. |
| [`utc-ordinary-daily`](../cases/recurrence/utc-ordinary-daily.json) / recurrence | `2024-06-04T09:00:00Z / 2024-06-04 / exact` | UTC 09:00 − 00:00 = 09:00Z > 08:00Z. No transition or projection.  |
| [`utc-window-empty`](../cases/recurrence/utc-window-empty.json) / recurrence | `NO_OCCURRENCE_IN_WINDOW` | The only candidate equals the cursor; the one-date window is exhausted. |

## Checks and outcomes

Run `npm run verify:corpus`. The independent checker validates every literal, canary, candidate set, forward projection, transition boundary and recorded day interval, using manual wall-time minus offset arithmetic as an additional identity check. Expected values remain unchanged.

Correct adapter: 35 supported PASS and one declared unsupported-transition self-test. Broken examples: actual UTC-midnight date mutation, actual UTC day-bucket mutation and actual fixed-24-hour recurrence execute via the public interface and fail their historical cases. A matching unsupported status remains uncovered. Cursor-after-projection and cursor-after-both-fold-candidates cases use strictly later cursor instants; equality behavior is separately checked in unit tests.

To update this oracle, follow [the explicit review process](../docs/oracle.md); never regenerate expected to match actual.

Additional unit review on 2026-10-13: Sao Paulo 2018-11-04 has an ordinary midnight gap. 00:30 forward-projects to 01:30−02:00 = 03:30Z; its backward projection is the previous civil date, which does not invalidate the increasing nominal-date search order. Independently checked with CPython zoneinfo; source: https://data.iana.org/time-zones/tzdb-2026a/southamerica. The 370-day UTC window test checks the maximum documented horizon without generating new frozen expected values.
