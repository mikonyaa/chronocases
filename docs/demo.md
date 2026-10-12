# Reproduce the real demonstration

```sh
npm ci
npm run build
npm run build:site
npm run demo:capture
```

Capture uses a newly launched isolated Chrome context (Chromium in CI), opens the standalone generated HTML and interacts with the actual controls. It does not paint a green CI badge or synthesize screenshot pixels. The generated site's reports come from `chronocases demo`, executing both adapters through the same child-process interface used by consumers.

1. Select 2024-06-04. The live built-in browser example serializes the date as UTC midnight and formats the restored instant in Los Angeles, showing 2024-06-03. Its corrected JSON string save/read path shows 2024-06-04. The Node report beneath independently shows the real `date-la-roundtrip` FAIL with expected/actual.
2. Switch to the real correct-adapter report: 35 supported PASS, zero business failures and one explicitly uncovered Apia transition. June 4 remains June 4.
3. Select `ny-fold-earlier-after-first`. The correct report returns November 4 06:30Z. Select `ny-fold-later-after-first`: November 3 06:30Z, using the same cursor.

The public downloadable example includes `sample/adapter.mjs`, `sample/product.mjs`, the deliberately broken product and TypeScript source. Install the Release tgz in its parent directory before running these Node examples. The HTML works independently as an offline viewer and built-in picker. Private product reports must remain private unless explicitly intended for publication.
