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

## Tests and evidence

Run:

```sh
node --test frontend/features/documents/helpers.test.js frontend/features/documents/integration.test.js
```

The helper tests are pure/data and DOM-construction tests. The integration test mounts the actual React feature and shared SessionProvider in JSDOM, against a real disposable Node HTTP server, actual scrypt session and private SQLite file. It covers the confirmation/generation/archive path, exact-body copy/download/print, explicit issue updates, stale 409, conflict-safe editing/reload, and delayed old-case isolation. Clipboard, file-save and print UI effects are captured in the test; the application HTTP responses are real.

This is development DOM plus real API/SQLite evidence. It is not real-browser layout, accessibility, popup/CSP, paid-provider or deployment acceptance. There are no production credentials or records in the fixtures. Source images/binaries and API keys are not persisted by this feature.

Session-expiry restoration uses the shared suspended-draft interface when integrated; the feature must never create a separate browser-storage cache or restore another user's inputs.
