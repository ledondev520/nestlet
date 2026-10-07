# React action observability (v1)

Implementation candidate, 2026-10-07. This module adds a bounded client for the existing [workflow telemetry contract](telemetry-api.md). It does not change the event allowlist, HTTP contract, SQLite schema, retention, ownership or authorization. Shared React integration is a separate reviewed change; the module alone is not evidence that the running UI emits these events.

## What is measured

- A real completed/cancelled action uses one of the existing twelve fixed names: `input.paste`, `input.file`, `input.mapping`, `review.confirm`, `draft.generate`, `draft.edit`, `export.copy`, `export.download`, `export.print`, `case.open`, `case.save`, `case.delete`
- `clientActiveMs` is visible, active-step dwell accumulated only after that feature explicitly calls `activateStep(event)`, excluding hidden-tab time and the observed operation's wait. It is collected on the next matching real action, not on step activation or page navigation. It does not establish continuous interaction, CPU work, or a performance stall
- `clientWaitMs` is wall-clock elapsed time from `beginAction` to `finish`/abort, capped at five minutes. For the shared JSON API, finish belongs after body parsing and the abort check. It includes network and parsing wait; it is not backend processing time
- `outcome` and the fixed client error code describe the observed action. A matching backend `requestId` can reveal the authoritative backend result separately
- A request ID is included only when this observer supplied the current workflow, the returned workflow matches, `X-Telemetry-Status` is `active`, and the ID is a UUID. Cold first requests may precede workflow creation: business work is never delayed and those responses remain uncorrelated. A foreign or independently created returned workflow is never adopted. An explicitly rejected tracking context or a returned workflow that differs from the supplied one drops the action observation, avoiding attribution to an unrelated prior case

Neither navigation nor `activateStep` fabricates an action success. An action that finishes after navigation/workspace/account replacement is dropped. Thus counts are incomplete operational observations, not a complete clickstream, usage denominator, audit trail, abandonment count or user productivity metric.

## Explicit coverage gaps

There are no generic page-visit/dwell events, request-start events, slow-pending notifications, event-loop/CPU stall measurements, new customer/auth/settings events, or chat/extraction client action aliases in v1. Server `request.chat`, extraction, parser and case timing remain separate existing observations. The SQL event-name CHECK constraint requires a separately reviewed migration before new event names can be accepted on existing databases. Long dwell must not be described as a stall.

The module supports all twelve existing actions, but each feature must wire a real action before it is covered. The current minimal integration can automatically cover only exact parser uploads and case mutations; its tests do not establish paste/mapping/review/draft/export UI coverage. Private asset storage at `/api/assets`, artifact download, and streaming chat are deliberately not guessed from generic routes. Browser unload flushing is best effort and may be lost.

## Single owner per action

Use the API observer for exactly one parser/case request, or a feature-owned action around one user operation. Do not instrument both layers for the same event. Example: choosing a workbook, saving its original and parsing it should have one chosen `input.file` owner, not three file-action successes. `input.paste`/`draft.edit` should be coalesced at meaningful action boundaries, never emitted on every keystroke.

The exported `classifyJourneyRequest(path, method)` classifies only fixed route shapes and returns a fixed action name or `null`. It does not retain path/query values. GET `/api/cases/:uuid` maps to the legacy `case.open` name for an explicitly initiated load; callers must suppress background refreshes or classify them separately in a future contract. Do not count that route mapping as proof of a human click. Auth, settings, customers, assets, lists, chat, extraction, workflow and unknown routes return `null`.

## Integration protocol

The session owner constructs one instance for its lifetime:

```js
const journey = createJourneyTelemetry({ getSession: () => statusRef.current });
// In the session lifecycle effect, before refresh:
journey.connect();
// Effect cleanup:
// return () => journey.dispose();
```

Construction has no DOM or network side effects. `connect()` is idempotent and can restart a disposed observer with fresh identity/epoch, so React StrictMode effect replay does not leak listeners or leave the observer disabled. After assigning `statusRef.current`, call `journey.syncIdentity()`. Expose `journey` with `api` in session context. Immediately before explicit logout, call `journey.reset()`; it discards queued/pending metadata even if the logout request fails. A new verified identity/CSRF token enables a fresh observer. `dispose()` detaches lifecycle listeners and drops in-flight metadata. Never await telemetry to decide business success or trigger account-expiry callbacks from telemetry itself.

AccountWorkspace uses a parent layout effect before child request effects:

```js
useLayoutEffect(() => {
  journey.setScope({ workspaceKey, caseId });
  journey.visit(view);
}, [journey, workspaceKey, caseId, view]);
```

An unrelated workspace/case change must happen before its requests. First-save association (`null` to saved case ID in the same workspace) preserves the workflow. Workspace keys and case IDs are existing UUIDs used only for in-memory scoping and the existing case-binding endpoint. `visit` accepts only the five fixed application view names; it is a lifetime guard, not an emitted page event.

Minimal JSON API integration, after validating the business request and upload:

```js
const event = telemetry === false ? null : classifyJourneyRequest(path, method);
const observation = event ? journey?.beginAction(event, { signal }) : null;
// Merge observation?.headers into the outgoing business headers.
// Preserve requestCsrf, credentials, cache, body and all existing guards.
try {
  // Existing fetch, JSON parse and abort checks, without awaiting telemetry.
  observation?.finish({ ok: response.ok, httpStatus: response.status, headers: response.headers });
  // Existing business success/error handling stays authoritative.
} catch (error) {
  observation?.finish({ ok: false, cancelled: error.name === 'AbortError' });
  throw error;
}
```

`finish` is idempotent. It reads only three response headers: `X-Workflow-Id`, `X-Request-Id`, `X-Telemetry-Status`. It does not accept a response body, request body, filename, form value, raw exception or arbitrary metadata. Known client errors may be supplied using `errorCode`; unknown text becomes `UNKNOWN_CLIENT_ERROR`. For feature-owned actions, activate only the matching visible step and deactivate it on inactivity; call `finish` after the real action, with a fixed failure code if appropriate.

If the API wrapper provides automatic observation, an explicit `telemetry: false` option must suppress it for background reads and already feature-owned operations. If a feature manually observes an async action that uses `api`, pass that opt-out to avoid duplicate events.

## Bounds and failure behavior

- Current-tab memory only; no localStorage, sessionStorage, cookies, external analytics SDK, or extra tracking identifier
- No customer name, query, dynamic route, filename/path, prompt, document text, draft, image, credentials, error message, stack or arbitrary metadata is placed in event payloads
- Maximum 20 queued events and 20 simultaneous action observers, at most 10 events per batch, 50 admitted events and 10 workflow starts per rolling minute. Existing server limits remain authoritative, including across tabs
- Queue entries expire after 30 seconds. Known-offline events are dropped; there is no durable offline queue, online replay listener or retry loop
- Each dedicated telemetry HTTP call has a three-second abort deadline, including workflow JSON consumption. A failed creation/binding/batch disables observation for that identity/token until a verified identity change; it never retries business requests. A binding 404 (including a just-deleted case) still permits the action under its owned workflow without claiming a new case association
- `visibilitychange` pauses/resumes dwell. Hidden/pagehide attempts one bounded same-origin, CSRF-authenticated keepalive flush when a workflow already exists. It does not use an unauthenticated beacon or attempt to create a workflow while closing
- Logout/expiry/identity/workspace replacement discards queued data, invalidates old completions and aborts dedicated telemetry calls. No old response can clear or replace a newer workflow
- Rate and queue limits intentionally drop observations. The absence of an event proves nothing about whether the underlying user action occurred

## Evidence and release limits

On 2026-10-07, the focused suite `node --test frontend/lib/journey-telemetry*.test.js` passed 22 tests: nineteen controlled DOM/transport checks and three genuine local HTTP/SQLite checks. The HTTP checks exercise same-origin authentication/CSRF, actual server request correlation and case binding, metadata-only reads, and a real logout followed by telemetry 401 without retries or private-body replay. Synthetic data only; no provider calls.

The isolated candidate also passed `node --check frontend/lib/journey-telemetry.js`, `npm run check`, `npm run build`, all 145 frontend tests and all 264 backend tests. The Vite build still reports its over-500 kB chunk warning; no new runtime dependency was added. These checks reuse the workspace's installed locked dependencies; they are not a fresh dependency-install claim.

Exact-build real-browser navigation, feature wiring, pagehide delivery and mobile timing behavior remain Local QA's responsibility. No browser or deployment pass is claimed here. Backout before integration is simply omitting the observer; after integration remove/disable the shared hooks. No database downgrade is needed because this change has no schema migration.
