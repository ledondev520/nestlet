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

A successful HTTP fixture check or test discovery must never be called a browser
pass. The local-only evidence above is distinct from the official run below.

## First official Chromium confirmation, 2026-10-07 15:24 UTC

[Browser run 37643281521](https://github.com/ledondev520/nestlet/actions/runs/37643281521)
passed all **17/17** scenarios at the root product entry, including these four new
tests. Downloaded JUnit independently confirms 17 tests and zero failures, errors
or skips; the customer suite contains four passed tests. Reviewed the two-case
directory, restored resolved question/edited draft, and reconciled-source
screenshots. This is actual Chromium evidence from GitHub Actions, not local
browser execution.

- PR head: `dbdfcbb44bdfaf4f612ecebe93fe3332bd8a42dc`
- Actual PR checkout: `37bc10b2f51e1c8de7664ea8a12d00dfb097b857`
- Parents: base `73255d90826e4934b1f0f489d3ed836e076096ed` and that PR head
- Verified identical checkout/head tree: `cbc0b25b60a61adf9fa8e82f11be6ae59582cbe8`
- Browser artifact ID: `11492749318`, retained for seven days by the workflow
- [Checks](https://github.com/ledondev520/nestlet/actions/runs/37643281438) and
  [container smoke](https://github.com/ledondev520/nestlet/actions/runs/37643281466)
  also passed for the same head

This pass belongs to that exact tree. Integration of subsequent main changes,
including official-guidance main `6b357266ff5548785479d08c5d219dafa6b277a2`, requires
fresh exact-head CI. No subsequent pass is inferred here. The conversation,
provider, mail and deployment limits above remain unchanged.

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

The normal browser workflow runs the standalone customer fixture check and
discovers the new `.spec.js` automatically. Run that fixture check locally as
well when reviewing lifecycle changes. Screenshots and traces contain only these
synthetic records.

Still separate: live extraction/chat/vision and actual streaming cancellation;
genuine email delivery; customer-facing accessibility/device acceptance; all
three final-document kinds and native print; stale-final regeneration; production
deployment/private preflight. These tests add no UI/backend product code.

## Main integration checkpoint, 2026-10-07 15:33 UTC

Integrated official-guidance main `6b357266ff5548785479d08c5d219dafa6b277a2`
without conflicts, preserving both validation sections. Combined local checks
passed: syntax/build, backend 312/312, frontend 224/224, explicitly simulated
email contracts 53/53, real HTTP/DOM artifact lifecycle 1/1, and the product,
email, formats and customer fixture checks. Discovery remains 17 browser tests.
The workflow now runs the customer fixture check and accurately distinguishes
isolated Node restart coverage from untested production host/container recovery.
YAML comparison verified that triggers, permissions, environment and all existing
gates are unchanged. The integrated head still needs its own official CI result;
the earlier exact-tree pass above does not certify this new combination.
