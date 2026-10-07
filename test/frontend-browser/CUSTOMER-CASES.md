# Customer/case acceptance boundary

Candidate coverage added 2026-10-07, based on `73255d90826e4934b1f0f489d3ed836e076096ed`.
This document describes new tests and separately records what was actually run.

## Four new Chromium scenarios

`customer-cases.spec.js` runs against a separate disposable instance of the
existing private browser fixture for every test. It uses the compiled application,
real Node HTTP, SQLite and private original-file storage. It never intercepts or
fulfills product requests and never navigates to production. Customer labels,
case materials, contacts and passwords are public synthetic fixtures.

1. Create two customers through the UI; search literal `%`/`_` and Unicode names.
   Create two cases under one customer, explicitly review facts, upload a linked
   original, resolve a question, confirm document details, generate a deterministic
   English final, and save a separately edited draft. Stop the real server process
   and restart with the same SQLite/assets/configuration. Verify the old RAM session
   is rejected, sign in afresh, reopen both cases and document versions, and compare
   downloaded text/original bytes. Verify ordinary-user and system-owner UI/API
   isolation, including rejected foreign rename and deletion attempts.
2. Open the same case in two actual tabs. Save one, reject the stale tab's write
   with a real 409, preserve the local title/source, explicitly read and reconcile
   both source texts, save against the latest version, then reload/reopen.
3. Rename one customer in two tabs. Preserve the rejected local name, block retry
   until explicit latest-version load, show the canonical name after Cancel,
   return keyboard focus, and require another explicit save to commit a new name.
4. Disable the browser context's real network connection before a save. Verify
   visible failure and retained input, restore connectivity, confirm the server
   version is unchanged, cancel a case switch, explicitly retry once, then reload.
   Cancel and accept a new-conversation action with unsent text; verify nothing is
   silently submitted or represented as a saved message.

### Conversation limit

Live AI remains disabled and the Send control remains disabled. Three **empty**
conversations are prepared through the ordinary authenticated API, not through a
database seed or mocked endpoint. The test verifies persisted conversation IDs,
case association and UI selection after restart. It deliberately asserts there
are no rendered message articles. This is **not** evidence of UI-created chat,
streamed replies, assistant-message persistence, interruption during a stream,
image understanding, source-message confirmation or paid-provider acceptance.

### Restart limit

`restart()` is a private Node test-harness method, not an HTTP/debug endpoint. It
terminates the actual server, retains its existing SQLite/assets paths and
synthetic credentials, starts a new process, and waits for its own readiness.
Sessions are intentionally not restored; the browser must sign in again. No
remember-me survival, deployment rollback, host/container restart, backup restore,
or production durability is claimed. Normal fixture cleanup still deletes the
temporary database/assets after the test.

## Local verification actually run

- New `customer-cases-fixture.check.mjs`: passed against real HTTP/SQLite/files,
  including server restart, session invalidation, fresh sign-in, exact original
  bytes, two cases, resolved question, confirmed context, two artifact versions,
  three empty conversations, stale case/customer conflicts and role isolation
- Existing product/email/format fixture checks: passed; email transport remains
  explicitly simulated, while PDF/CSV/XLSX/XLS parsing uses actual parsers
- `npm run check`: passed
- `npm test`: 311/311 passed
- `npm run test:frontend`: 223/223 passed; this aggregate includes development DOM
  tests and does not establish Chromium behavior
- `npm run build`: passed with the existing greater-than-500-kB bundle warning
- Playwright `--list`: 17 tests in six files, including these four new scenarios
- Chromium execution: **not run here**, because standalone browser execution is
  unavailable in this executor. No attempt to bypass that restriction was made

The new browser tests have not earned a pass until the authorized CI runner tests
the exact candidate commit and its individual results are reviewed. A successful
HTTP fixture check or test discovery must never be called a browser pass.

## Reproduce

After the pinned dependency installation and production frontend build:

```sh
node test/frontend-browser/customer-cases-fixture.check.mjs
npm run test:browser:frontend -- --list
```

In a separately authorized environment with the pinned Chromium available:

```sh
NESTLET_BROWSER_ENTRY_PATH=/ npm run test:browser:frontend -- customer-cases.spec.js
NESTLET_BROWSER_ENTRY_PATH=/ npm run test:browser:frontend
```

The normal browser workflow discovers the new `.spec.js` automatically. Run the
standalone customer fixture check explicitly as well when reviewing fixture
lifecycle changes. Screenshots and traces produced by a future run contain only
these synthetic records.

Still separate: live extraction/chat/vision and actual streaming cancellation;
genuine email delivery; customer-facing accessibility/device acceptance; all
three final-document kinds and native print; stale-final regeneration; production
deployment/private preflight. These tests add no UI/backend product code.
