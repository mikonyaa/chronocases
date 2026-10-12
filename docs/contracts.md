# Contracts v1

All calendar dates use ISO Gregorian canonical `YYYY-MM-DD`. The inclusive v1 range is 1900-01-01 through 2100-12-31. Instants require `YYYY-MM-DDTHH:mm:ss[.fraction](Z|±HH:mm)`, up to nine fractional digits; both written year and resolved UTC year must fit the range. Leap seconds, missing suffixes, impossible dates/times and invalid offsets are `INVALID_INSTANT`. Named zones are runtime-supported IANA identifiers or aliases (including UTC); fixed numeric offset identifiers are not accepted as timeZone. A missing required real fixture zone is an environment limitation before adapter invocation. A deliberate invalid identifier is an `INVALID_TIME_ZONE` business input.

## dateOnlyRoundtrip

Input: `{ date, storageTimeZone, displayTimeZone }`. Call the application's actual serialization/deserialization path and return `{ status: 'value', value: date }`. A calendar label has no instant. Zone changes do not change the label. An invalid Gregorian date must explicitly reject `INVALID_DATE`; normalization is not accepted. Out-of-range valid dates reject `OUT_OF_RANGE`.

The correct example validates the label, serializes JSON and reads its exact calendar string. The broken example actually stores `new Date(date + 'T00:00:00Z')`, serializes its instant and formats the restored instant in displayTimeZone. For June 4 in Los Angeles, that is June 3, 17:00. For an arbitrary black-box adapter, the runner describes UTC-midnight conversion only as a possible cause.

## instantToDayBucket

Input: `{ instant, timeZone }`. Return the calendar date containing that instant in the requested zone. Its conceptual bucket is the half-open interval `[start of local day, start of next local day)`. Duration is not fixed at 86,400,000 ms. The New York spring and autumn fixtures independently establish 23- and 25-hour day bounds. Midnight is included in the new day. Resolved local dates outside v1 reject `OUT_OF_RANGE`.

## nextOccurrence

Input: `{ timeZone, localTime, firstCandidateDate, horizonDays, strictlyAfter, gapPolicy, foldPolicy }`.

`localTime` is exact `HH:mm:ss`. `horizonDays` is an integer 1..370. Consider consecutive nominal dates in `[firstCandidateDate, firstCandidateDate + horizonDays)`, using calendar addition. The final included date must be in v1; an exclusive boundary of 2101-01-01 is allowed for a final included date of 2100-12-31. Invalid time, window and policy reject `INVALID_LOCAL_TIME`, `INVALID_WINDOW` and `INVALID_POLICY`. A selected occurrence whose UTC year lies outside v1 rejects OUT_OF_RANGE. No system today is consulted.

For each nominal date, determine the wall time's valid instants. Apply policy before comparing with `strictlyAfter`; equality is excluded.

| Situation | Policy | Selection / rejection |
| --- | --- | --- |
| One candidate | any valid policies | Candidate only if strictly after cursor |
| Gap, zero candidates | skip | Exclude the nominal date |
| Gap | shift-by-gap | Shift by the actual offset jump, preserving minutes/seconds; use the resulting instant if future |
| Gap | reject | If the forward shift-by-gap projection is future, reject `NONEXISTENT_LOCAL_TIME`; otherwise exclude the past date |
| Fold, two candidates | earlier | Choose the first instant; if passed, exclude the date without swapping to later |
| Fold | later | Choose the second instant; if passed, exclude the date |
| Fold | reject | If either candidate is future, reject `AMBIGUOUS_LOCAL_TIME`; if both are ≤ cursor, exclude the past date |

On the first selected future occurrence, return:

```json
{"status":"value","value":{"nominalDate":"2024-03-10","resolvedLocalDateTime":"2024-03-10T03:30:00","instant":"2024-03-10T07:30:00Z","offset":"-04:00","appliedPolicy":"gap:shift-by-gap"}}
```

Other policy values are `exact`, `fold:earlier` and `fold:later`. No `both` policy exists. Exhaustion returns `{ status: 'no-occurrence', reasonCode: 'NO_OCCURRENCE_IN_WINDOW' }`; it does not claim the schedule never fires.

Before evaluating any result, preflight the entire window. V1 supports ordinary daily transitions: day lengths 22..26 hours, at most one transition inside a local day, offset jumps at most two hours, strictly increasing earlier/later projected instants across consecutive dates. Full civil-date skips/repeats and transitions violating those conditions reject `UNSUPPORTED_RECURRENCE_TRANSITION`. This is explicitly uncovered in CLI summaries, including a matching negative self-test. Date-only and day-bucket contracts can still use such zones. These are chosen ChronoCases semantics, not universal scheduling-product policies.
