# Documents feature

`index.jsx` exports `DocumentsPage({lang = 'zh', caseId, onDirtyChange, onOpenIntake, active = true})`.

The feature owns readiness, confirmed document details, explicit case questions, immutable document versions, preview and exports. Material import/parsing and source/fact extraction belong to `features/intake`; the optional material button calls `onOpenIntake`. It uses the shared session/API client and official shadcn components without changing shared styles or application state.

## Behavior

- Reads the actual saved case, readiness, versions and conversation metadata
- One confirmation separates core `factChanges` from document `changes`, sends `confirm:true` with the expected case version, and applies the complete returned case
- Confirmed data is reused; unknown optional details do not block generation
- Case questions are changed only by the user's explicit save, including pending/confirmed/resolved state and an optional same-case conversation-message reference
- Final generation calls the actual `/artifacts/generate` endpoint with `status:'final'`; its provenance is the reviewed supplementary template, not a claimed model response
- Preview, copy, download and print use the same body; no legacy draft/de-identification wrapper is added
- Download/print retrieve the immutable saved text and honor a real `ARTIFACT_STALE` response. An old version remains visible as history
- Case-version conflicts preserve inputs. Reload obtains the current server case while retaining unsaved answers, document edits and issue edits for comparison
- Account/case lifetimes have abort controllers and epoch checks. A late old-case result cannot populate the current case
- `active` triggers a read refresh on return from another kept-mounted page. `onDirtyChange` lets App protect case switching
- Printed content is assigned with `textContent`, using only the shared external stylesheet and `article.print-document`; no untrusted HTML, inline script or inline style is inserted
- The promoted App root also exposes the shared official-reference disclosure on this page. Selecting a reference does not confirm a case PHA, add required fields, change readiness or alter generated correspondence. Supplementary templates and official forms remain separate

## Action observations

The optional session-owned journey observer records only the existing `review.confirm`, `draft.generate`, `draft.edit`, `export.copy`, `export.download`, and `export.print` actions. Review and generation are separate outcomes even for the combined button; empty confirmation and readiness-not-ready cannot count as successful completion. Draft editing is observed once at the explicit save-version boundary, never per keystroke. Confirmed mutations finish before independent history refreshes, so a later refresh failure does not rewrite a successful save as a failure.

Only focused, visible review/editor/export controls activate dwell. Leaving the section clears it. A kept-mounted inactive page cannot activate a step, and its layout cleanup does not clear another page's newer focus. App navigation and case/session scope remain authoritative lifetime guards; this feature adds no separate store or browser persistence.

Observation failures cannot change business results. The feature passes only fixed actions, fixed client error classifications and numeric HTTP failure status. No document content, titles, filenames, field values or raw errors enter telemetry. JSON response headers are not exposed by the shared API, so these feature events intentionally have no request correlation; missing IDs are never invented. Feature-owned calls opt out of automatic API observations.

Download success means the application initiated the browser download, not that an OS file was written. Print success means the application invoked the print dialog, not that the user printed or saved a PDF; a blocked or already-closed popup is unsuccessful. Browser, OS, CSP, and actual paper/PDF completion remain outside this evidence.

## Tests and evidence

Run:

```sh
node --test frontend/features/documents/*.test.js
```

The helper tests are pure/data and DOM-construction tests. The integration test mounts the actual React feature and shared SessionProvider in JSDOM, against a real disposable Node HTTP server, actual scrypt session and private SQLite file. It covers the confirmation/generation/archive path, exact-body copy/download/print, explicit issue updates, stale 409, conflict-safe editing/reload, and delayed old-case isolation. Clipboard, file-save and print UI effects are captured in the test; the application HTTP responses are real.

The `realHTTP + controlledDOM` integration additionally reads back actual persisted workflow events for review, generation, save-version and exports, including stale/conflict failures, case binding, absent request correlation and private-content exclusion. `observation.dom.test.js` is separately labeled `controlledDOM`: its real observer and React controls use controlled transports to verify focus/visibility dwell, readiness failures, repeated-click coalescing, navigation/abort isolation, export failures and optional/throwing telemetry. These transport doubles are not HTTP evidence.

This is development DOM plus real API/SQLite evidence. It is not real-browser layout, accessibility, popup/CSP, paid-provider or deployment acceptance. There are no production credentials or records in the fixtures. Source images/binaries and API keys are not persisted by this feature.

The same integration mounts the actual App root against those HTTP routes to verify reference availability in Documents and Materials, Chinese/English labels, collapsed default, official links/cautions, unchanged saved case/readiness after changing references, English-only generated correspondence without invented reference-agency facts, and reset on opening another case. This catches root migration omissions that registry-only unit tests cannot.

Session-expiry restoration uses the shared suspended-draft interface when integrated; the feature must never create a separate browser-storage cache or restore another user's inputs.

The desktop browser scenario is `test/frontend-browser/document-exports.spec.js`.
It is intended for the supported Playwright gate after a production build, with
real synthetic HTTP/SQLite data and no model calls. See the dated validation
entry for whether that scenario actually ran; discovery alone is not browser
acceptance. Its PDF capture checks Chromium rendering, not native dialog or
physical printing completion.
