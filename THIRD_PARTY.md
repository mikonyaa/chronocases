# Third-party software and assets

ChronoCases source, corpus, CSS and demonstration media are original project assets under MIT. No third-party images, icon set, web font downloads or CDN scripts are included. The viewer refers to locally available Georgia, Trebuchet MS and Courier font families; font files are not redistributed.

Runtime dependencies are installed separately by npm with their original notices:

| Dependency | Pinned version | License |
| --- | --- | --- |
| @js-temporal/polyfill | 0.5.1 | ISC |
| ajv | 8.20.0 | MIT |
| jsbi (polyfill dependency) | See package-lock.json | Apache-2.0 |
| fast-uri (Ajv dependency) | 3.1.8 | BSD-3-Clause |
| fast-deep-equal, json-schema-traverse, require-from-string (Ajv dependencies) | See package-lock.json | MIT |

Development tools: TypeScript 5.9.3 (Apache-2.0), Vitest 5.0.4 (MIT), Playwright 1.64.0 (Apache-2.0), esbuild 0.28.2 (MIT), ESLint 10.12.0 (MIT), typescript-eslint 8.71.2 (MIT), @types/node 24.10.0 (MIT). Optional consumer-only Jest example verification uses Jest 30.5.2 (MIT). Lockfile resolution fixes direct and transitive build dependencies; `oracle/dependency-licenses.json` records the inspected installed package license inventory. These development tools are not imported by the consumer runtime.

Historical zone facts and transitions derive from [IANA tzdata](https://www.iana.org/time-zones), whose timezone database is public domain. [IANA theory](https://data.iana.org/time-zones/tzdb/theory.html) describes its scope and limitations. The independent Python checker uses the system zoneinfo/TZif data; no Python library is shipped as a JavaScript runtime dependency.

The [comparison note](docs/comparison.md) separately records upstream licenses for Playwright, fake-timers, Hypothesis and the Temporal proposal. Hypothesis and fake-timers are not vendored dependencies.
