# ChronoCases implementation and release gates

1. Freeze the v1 contracts and literal cases. Independently check Gregorian validity, Python zoneinfo candidates, offsets and manual UTC arithmetic; retain tool versions and evidence.
2. Implement the adapter API and isolated Node runner. Execute correct and deliberately broken product functions before building the viewer.
3. Validate operational failures, canaries, boundaries, security limits and a standalone, accessible explorer. Capture the working date picker and actual reports in a clean browser context.
4. Build the final package, install its exact bytes in a consumer outside this checkout and run JS/TS integration, init, demo and single-case reproduction.
5. After local gate A, create only this public repository. Verify CI at source commit S, download its checked package artifact, publish an immutable v0.1.0 release and project Pages. Repeat the documented flow from an anonymous asset download.

Isolation: only this directory, this chat's work/output directories and child processes created by ChronoCases. No changes to other sessions, projects, browser profiles, global Git or timezone settings. Local validation uses at most two concurrent workers.

Design: a compact editorial lab notebook: ink, paper, vermilion; serif headings, monospaced evidence, a horizontal local/UTC offset diagram. Purpose: compare a literal expected outcome with an executed adapter result and copy a real reproduction command. DFII: impact 4 + fit 5 + feasibility 5 + performance 5 - consistency risk 4 = 15. No external fonts, assets or telemetry; locally available Georgia and Courier families keep the HTML offline.
