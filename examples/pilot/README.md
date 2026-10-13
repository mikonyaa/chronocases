# Local booking consumer

This is a separate small product policy, implemented without ChronoCases reference algorithms. It validates real calendar dates, accepts booking years 2020–2030 and writes/reads a JSON booking date. The date stays a label in every process timezone. The adapter only implements date-only; the other exports are intentionally unsupported.

After installing the candidate tarball in a new directory, copy this folder out of `node_modules/chronocases/examples/pilot` and run:

```sh
./node_modules/.bin/chronocases run --adapter pilot/adapter.mjs --case date-la-roundtrip --tz Europe/London --out pilot-report --json --no-open
./node_modules/.bin/chronocases explorer --report pilot-report/report.json --out pilot.html --no-open
```

The package gate executes actual disk persistence, checks literal valid/invalid booking dates and the 2020–2030 product policy, and asserts missing day-bucket exports yield UNSUPPORTED. This consumer is local integration evidence. A production pilot and external adoption remain unverified. It does not claim the complete frozen corpus matches this product's narrower date range.
