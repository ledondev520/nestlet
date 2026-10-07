# Materials and fact review

`IntakePage({ lang = 'zh', caseId, onCaseChange, onDirtyChange, importRequest, onImportHandled, onOpenDocuments, active = true })` uses the shared session and official shadcn components. `IntakeWorkspace` is separately exported for controlled development tests, not a separate authentication owner.

## Data flow

1. File selection only queues a bounded number of local Files. A matching chat handoff merges into that queue and is acknowledged once. Account/case mismatch is rejected.
2. **Save privately and process** explicitly persists original bytes via `/api/assets`. No model call is made. TXT/PDF uses verified saved text. CSV is parsed from the original UTF-8 bytes after successful saving because the archive’s CSV search text is tab-normalized. Excel invokes the real bounded `/api/workbook` parser after original saving, then requires an explicit worksheet, row, and distinct column mapping.
3. Images/scanned PDFs remain truthfully saved-without-text; truncated indexing never silently becomes complete case text. Import appends text rather than replacing prior materials. A post-save parsing retry does not upload the original twice.
4. Explicit label organization uses the existing deterministic core function. AI extraction requires the user’s explicit Extract with DeepSeek action and calls `/api/extract`; provider failure leaves facts unchanged. Existing differing facts become visible conflicts. Confirming an unknown is allowed; confirming an unresolved conflict is not.
5. Case saves use a strict CRUD payload whitelist, preserve customer association and draft history, and omit server-owned document context/issues. New-case saves bind the current workspace and associate its saved originals. Reentry refreshes canonical records without replacing local edits. Version conflicts preserve input and offer a visible three-way reconciliation.
6. `useSuspendedDraft('intake')` stores only the approved text snapshot, expected case version, and unassociated original IDs in the shared current-tab vault. Files and draft history are never cached. Same-user version mismatch requires reconciliation. Account change and explicit case switching are owned by App; the module still aborts and epoch-guards its own async work.

## Atomic legacy draft preservation

The integrated backend now atomically preserves invalidated legacy drafts during the ordinary versioned case PUT. Intake carries the old text unchanged, adopts the returned canonical case and archival metadata, and never performs a separate artifact write or clears text speculatively. Late successful responses leave newer local edits intact. Capacity/version failures preserve both server history and current input.

## Verification

Run from the repository root:

    node --test frontend/features/intake/logic.test.js frontend/features/intake/intake.dom.test.js

At 2026-10-07 10:13 UTC, 8 pure and 25 React/jsdom DOM checks passed. They cover bilingual empty states, official component rendering, import consent/bounds, no-OCR/truncation, one-row Excel mapping, CSV bytes, no AI fallback, explicit fact conflicts, optimistic versions, scope/abort races, first-save cross-page binding, queue merging, original-link retries, same-user text recovery, StrictMode replay, and prior-draft preservation. `npm run check` also passed.

API responses and provider calls in DOM checks are controlled doubles. These are not real-provider, production HTTP, browser/CSP, visual-layout, or deployment acceptance. The shared frontend owner is responsible for the integrated build and browser acceptance.

## Action observations

The optional shared journey observer receives fixed names and result flags only. File input/fact-review/save controls activate visible-step timing on focus, not navigation or typing. Each explicit file processing attempt emits one `input.file` observation across private storage and parsing; workbook parser calls suppress duplicate API telemetry. Applying one mapped row emits `input.mapping`; explicitly confirming a fact emits `review.confirm`. Unchecking/editing a field does not emit a confirmation. Case saves are observed once by the shared API. A saved scan without usable text is still a successful original-file operation, not a claim of OCR.

The four controlled React DOM regressions verify those boundaries, suppression, failures, hidden-page behavior and exception isolation. They do not establish real-browser dwell accuracy or delivery. Text paste, manual extraction and AI extraction are not relabeled as unrelated legacy actions. No names, filenames, file contents, source text, mapping values or raw errors are passed to the observer.
