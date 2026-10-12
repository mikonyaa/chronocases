# Security and privacy

Adapters execute trusted local code with the user's Node permissions and environment. Child isolation, timeouts, log limits and a memory ceiling are not a security sandbox. Do not run unknown adapters. ChronoCases never downloads fixture-provided modules, evaluates JavaScript pasted into its viewer or terminates unrelated processes.

The runner transfers results through controlled IPC, separately bounds stdout/stderr, and omits unexpected exception text, environment dumps and private source from automatic error explanations. Logs deliberately written by your adapter remain in the local report and may contain secrets. Reports preserve exact inputs; they are not anonymized. Review them before publishing. The shipped public demo contains only project-owned fixtures/functions.

Fixture/report limits and schema validation apply before use. Viewer data is escaped when embedded and rendered with textContent, with no CDN, telemetry, uploads or backend. A restrictive CSP disables connections and external scripts. Clipboard fallback allows manual selection in offline contexts.

Use GitHub's private vulnerability reporting for this repository when enabled, or contact the maintainer through the contact options on [their profile](https://github.com/mikonyaa). Avoid posting credentials or sensitive report contents in public issues. Security changes are released in new versions; archives/tags are not silently replaced.
