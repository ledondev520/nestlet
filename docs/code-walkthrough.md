# Code and data-flow walkthrough

This is a small JavaScript app, not a framework scaffold. Read the modules in this order: `public/core.js`, `public/app.js`, then `server.js`. Exact code is authoritative if a later change has not yet reached this walkthrough.

## File responsibilities

```text
server.js           HTTP routes, protected PDF/workbook imports, provider/settings calls
auth.js             owner/trial password verification, sessions, role checks and CSRF
storage.js          Node 24 SQLite users/cases, scoped queries and optimistic versions
public/agency-guidance.js bilingual official-source references, unconfirmed acceptance
public/core.js      review gate, drafts, CSV, AI suggestion validation
workbook-worker.js isolated real XLSX/XLS parsing and bounded preview
public/app.js       bilingual interface, current case state, saved-case actions and exports
public/index.html   browser entry point
public/style.css    responsive screen and print presentation
public/logo.svg     provisional brand artwork
test/core.test.js   behavior checks at the exported core interface
test/server.test.js real local HTTP and file-parser checks
test/auth.test.js   authentication/session behavior
test/storage.test.js real SQLite persistence, ownership and schema boundaries
test/case-api.test.js authenticated saved-case API and user isolation
docs/               scope, sources, pilot, collaboration and evidence
```

The backend uses SheetJS for workbooks and an operating-system pdftotext dependency for PDFs. Authenticated HTTPS browser key entry is implemented; the submitted key stays in server process memory, not browser storage or a case database. The SQLite extension persists named trial identities and explicitly saved cases in a dedicated private file; it does not persist provider keys or raw uploaded PDF/workbook binaries. Its final CI/browser/deployment checks are separate from the already staged stateless release. The app is independently deployable; Sites is only a temporary preview.

## Main path

```text
Empty case → pasted text / TXT / CSV / PDF / XLSX / XLS
  → real local parse / workbook selection and mapping
  → app state: reviewed source text
  → POST /api/extract                       [consented deepseek-flash call]
  → five unconfirmed field suggestions + source snippets
  → operator edits / resolves conflicts / confirms each field
  → canDraft(fields)
  → draft(fields, kind)                     [deterministic English template]
  → operator edits the draft
  → copy / TXT download / browser print
  → explicit save to user-scoped SQLite case → later reload/update/delete
```

CSV export is a separate data interchange path through `exportCSV`. Reimport goes through `parseCSV` and creates new text to review; it does not restore a prior confirmation or agency status.

Final contract: no preloaded sample, mock response or silent local-extractor fallback. This behavior is implemented; real-provider verification remains a separate release gate. Explicit manual entry is not a simulated AI result.

## Core contracts

### `extract(text)` — legacy/internal label helper, not final-flow fallback

Recognizes the five known English label prefixes and returns one entry per field. Source lines remain attached. Repeated different values signal a conflict; explicit unknown markers become empty values. This is not a general document reader. It does not understand an entire packet, detect every contradiction or verify facts externally.

### `canDraft(fields)` and `draft(fields, kind)`

The review gate requires the expected fields, valid values, explicit confirmation and no unresolved conflict. A user can review an unknown while leaving it empty; the draft keeps a visible placeholder. A reviewed value means the operator reviewed it, not that the PHA approved it. `draft` rechecks the gate and emits a supported English operator-document template. Core support and UI-exposed draft choices must be verified separately.

### `validateSuggestions(items, text)`

Provider output is untrusted. The validator limits known fields, requires verbatim source grounding and leaves confirmation false. Known labeled conflicts and mismatches must not be silently replaced by an AI value. Syntactic substring evidence does not establish that the value belongs in that field or that the source is truthful. Human review remains necessary.

### `parseCSV(text)` and `exportCSV(fields)`

Import accepts a fixed five-column header and exactly one case, handles quoted cells and rejects malformed shape. Embedded row separators are flattened before turning cells into labeled text. Export quotes cells and adds protective prefixes to spreadsheet-sensitive values. Test actual spreadsheet behavior separately before broader interoperability claims; CSV is not a verified-form export or full review manifest.

## UI state and invalidation

`public/app.js` owns locale, original text, suggested fields, editable draft, mode and error/busy state in memory. Locale is a presentation choice, not a case-data transformation. Changing source input invalidates prior extraction and draft; changing a field invalidates its confirmation and draft. A version token is used around asynchronous work so obsolete responses do not revive a cleared case. Test interrupted and repeated flows in the browser, not just through core tests.

Rendering escapes input before inserting it into HTML. Export must use the intended artifact and preserve required warnings even after manual edits. Browser print is a presentation path, not official PDF form filling. Downloads/clipboard contents outlive app state.

## Optional network path

```text
Operator signs in; browser receives HttpOnly session cookie + CSRF token
  → optional HTTPS Settings save to server-memory key storage
  → browser confirms de-identified text transmission
  → same-origin POST /api/extract with session + CSRF
  → server checks authorization, live enablement, consent and input
  → server attaches its server-held credential
  → DeepSeek JSON response
  → server validates suggestions
  → browser receives unconfirmed facts, never a key
```

`GET /api/status` reports sanitized capabilities, not live account health; provider-configuration details are restricted to the authenticated owner. `/api/login` verifies the configured owner hash or a named trial credential; `/api/logout` invalidates that session. PDF/workbook parsing and extraction require session plus CSRF. Key writes/tests additionally require the configured HTTPS origin. Sessions and browser-saved keys are lost on server restart; an environment-provided key can be loaded again at startup.

`POST /api/settings/test` explicitly checks model access through DeepSeek `/models`, not chat completion. Historical development-double tests are separate from real HTTP/file/browser evidence and cannot prove a successful provider call. The static route allowlist must not expose server code or environment files. The SQLite extension binds every case operation to the session user and restricts provider settings to the owner. These controls have focused tests; they are not independent security certification or production privacy readiness.

## Saved-case path

`GET/POST /api/cases` and `GET/PUT/DELETE /api/cases/:id` operate only on the authenticated session user. Foreign IDs and missing IDs do not reveal another user's records. The backend validates bounded case JSON and uses parameterized SQLite statements. Updates/deletes require the expected version, so a stale tab cannot silently overwrite a newer save. Browser state remains in memory until the user saves; provider keys are excluded from the case payload.

SQLite uses a dedicated application/schema identifier, foreign keys and bounded per-user storage. Unsupported or unrelated schema files fail closed. The database is stored on the task-owned `/data` volume in Docker, and no raw uploaded binary is persisted. Short-lived SQLite journals remain private; account/case rows survive ordinary container recreation. Unexpired schema8 sessions survive restart through hashed records in private SQLite; process-memory provider keys do not.

The private user-run `scripts/setup-trial-user.js` helper creates or rotates one named trial credential after hidden input and final confirmation, preserving its case-owning identity. It grants no owner/provider-settings role. See [SQLite runtime](sqlite-runtime.md) for the isolated Docker handoff and persistence/backup limitations.

## What to inspect when changing behavior

- New field: align the known field list, labels, parsing, provider prompt/schema, UI, draft content and CSV contract; coordinate this shared interface first
- New draft: preserve English boilerplate, factual placeholders, explicit document type and review warning; never imply official approval
- New agency: follow domain-sourcebook.md verification steps before labeling any rule official
- New persistence/integration: requires a separately reviewed privacy, access and authorization design; do not tack it onto transient case state
- Bug fix: reproduce the defect, add a behavior check at the relevant public interface, rerun affected and aggregate checks, then update dated evidence

The diagram and before/after evidence approach is inspired by the credited `show-me` pattern in Matt Pocock's `pr` skill; see skills-guide.md for exact attribution and usage limits.
