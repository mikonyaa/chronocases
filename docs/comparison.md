# Existing tools and when ChronoCases helps

Technical baseline checked 2026-10-12. These tools already handle valuable time testing; ChronoCases does not claim they cannot test DST.

| Tool | Verified capability | License | Relationship |
| --- | --- | --- | --- |
| [Playwright Clock](https://playwright.dev/docs/clock) | Fixed/controlled browser time, timers and advancement; clock installation ordering is documented | [Apache-2.0](https://github.com/microsoft/playwright/blob/main/LICENSE) | Use for time-dependent browser behavior; ChronoCases supplies explicit portable business outcomes to a Node function |
| [Sinon fake-timers](https://github.com/sinonjs/fake-timers) | Mature Date/timer control, synchronous/asynchronous ticks and restore/uninstall | [BSD-3-Clause](https://github.com/sinonjs/fake-timers/blob/main/LICENSE) | Keep it for scheduler/timer control; corpus cases establish selected calendar semantics |
| [Hypothesis strategies](https://hypothesis.readthedocs.io/en/latest/reference/strategies.html) | Timezone-aware dates, imaginary/ambiguous wall times, fold and transition-adjacent generation | [MPL-2.0 with noted exceptions](https://github.com/HypothesisWorks/hypothesis/blob/master/LICENSE.txt) | Property-based generation finds/shrinks many cases; this project ships fixed reviewed literals for three JS contracts |
| [Temporal](https://tc39.es/proposal-temporal/docs/) | Distinct PlainDate, Instant and ZonedDateTime types and explicit timezone disambiguation | [Ecma BSD-style software license](https://github.com/tc39/proposal-temporal/blob/main/LICENSE); [polyfill ISC](https://github.com/js-temporal/temporal-polyfill/blob/v0.5.1/LICENSE) | Provides correct building blocks used by the reference examples; an independently reviewed oracle remains necessary |

A normal unit test is sufficient when you already have one known regression, an independently derived expected value, clear timezone/policy semantics and an existing test harness. ChronoCases helps reuse a reviewed corpus, exercise a function outside its development loader, see runtime provenance and copy one failure's complete reproduction. It neither replaces these tools nor proves an application universally correct.

No claimed time savings, external tester study, product deployments or adoption metrics were measured. Baseline libraries are referenced rather than vendored as product code, except the licensed installed Temporal polyfill dependency.
